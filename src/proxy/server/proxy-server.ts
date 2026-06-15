import * as http from 'http';
import { randomUUID } from 'crypto';
import { Agent } from 'undici';
import type { OpenAICompatProfileConfig } from '../profile-router';
import { OPENAI_COMPAT_PROXY_SERVICE_NAME } from '../proxy-daemon-paths';
import { createLogger, withRequestContext } from '../../services/logging';
import {
  buildUpstreamAgentTimeouts,
  handleProxyMessagesRequest,
  handleProxyModelsRequest,
  validateIncomingProxyAuth,
} from './messages-route';
import { writeJson } from './http-helpers';

const REQUEST_ID_HEADER = 'x-ccs-request-id';
// Loose UUID-ish guard: accepts UUIDs and similar opaque ids; rejects empty / control chars.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

function resolveInboundRequestId(headers: http.IncomingHttpHeaders): string {
  const raw = headers[REQUEST_ID_HEADER];
  if (typeof raw === 'string' && REQUEST_ID_PATTERN.test(raw.trim())) {
    return raw.trim();
  }
  return randomUUID();
}

export interface OpenAICompatProxyServerOptions {
  profile: OpenAICompatProfileConfig;
  host?: string;
  port: number;
  authToken: string;
  insecure?: boolean;
}

export function startOpenAICompatProxyServer(options: OpenAICompatProxyServerOptions): http.Server {
  const host = options.host?.trim() || '127.0.0.1';
  const logger = createLogger('proxy:openai-compat', {
    profileName: options.profile.profileName,
    host,
    port: options.port,
  });
  const insecureDispatcher = options.insecure
    ? new Agent({ connect: { rejectUnauthorized: false }, ...buildUpstreamAgentTimeouts() })
    : undefined;
  const server = http.createServer((req, res) => {
    const requestId = resolveInboundRequestId(req.headers);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    void withRequestContext({ requestId }, async () => {
      const method = req.method || 'GET';
      const requestUrl = req.url || '/';
      const parsedUrl = new URL(requestUrl, 'http://127.0.0.1');
      const pathname =
        parsedUrl.pathname.length > 1 ? parsedUrl.pathname.replace(/\/+$/, '') : parsedUrl.pathname;
      await handleProxyRequest(req, res, method, pathname);
    });
  });

  async function handleProxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    pathname: string
  ): Promise<void> {
    if ((method === 'GET' || method === 'HEAD') && pathname === '/health') {
      if (method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
      } else {
        writeJson(res, 200, {
          ok: true,
          service: OPENAI_COMPAT_PROXY_SERVICE_NAME,
          host,
          profile: options.profile.profileName,
          port: options.port,
        });
      }
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/') {
      if (method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
      } else {
        writeJson(res, 200, {
          ok: true,
          service: OPENAI_COMPAT_PROXY_SERVICE_NAME,
          bind: {
            host,
            port: options.port,
          },
          profile: {
            name: options.profile.profileName,
            provider: options.profile.provider,
            model: options.profile.model || null,
          },
          endpoints: ['/health', '/v1/messages', '/v1/models'],
        });
      }
      return;
    }

    if (method === 'GET' && pathname === '/v1/models') {
      if (!validateIncomingProxyAuth(req.headers, options.authToken)) {
        writeJson(res, 401, {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Missing or invalid local proxy token',
          },
        });
        return;
      }
      handleProxyModelsRequest(res, options.profile);
      return;
    }

    if (method === 'POST' && pathname === '/v1/messages') {
      await handleProxyMessagesRequest(
        req,
        res,
        options.profile,
        options.authToken,
        insecureDispatcher
      );
      return;
    }

    logger.warn('http.not_found', 'Rejected unknown proxy route', {
      method,
      pathname,
    });
    writeJson(res, 404, { error: 'Not found' });
  }

  logger.info('server.start', 'OpenAI-compatible proxy server listening', {
    baseUrl: `http://${host}:${options.port}`,
  });
  server.on('close', () => {
    logger.info('server.stop', 'OpenAI-compatible proxy server stopped');
    void insecureDispatcher?.close();
  });

  server.listen(options.port, host);
  return server;
}
