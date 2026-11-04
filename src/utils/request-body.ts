/**
 * Bounded request-body reader shared by the local CCS proxies.
 *
 * An oversized body must end in an HTTP 413, never a reset socket. A reset
 * reaches Claude Code as a bare ECONNRESET that it retries silently for
 * minutes. So past the limit we stop buffering but keep draining the body,
 * and only give up on the connection once it passes DRAIN_CAP_MULTIPLIER
 * times the limit.
 */

import type * as http from 'http';
import { createLogger, type Logger } from '../services/logging';

export const MAX_BODY_ENV_VAR = 'CCS_PROXY_MAX_BODY_MB';
/** Matches the Anthropic Messages API request size limit (32 MB). */
export const DEFAULT_MAX_BODY_MB = 32;
export const REQUEST_TOO_LARGE_ERROR_TYPE = 'request_too_large';

const MAX_ALLOWED_BODY_MB = 1024;
const DRAIN_CAP_MULTIPLIER = 4;
const BYTES_PER_MB = 1024 * 1024;

const logger = createLogger('proxy:request-body');
let lastInvalidLimitValue: string | undefined;

function formatMb(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export class RequestBodyTooLargeError extends Error {
  readonly receivedBytes: number;
  readonly limitBytes: number;
  /** True when the whole body was read, so the connection can stay open. */
  readonly drained: boolean;

  constructor(receivedBytes: number, limitBytes: number, drained: boolean) {
    const size = drained
      ? `Request is ${formatMb(receivedBytes)} MB`
      : `Request is over ${formatMb(receivedBytes)} MB`;
    super(
      `${size}, over the ${formatMb(limitBytes)} MB limit of the local ccs proxy ` +
        `(${MAX_BODY_ENV_VAR}). Run /compact or start a new session.`
    );
    this.name = 'RequestBodyTooLargeError';
    this.receivedBytes = receivedBytes;
    this.limitBytes = limitBytes;
    this.drained = drained;
  }
}

/**
 * Resolve the body limit from CCS_PROXY_MAX_BODY_MB (MiB, 0 < n <= 1024).
 * Invalid values fall back to the default and log one warning per value.
 */
export function resolveMaxBodyBytes(env: NodeJS.ProcessEnv = process.env): number {
  const defaultBytes = DEFAULT_MAX_BODY_MB * BYTES_PER_MB;
  const raw = env[MAX_BODY_ENV_VAR]?.trim();
  if (!raw) return defaultBytes;

  const mb = Number(raw);
  if (Number.isFinite(mb) && mb > 0 && mb <= MAX_ALLOWED_BODY_MB) {
    return Math.floor(mb * BYTES_PER_MB);
  }

  if (lastInvalidLimitValue !== raw) {
    lastInvalidLimitValue = raw;
    logger.warn(
      'request-body.invalid-limit',
      `Ignoring ${MAX_BODY_ENV_VAR}="${raw}": expected a number of MB above 0 and at most ` +
        `${MAX_ALLOWED_BODY_MB}. Using ${DEFAULT_MAX_BODY_MB} MB.`,
      { value: raw, defaultMb: DEFAULT_MAX_BODY_MB }
    );
  }
  return defaultBytes;
}

/**
 * Read the request body as UTF-8. Rejects with RequestBodyTooLargeError when
 * it exceeds `limitBytes`; the socket is never destroyed here.
 */
export function readRequestBody(
  req: http.IncomingMessage,
  limitBytes: number = resolveMaxBodyBytes()
): Promise<string> {
  const drainCapBytes = limitBytes * DRAIN_CAP_MULTIPLIER;

  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = [];
    let total = 0;

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('close', onClose);
    };

    const onData = (chunk: Buffer) => {
      total += chunk.length;
      if (total <= limitBytes) {
        chunks.push(chunk);
        return;
      }
      // Over the limit: free the buffer and keep draining so we can answer 413.
      chunks = [];
      if (total > drainCapBytes) {
        cleanup();
        // Keep the stream flowing so leftover bytes are discarded, not stalled.
        req.resume();
        reject(new RequestBodyTooLargeError(total, limitBytes, false));
      }
    };

    const onEnd = () => {
      cleanup();
      if (total > limitBytes) {
        reject(new RequestBodyTooLargeError(total, limitBytes, true));
        return;
      }
      resolve(Buffer.concat(chunks, total).toString('utf8'));
    };

    const onError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const onClose = () => {
      cleanup();
      reject(new Error('Request closed before the body was fully received'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

/** Log an oversized request at warn level: size, limit and path, never the body. */
export function logRequestTooLarge(
  log: Logger,
  req: http.IncomingMessage,
  error: RequestBodyTooLargeError
): void {
  log.warn('request.body-too-large', error.message, {
    method: req.method,
    path: req.url,
    receivedBytes: error.receivedBytes,
    limitBytes: error.limitBytes,
    drained: error.drained,
  });
}

/** Log the oversized request and answer it with an Anthropic-shaped 413. */
export function respondRequestTooLarge(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  error: RequestBodyTooLargeError,
  log: Logger
): void {
  logRequestTooLarge(log, req, error);
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // The rest of the body is still on the wire; ask the client to drop the connection.
  if (!error.drained) headers.Connection = 'close';
  res.writeHead(413, headers);
  res.end(
    JSON.stringify({
      type: 'error',
      error: { type: REQUEST_TOO_LARGE_ERROR_TYPE, message: error.message },
    })
  );
}
