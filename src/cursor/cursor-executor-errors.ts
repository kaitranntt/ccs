/**
 * Cursor Executor error mapping and JSON/HTTP error response builders.
 */

import { CursorConnectFrameError, mapCursorConnectError } from './cursor-stream-parser.js';

export interface CursorExecutorErrorPayload {
  message: string;
  status: number;
  errorType: string;
  code: string;
}

export function toCursorErrorPayloadFromJson(jsonError: {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ debug?: { details?: { title?: string; detail?: string }; error?: string } }>;
  };
}): CursorExecutorErrorPayload {
  const errorMsg =
    jsonError?.error?.details?.[0]?.debug?.details?.title ||
    jsonError?.error?.details?.[0]?.debug?.details?.detail ||
    jsonError?.error?.message ||
    'API Error';

  const mappedError = mapCursorConnectError(jsonError?.error?.code);

  return {
    message: errorMsg,
    status: mappedError.status,
    errorType: mappedError.errorType,
    code: jsonError?.error?.details?.[0]?.debug?.error || 'unknown',
  };
}

export function buildCursorErrorEnvelope(error: CursorExecutorErrorPayload): string {
  return JSON.stringify({
    error: {
      message: error.message,
      type: error.errorType,
      code: error.code,
      status: error.status,
    },
  });
}

export function createCursorErrorResponse(error: CursorExecutorErrorPayload): Response {
  return new Response(buildCursorErrorEnvelope(error), {
    status: error.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function toCursorExecutorErrorPayload(error: unknown): CursorExecutorErrorPayload {
  if (error instanceof CursorConnectFrameError) {
    return {
      message: error.message,
      status: error.status,
      errorType: error.errorType,
      code: 'cursor_protocol_error',
    };
  }

  return {
    message: error instanceof Error ? error.message : 'Cursor streaming failed.',
    status: 502,
    errorType: 'server_error',
    code: 'cursor_error',
  };
}

export function createUpstreamStatusErrorResponse(
  status: number,
  errorText: string,
  map429ToRateLimit = false
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: `[${status}]: ${errorText}`,
        type: map429ToRateLimit && status === 429 ? 'rate_limit_error' : 'invalid_request_error',
        code: '',
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
