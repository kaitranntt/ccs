import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger, withRequestContext } from '../../services/logging';

const logger = createLogger('web-server:http');

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startTime = Date.now();
  res.locals.ccsRequestId = requestId;
  res.setHeader('x-ccs-request-id', requestId);
  const shouldSkipLogging = req.originalUrl.startsWith('/api/logs');

  res.on('finish', () => {
    if (shouldSkipLogging) {
      return;
    }
    withRequestContext({ requestId }, () => {
      logger.info('request.completed', 'Dashboard request completed', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime,
        remoteAddress: req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      });
    });
  });

  // Wrap the downstream handler chain so structured logs emitted by route
  // handlers carry the requestId (the logger auto-attaches it from the active
  // request context). Mirrors src/proxy/server/proxy-server.ts.
  withRequestContext({ requestId }, () => next());
}
