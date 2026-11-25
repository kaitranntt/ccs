/**
 * Tool Sanitization Proxy Request Forwarders
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import type { Logger } from '../../../services/logging';
import { ToolNameMapper, type ContentBlock } from '../../ai-providers/tool-name-mapper';
import {
  attachUpstreamResponseTimeout,
  writeForwardResponseHead,
} from '../upstream-response-timeout';
import { hasEncodedBody, setUpstreamAcceptEncoding } from '../content-encoding';
import { isRecord, type ToolSanitizationProxyConfig } from './request-sanitizer';
import { pipeStreamingSseResponse, warnEncodedPassthrough } from './sse-stream-processor';

export function attachClientCloseAbort(
  originalReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  onAbort: () => void
): () => void {
  let detached = false;

  const handleDisconnect = () => {
    if (detached || clientRes.writableEnded) {
      return;
    }
    detached = true;
    onAbort();
  };

  const onReqClose = () => {
    if (!originalReq.complete) {
      handleDisconnect();
    }
  };

  originalReq.once('aborted', handleDisconnect);
  originalReq.once('close', onReqClose);
  clientRes.once('close', handleDisconnect);

  return () => {
    detached = true;
    originalReq.removeListener('aborted', handleDisconnect);
    originalReq.removeListener('close', onReqClose);
    clientRes.removeListener('close', handleDisconnect);
  };
}

function buildForwardHeaders(
  originalHeaders: http.IncomingHttpHeaders,
  bodyString?: string
): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  const hopByHop = new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'upgrade',
  ]);

  for (const [key, value] of Object.entries(originalHeaders)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (hopByHop.has(lower)) continue;
    headers[key] = value;
  }
  setUpstreamAcceptEncoding(headers);

  if (bodyString !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyString);
  }

  return headers;
}

function getRequestFn(url: URL): typeof http.request | typeof https.request {
  return url.protocol === 'https:' ? https.request : http.request;
}

function startResponseTimeout(upstreamReq: http.ClientRequest, timeoutMs: number): () => void {
  const deadline = setTimeout(() => {
    upstreamReq.destroy(new Error('Upstream request timeout'));
  }, timeoutMs);
  upstreamReq.setTimeout(timeoutMs, () => {
    upstreamReq.destroy(new Error('Upstream request timeout'));
  });
  return () => clearTimeout(deadline);
}

function buildRequestOptions(
  upstreamUrl: URL,
  method: string | undefined,
  headers: http.OutgoingHttpHeaders,
  config: Required<ToolSanitizationProxyConfig>
): https.RequestOptions {
  const options: https.RequestOptions = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: upstreamUrl.pathname + upstreamUrl.search,
    method,
    timeout: config.timeoutMs,
    headers,
  };

  if (upstreamUrl.protocol === 'https:' && config.allowSelfSigned) {
    options.rejectUnauthorized = false;
  }

  return options;
}

function executeUpstreamRequest(
  originalReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  upstreamUrl: URL,
  config: Required<ToolSanitizationProxyConfig>,
  bodyString: string | undefined,
  onUpstreamResponse: (
    upstreamRes: http.IncomingMessage,
    helpers: {
      isSettled: () => boolean;
      settleResolve: () => void;
      settleReject: (err: unknown) => void;
    }
  ) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestFn = getRequestFn(upstreamUrl);
    let settled = false;
    let clearResponseTimeout: () => void = () => undefined;
    let clearUpstreamResponseTimeout: () => void = () => undefined;
    let activeUpstreamRes: http.IncomingMessage | null = null;
    let cleanupClientClose: () => void = () => undefined;

    const isSettled = () => settled;

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      clearResponseTimeout();
      clearUpstreamResponseTimeout();
      cleanupClientClose();
      resolve();
    };

    const settleReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearResponseTimeout();
      clearUpstreamResponseTimeout();
      cleanupClientClose();
      reject(err);
    };

    const upstreamReq = requestFn(
      buildRequestOptions(
        upstreamUrl,
        originalReq.method,
        buildForwardHeaders(originalReq.headers, bodyString),
        config
      ),
      (upstreamRes) => {
        clearResponseTimeout();
        activeUpstreamRes = upstreamRes;
        clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
          upstreamReq,
          upstreamRes,
          clientRes,
          timeoutMs: config.timeoutMs,
          onTimeout: () => settleResolve(),
        });
        onUpstreamResponse(upstreamRes, { isSettled, settleResolve, settleReject });
      }
    );

    cleanupClientClose = attachClientCloseAbort(originalReq, clientRes, () => {
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy();
      } else if (activeUpstreamRes && !activeUpstreamRes.destroyed) {
        activeUpstreamRes.destroy();
      }
      settleResolve();
    });

    clearResponseTimeout = startResponseTimeout(upstreamReq, config.timeoutMs);
    upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
    upstreamReq.on('error', (err) => settleReject(err));

    if (bodyString !== undefined) {
      upstreamReq.write(bodyString);
      upstreamReq.end();
    } else {
      originalReq.pipe(upstreamReq);
    }
  });
}

export function forwardRaw(
  originalReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  upstreamUrl: URL,
  config: Required<ToolSanitizationProxyConfig>
): Promise<void> {
  return executeUpstreamRequest(
    originalReq,
    clientRes,
    upstreamUrl,
    config,
    undefined,
    (upstreamRes, { isSettled, settleResolve, settleReject }) => {
      const statusCode = upstreamRes.statusCode || 200;
      let responseStarted = false;
      const writeResponseHead = () => {
        if (responseStarted) return;
        responseStarted = true;
        writeForwardResponseHead(clientRes, statusCode, upstreamRes.headers);
      };
      upstreamRes.on('data', (chunk: Buffer) => {
        if (isSettled()) return;
        writeResponseHead();
        const canContinue = clientRes.write(chunk);
        if (!canContinue) {
          upstreamRes.pause();
          clientRes.once('drain', () => upstreamRes.resume());
        }
      });
      upstreamRes.on('end', () => {
        writeResponseHead();
        clientRes.end();
        settleResolve();
      });
      upstreamRes.on('error', (error) => settleReject(error));
    }
  );
}

export function forwardJsonBuffered(
  originalReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  upstreamUrl: URL,
  body: unknown,
  mapper: ToolNameMapper,
  config: Required<ToolSanitizationProxyConfig>,
  logger: Logger
): Promise<void> {
  return executeUpstreamRequest(
    originalReq,
    clientRes,
    upstreamUrl,
    config,
    JSON.stringify(body),
    (upstreamRes, { isSettled, settleResolve, settleReject }) => {
      const chunks: Buffer[] = [];
      upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        if (isSettled()) return;
        try {
          const rawBody = Buffer.concat(chunks);
          if (hasEncodedBody(upstreamRes.headers)) {
            warnEncodedPassthrough(logger, upstreamRes.headers);
            const headers = { ...upstreamRes.headers };
            delete headers['transfer-encoding'];
            headers['content-length'] = String(rawBody.length);
            clientRes.writeHead(upstreamRes.statusCode || 200, headers);
            clientRes.end(rawBody);
            settleResolve();
            return;
          }

          const responseBody = rawBody.toString('utf8');
          const contentType = upstreamRes.headers['content-type'] || '';

          if (contentType.includes('application/json') && mapper.hasChanges()) {
            try {
              const parsed = JSON.parse(responseBody);
              if (isRecord(parsed) && Array.isArray(parsed.content)) {
                parsed.content = mapper.restoreToolUse(parsed.content as ContentBlock[]);
                const modifiedResponse = JSON.stringify(parsed);

                const headers = { ...upstreamRes.headers };
                delete headers['transfer-encoding'];
                headers['content-length'] = String(Buffer.byteLength(modifiedResponse));

                clientRes.writeHead(upstreamRes.statusCode || 200, headers);
                clientRes.end(modifiedResponse);
                settleResolve();
                return;
              }
            } catch {
              // JSON parse failed, pass through unchanged
            }
          }

          const headers = { ...upstreamRes.headers };
          delete headers['transfer-encoding'];
          headers['content-length'] = String(Buffer.byteLength(responseBody));
          clientRes.writeHead(upstreamRes.statusCode || 200, headers);
          clientRes.end(responseBody);
          settleResolve();
        } catch (err) {
          settleReject(err);
        }
      });
      upstreamRes.on('error', (error) => settleReject(error));
    }
  );
}

export function forwardJsonStreaming(
  originalReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  upstreamUrl: URL,
  body: unknown,
  mapper: ToolNameMapper,
  config: Required<ToolSanitizationProxyConfig>,
  logger: Logger
): Promise<void> {
  return executeUpstreamRequest(
    originalReq,
    clientRes,
    upstreamUrl,
    config,
    JSON.stringify(body),
    (upstreamRes, { isSettled, settleResolve, settleReject }) => {
      writeForwardResponseHead(clientRes, upstreamRes.statusCode || 200, upstreamRes.headers);
      pipeStreamingSseResponse({
        upstreamRes,
        clientRes,
        mapper,
        logger,
        isSettled,
        settleResolve,
        settleReject,
      });
    }
  );
}
