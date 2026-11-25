/**
 * Cursor Connect-RPC transport (HTTP/2 + fetch fallback) and protobuf frame parsing.
 */

import type { IncomingHttpHeaders } from 'http';
import { extractTextFromResponse } from './cursor-protobuf.js';
import {
  isEndStreamConnectFrame,
  type CursorTool,
  type CursorApiCredentials,
} from './cursor-protobuf-schema.js';
import { decompressPayload, mapCursorConnectError } from './cursor-stream-parser.js';
import { NetworkError } from '../errors/error-types';
import {
  type CursorExecutorErrorPayload,
  toCursorErrorPayloadFromJson,
  toCursorExecutorErrorPayload,
} from './cursor-executor-errors';

/** Executor parameters */
export interface ExecutorParams {
  model: string;
  body: {
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
      name?: string;
      tool_call_id?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    }>;
    tools?: CursorTool[];
    reasoning_effort?: string;
  };
  stream: boolean;
  credentials: CursorApiCredentials;
  signal?: AbortSignal;
}

/** HTTP/2 response structure */
export interface Http2Response {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export type ParsedConnectFrame =
  | { type: 'error'; error: CursorExecutorErrorPayload }
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

/** Lazy import http2 */
let http2Module: typeof import('http2') | null = null;
export async function getHttp2() {
  if (http2Module) return http2Module;
  try {
    http2Module = await import('http2');
    return http2Module;
  } catch (err) {
    if (process.env.CCS_DEBUG) {
      console.error('[cursor] http2 module not available, falling back to fetch:', err);
    }
    return null;
  }
}

export async function makeFetchRequest(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  signal?: AbortSignal
): Promise<Http2Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

export async function makeHttp2Request(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  signal?: AbortSignal
): Promise<Http2Response> {
  const http2 = await getHttp2();
  if (!http2) {
    throw new NetworkError('http2 module not available', url);
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = http2.connect(`https://${urlObj.host}`);
    const chunks: Buffer[] = [];
    let responseHeaders: IncomingHttpHeaders = {};

    client.on('error', (err) => {
      client.close();
      reject(err);
    });

    const req = client.request({
      ':method': 'POST',
      ':path': urlObj.pathname,
      ':authority': urlObj.host,
      ':scheme': 'https',
      ...headers,
    });

    req.on('response', (hdrs) => {
      responseHeaders = hdrs;
    });
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      client.close();
      resolve({
        status: Number(responseHeaders[':status']) || 500,
        headers: responseHeaders,
        body: Buffer.concat(chunks),
      });
    });
    req.on('error', (err) => {
      client.close();
      reject(err);
    });

    if (signal) {
      const onAbort = () => {
        req.close();
        client.close();
        reject(new NetworkError('Request aborted', url));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
      };
      req.on('end', cleanup);
      req.on('error', cleanup);
    }

    req.write(body);
    req.end();
  });
}

/**
 * Parse protobuf buffer into frames and extract text/toolcalls.
 * Shared logic between JSON and SSE transformers.
 */
export function* parseProtobufFrames(buffer: Buffer): Generator<ParsedConnectFrame> {
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 5 > buffer.length) break;

    const flags = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);

    if (offset + 5 + length > buffer.length) break;

    let payload = buffer.slice(offset + 5, offset + 5 + length);
    offset += 5 + length;

    try {
      payload = decompressPayload(payload, flags);
    } catch (error) {
      yield { type: 'error', error: toCursorExecutorErrorPayload(error) };
      return;
    }

    if (isEndStreamConnectFrame(flags)) {
      try {
        const json = JSON.parse(payload.toString('utf-8')) as {
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
          yield {
            type: 'error',
            error: {
              message: msg,
              status: mappedError.status,
              errorType: mappedError.errorType,
              code: json?.error?.code || 'cursor_error',
            },
          };
          return;
        }
      } catch {
        // Ignore successful end-stream metadata trailers.
      }
      continue;
    }

    // Check for JSON error format
    try {
      const text = payload.toString('utf-8');
      if (text.startsWith('{') && text.includes('"error"')) {
        yield { type: 'error', error: toCursorErrorPayloadFromJson(JSON.parse(text)) };
        return;
      }
    } catch (err) {
      if (process.env.CCS_DEBUG) {
        console.error('[cursor] parseProtobufFrames error parsing failed:', err);
      }
    }

    const result = extractTextFromResponse(new Uint8Array(payload));

    // Check for protobuf-decoded error
    if (result.error) {
      const errorLower = result.error.toLowerCase();
      const isRateLimit =
        errorLower.includes('rate limit') ||
        errorLower.includes('resource_exhausted') ||
        errorLower.includes('too many requests');
      yield {
        type: 'error',
        error: {
          message: result.error,
          status: isRateLimit ? 429 : 502,
          errorType: isRateLimit ? 'rate_limit_error' : 'server_error',
          code: isRateLimit ? 'rate_limited' : 'cursor_error',
        },
      };
      return;
    }

    if (result.toolCall) {
      yield { type: 'toolCall', toolCall: result.toolCall };
    }

    if (result.text) {
      yield { type: 'text', text: result.text };
    }

    if (result.thinking) {
      yield { type: 'thinking', text: result.thinking };
    }
  }

  if (offset !== buffer.length) {
    yield {
      type: 'error',
      error: {
        message: 'Truncated Cursor ConnectRPC frame.',
        status: 502,
        errorType: 'server_error',
        code: 'cursor_protocol_error',
      },
    };
  }
}
