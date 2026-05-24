import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../services/logging';

const logger = createLogger('web-server:http');

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startTime = Date.now();
  res.locals.ccsRequestId = requestId;
  res.setHeader('x-ccs-request-id', requestId);
  const shouldSkipLogging = req.originalUrl.startsWith('/api/logs');
  const shouldLogResponse = () => res.statusCode < 400;

  res.on('finish', () => {
    if (shouldSkipLogging || !shouldLogResponse()) {
      return;
    }
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

  next();
}
