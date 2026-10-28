import * as http from 'http';
import { hasEncodedBody } from './content-encoding';

export const UPSTREAM_RESPONSE_TIMEOUT_MESSAGE =
  'Upstream response timed out while streaming response body';

/** Default wait on a CLIProxy upstream request (headers, socket idle, body idle). */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 120_000;
export const UPSTREAM_TIMEOUT_ENV = 'CCS_CLIPROXY_UPSTREAM_TIMEOUT_MS';

/**
 * Upstream timeout for the CLIProxy session proxies, overridable with
 * CCS_CLIPROXY_UPSTREAM_TIMEOUT_MS (positive integer milliseconds). The default
 * can cut off a valid slow first byte, e.g. while CLIProxy retries credentials
 * or a long prompt is queued, well before Claude Code's own 600 s client timeout.
 * Invalid values fall back to the default.
 */
export function resolveUpstreamTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[UPSTREAM_TIMEOUT_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_UPSTREAM_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

export function buildTimeoutSafeResponseHeaders(
  headers: http.IncomingHttpHeaders
): http.OutgoingHttpHeaders {
  const safeHeaders: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (normalized === 'content-length' || normalized === 'transfer-encoding') {
      continue;
    }
    safeHeaders[name] = value;
  }
  return safeHeaders;
}

export function writeForwardResponseHead(
  clientRes: http.ServerResponse,
  statusCode: number,
  headers: http.IncomingHttpHeaders
): void {
  if (clientRes.headersSent) return;
  clientRes.writeHead(statusCode, buildTimeoutSafeResponseHeaders(headers));
}

export function writeTimeoutResponse(
  clientRes: http.ServerResponse,
  headers: http.IncomingHttpHeaders,
  message = UPSTREAM_RESPONSE_TIMEOUT_MESSAGE
): void {
  if (clientRes.destroyed || clientRes.writableEnded) return;

  const contentType = String(headers['content-type'] ?? '').toLowerCase();

  try {
    if (clientRes.headersSent && hasEncodedBody(headers)) {
      // A plain-text error appended to a compressed body would surface as a
      // decompression error; reset the connection so the client sees the failure.
      clientRes.destroy();
      return;
    }
    if (contentType.includes('text/event-stream')) {
      const payload = {
        type: 'error',
        error: {
          type: 'timeout_error',
          message,
        },
      };
      clientRes.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`);
    } else if (!clientRes.headersSent) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json' });
      clientRes.write(JSON.stringify({ error: message }));
    } else {
      clientRes.write(`\n${JSON.stringify({ error: message })}`);
    }

    clientRes.end();
  } catch {
    // Client may have disconnected while the upstream response was stalled.
  }
}

export function attachUpstreamResponseTimeout(options: {
  upstreamReq: http.ClientRequest;
  upstreamRes: http.IncomingMessage;
  clientRes: http.ServerResponse;
  timeoutMs: number;
  onTimeout?: (error: Error) => void;
}): () => void {
  const { upstreamReq, upstreamRes, clientRes, timeoutMs, onTimeout } = options;
  let settled = false;

  const clear = () => {
    settled = true;
    // Under Node, keep-alive agents detach the socket from the IncomingMessage
    // before user 'end' listeners run, so upstreamRes.socket is null here and
    // Node's unguarded IncomingMessage.setTimeout() would throw an uncaught
    // TypeError that kills the whole proxy process. The detached socket has no
    // pending timer to clear (Agent#keepSocketAlive resets it), so skipping is safe.
    if (upstreamRes.socket) {
      upstreamRes.setTimeout(0);
    }
  };

  upstreamRes.setTimeout(timeoutMs, () => {
    if (settled) return;
    settled = true;
    const error = new Error(UPSTREAM_RESPONSE_TIMEOUT_MESSAGE);
    writeTimeoutResponse(clientRes, upstreamRes.headers, error.message);
    onTimeout?.(error);
    upstreamRes.destroy(error);
    upstreamReq.destroy(error);
  });

  return clear;
}
