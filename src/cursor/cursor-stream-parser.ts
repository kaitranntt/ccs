/**
 * Cursor Streaming Frame Parser
 * Incrementally parses ConnectRPC frames from arbitrary chunk boundaries
 */

import * as zlib from 'zlib';
import {
  hasUnknownConnectFrameFlags,
  isCompressedConnectFrame,
  isEndStreamConnectFrame,
} from './cursor-protobuf-schema.js';
import { extractTextFromResponse } from './cursor-protobuf-decoder.js';

/** Frame parsing result types */
export type FrameResult =
  | { type: 'error'; message: string; status: number; errorType: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'toolCall';
      toolCall: {
        id: string;
        type: string;
        function: { name: string; arguments: string };
        isLast: boolean;
      };
    };

export class CursorConnectFrameError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly errorType = 'server_error'
  ) {
    super(message);
    this.name = 'CursorConnectFrameError';
  }
}

export function mapCursorConnectError(code?: string): { status: number; errorType: string } {
  switch (code?.toLowerCase()) {
    case 'resource_exhausted':
      return { status: 429, errorType: 'rate_limit_error' };
    case 'unauthenticated':
      return { status: 401, errorType: 'authentication_error' };
    case 'permission_denied':
      return { status: 403, errorType: 'permission_error' };
    case 'not_found':
      return { status: 404, errorType: 'api_error' };
    case 'already_exists':
    case 'aborted':
      return { status: 409, errorType: 'api_error' };
    case 'deadline_exceeded':
      return { status: 504, errorType: 'api_error' };
    case 'unimplemented':
      return { status: 501, errorType: 'api_error' };
    case 'unavailable':
      return { status: 503, errorType: 'api_error' };
    case 'invalid_argument':
    case 'failed_precondition':
    case 'out_of_range':
      return { status: 400, errorType: 'api_error' };
    default:
      return { status: 500, errorType: 'api_error' };
  }
}

function formatConnectFrameFlags(flags: number): string {
  return `0x${flags.toString(16).padStart(2, '0')}`;
}

function toFrameErrorResult(error: unknown): Extract<FrameResult, { type: 'error' }> {
  if (error instanceof CursorConnectFrameError) {
    return {
      type: 'error',
      message: error.message,
      status: error.status,
      errorType: error.errorType,
    };
  }

  return {
    type: 'error',
    message: error instanceof Error ? error.message : 'Cursor stream parsing failed.',
    status: 502,
    errorType: 'server_error',
  };
}

function createTruncatedFrameError(): CursorConnectFrameError {
  return new CursorConnectFrameError('Truncated Cursor ConnectRPC frame.', 502, 'server_error');
}

/**
 * Decompress payload if gzip-compressed.
 * Skips decompression for JSON error payloads.
 * NOTE: Uses synchronous gzip for single-request CLI tool. Async not warranted for small payloads.
 */
export function decompressPayload(payload: Buffer, flags: number): Buffer {
  if (hasUnknownConnectFrameFlags(flags)) {
    throw new CursorConnectFrameError(
      `Unsupported ConnectRPC frame flags: ${formatConnectFrameFlags(flags)}`,
      502,
      'server_error'
    );
  }

  if (payload.length > 10 && payload[0] === 0x7b && payload[1] === 0x22) {
    try {
      const text = payload.toString('utf-8');
      if (text.startsWith('{"error"')) return payload;
    } catch {
      // Not JSON, continue
    }
  }

  if (isCompressedConnectFrame(flags)) {
    try {
      return zlib.gunzipSync(payload);
    } catch (err) {
      if (process.env.CCS_DEBUG) {
        console.error('[cursor] gzip decompression failed:', err);
      }
      throw new CursorConnectFrameError(
        'Failed to decompress Cursor ConnectRPC frame.',
        502,
        'server_error'
      );
    }
  }
  return payload;
}

/**
 * Incrementally parses ConnectRPC frames from arbitrary chunk boundaries.
 *
 * Usage:
 *   const parser = new StreamingFrameParser();
 *   req.on('data', (chunk) => {
 *     for (const frame of parser.push(chunk)) { handle(frame); }
 *   });
 */
export class StreamingFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  /** Feed a new chunk. Returns zero or more parsed frames. */
  push(chunk: Buffer): FrameResult[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const results: FrameResult[] = [];

    while (this.buffer.length >= 5) {
      const length = this.buffer.readUInt32BE(1);
      const frameSize = 5 + length;
      if (this.buffer.length < frameSize) break;

      const flags = this.buffer[0];
      let payload: Buffer = this.buffer.slice(5, frameSize);
      this.buffer = this.buffer.slice(frameSize);

      try {
        payload = decompressPayload(payload, flags);
      } catch (error) {
        results.push(toFrameErrorResult(error));
        return results;
      }

      if (isEndStreamConnectFrame(flags)) {
        try {
          const text = payload.toString('utf-8');
          const json = JSON.parse(text) as {
            error?: {
              code?: string;
              message?: string;
              details?: Array<{
                debug?: { details?: { title?: string; detail?: string }; error?: string };
              }>;
            };
          };

          const msg =
            json?.error?.details?.[0]?.debug?.details?.title ||
            json?.error?.details?.[0]?.debug?.details?.detail ||
            json?.error?.message;

          if (msg) {
            const mappedError = mapCursorConnectError(json?.error?.code);
            results.push({
              type: 'error',
              message: msg,
              status: mappedError.status,
              errorType: mappedError.errorType,
            });
            return results;
          }
        } catch {
          // Ignore successful end-stream metadata trailers.
        }
        continue;
      }

      // Check for JSON error
      try {
        const text = payload.toString('utf-8');
        if (text.startsWith('{') && text.includes('"error"')) {
          const json = JSON.parse(text);
          const msg =
            json?.error?.details?.[0]?.debug?.details?.title ||
            json?.error?.details?.[0]?.debug?.details?.detail ||
            json?.error?.message ||
            'API Error';
          const mappedError = mapCursorConnectError(json?.error?.code);
          results.push({
            type: 'error',
            message: msg,
            status: mappedError.status,
            errorType: mappedError.errorType,
          });
          return results;
        }
      } catch {
        // Not JSON, continue to protobuf parsing
      }

      const result = extractTextFromResponse(new Uint8Array(payload));

      if (result.error) {
        const errorLower = result.error.toLowerCase();
        const isRateLimit =
          errorLower.includes('rate limit') ||
          errorLower.includes('resource_exhausted') ||
          errorLower.includes('too many requests');
        results.push({
          type: 'error',
          message: result.error,
          status: isRateLimit ? 429 : 502,
          errorType: isRateLimit ? 'rate_limit_error' : 'server_error',
        });
        return results;
      }

      if (result.toolCall) results.push({ type: 'toolCall', toolCall: result.toolCall });
      if (result.text) results.push({ type: 'text', text: result.text });
      if (result.thinking) results.push({ type: 'thinking', text: result.thinking });
    }

    return results;
  }

  hasPartial(): boolean {
    return this.buffer.length > 0;
  }

  finish(): FrameResult[] {
    if (this.buffer.length === 0) {
      return [];
    }

    this.buffer = Buffer.alloc(0);
    return [toFrameErrorResult(createTruncatedFrameError())];
  }
}
