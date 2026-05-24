/**
 * CLIProxy Local Reverse Proxy
 *
 * Proxies requests from the dashboard to the local CLIProxy service
 * running on 127.0.0.1 inside the same host/container.
 *
 * Mounted at: /api/cliproxy-local/*  ->  http://127.0.0.1:{port}/*
 */

import http from 'http';
import { Request, Response, Router } from 'express';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

export interface CliproxyLocalProxyDeps {
  enforceAccess?: (req: Request, res: Response) => boolean;
  request?: typeof http.request;
  resolveTargetPort?: () => number;
}

/** Proxy request timeout in milliseconds (30 seconds) */
const PROXY_TIMEOUT_MS = 30_000;

function isJsonContentType(contentType: string | string[] | undefined): boolean {
  const values = Array.isArray(contentType) ? contentType : [contentType];
  return values.some((value) => value?.toLowerCase().includes('application/json') === true);
}

function buildProxyBody(req: Request): Buffer | undefined {
  // If express.json() parsed the body (content-type is JSON and req.body is populated),
  // re-serialize it since the original request stream was consumed by the middleware.
  if (
    !isJsonContentType(req.headers['content-type']) ||
    req.body === undefined ||
    req.body === null
  ) {
    return undefined;
  }

  // express.json() sets req.body to the parsed value — re-serialize for the proxy target
  return Buffer.from(JSON.stringify(req.body));
}

function buildProxyHeaders(
  headers: http.IncomingHttpHeaders,
  port: number,
  bodyBuffer?: Buffer
): http.IncomingHttpHeaders {
  const proxyHeaders: http.IncomingHttpHeaders = {
    ...headers,
    host: `127.0.0.1:${port}`,
  };

  delete proxyHeaders.connection;

  if (bodyBuffer) {
    delete proxyHeaders['transfer-encoding'];
    proxyHeaders['content-length'] = String(bodyBuffer.length);
  }

  return proxyHeaders;
}

export function createCliproxyLocalProxyRouter(deps: CliproxyLocalProxyDeps = {}): Router {
  const router = Router();
  const enforceAccess =
    deps.enforceAccess ??
    ((req: Request, res: Response) =>
      requireLocalAccessWhenAuthDisabled(
        req,
        res,
        'CLIProxy local proxy requires localhost access when dashboard auth is disabled.'
      ));
  const createRequest = deps.request ?? http.request;
  const resolveTargetPort = deps.resolveTargetPort ?? resolveLifecyclePort;

  router.use((req: Request, res: Response, next) => {
    if (enforceAccess(req, res)) {
      next();
    }
  });

  router.all('/*', (req: Request, res: Response) => {
    const targetPort = resolveTargetPort();
    const targetPath = req.url || '/';
    const bodyBuffer = buildProxyBody(req);

    const proxyReq = createRequest(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers: buildProxyHeaders(req.headers, targetPort, bodyBuffer),
        timeout: PROXY_TIMEOUT_MS,
      },
      (proxyRes) => {
        const proxyStatus = proxyRes.statusCode ?? 502;
        const proxyContentLength = proxyRes.headers['content-length'];
        const hasEmptyBody =
          typeof proxyContentLength === 'string' && Number.parseInt(proxyContentLength, 10) === 0;
        const isSyntheticUnreachableResponse =
          proxyStatus === 502 &&
          proxyRes.headers['content-type'] === undefined &&
          proxyRes.headers['proxy-connection'] !== undefined &&
          hasEmptyBody;

        if (isSyntheticUnreachableResponse) {
          const payload = JSON.stringify({ error: 'CLIProxy is not reachable' });
          res.writeHead(502, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': String(Buffer.byteLength(payload)),
          });
          res.end(payload);
          return;
        }

        res.writeHead(proxyStatus, proxyRes.headers);
        // Manual streaming instead of pipe() for Bun runtime compatibility.
        // Explicitly honor downstream backpressure to avoid unbounded buffering.
        const onDrain = () => proxyRes.resume();

        proxyRes.on('data', (chunk: Buffer) => {
          const canContinue = res.write(chunk);
          if (!canContinue) {
            proxyRes.pause();
            res.once('drain', onDrain);
          }
        });

        proxyRes.on('end', () => {
          res.off('drain', onDrain);
          res.end();
        });
      }
    );

    proxyReq.on('timeout', () => proxyReq.destroy());

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        const payload = JSON.stringify({ error: 'CLIProxy is not reachable' });
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(payload));
        res.end(payload);
      }
    });

    const cleanupProxyRequest = () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    };

    // Request-abort cleanup covers disconnects before the response starts.
    req.on('aborted', cleanupProxyRequest);

    // Response close cleanup covers disconnects while streaming the proxied response.
    // Guard on writableEnded/finished so successful proxy completions are untouched.
    res.on('close', () => {
      if (!res.writableEnded || !res.finished) {
        cleanupProxyRequest();
      }
    });

    if (bodyBuffer) {
      proxyReq.end(bodyBuffer);
      return;
    }

    // For methods without a body (GET, HEAD, etc.) or when express.json()
    // has already consumed the stream, end the request immediately.
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (!hasBody) {
      proxyReq.end();
      return;
    }

    req.pipe(proxyReq, { end: true });
  });

  return router;
}

export default createCliproxyLocalProxyRouter();
