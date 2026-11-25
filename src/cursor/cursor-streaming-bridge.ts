/**
 * Cursor incremental HTTP/2 -> SSE streaming bridge.
 */

import { type FrameResult, StreamingFrameParser } from './cursor-stream-parser.js';
import { getHttp2, makeFetchRequest } from './cursor-connect-transport';
import {
  buildCursorErrorEnvelope,
  createUpstreamStatusErrorResponse,
} from './cursor-executor-errors';
import {
  buildSseChunkPayload,
  buildToolCallDelta,
  transformProtobufToSSE,
} from './cursor-response-transformers';
import { NetworkError } from '../errors/error-types';

/**
 * Execute a streaming request, piping HTTP/2 data events through
 * StreamingFrameParser for incremental SSE output.
 * Falls back to buffered transformProtobufToSSE when http2 is unavailable.
 */
export async function executeCursorStreaming(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  model: string,
  signal?: AbortSignal
): Promise<Response> {
  const http2 = await getHttp2();
  if (!http2) {
    const response = await makeFetchRequest(url, headers, body, signal);
    if (response.status !== 200) {
      const errorText = response.body?.toString() || 'Unknown error';
      return createUpstreamStatusErrorResponse(response.status, errorText, true);
    }
    return transformProtobufToSSE(response.body, model);
  }

  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (response: Response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const urlObj = new URL(url);
    const client = http2.connect(`https://${urlObj.host}`);

    client.on('error', (err) => {
      client.close();
      rejectOnce(err instanceof Error ? err : new NetworkError(String(err), url));
    });

    const req = client.request({
      ':method': 'POST',
      ':path': urlObj.pathname,
      ':authority': urlObj.host,
      ':scheme': 'https',
      ...headers,
    });

    // Register abort before response headers arrive so cancellation works at all stages
    let streamClosed = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    if (signal) {
      const onAbort = () => {
        streamClosed = true;

        // If stream already started, close readable to unblock consumers.
        if (streamController) {
          try {
            streamController.close();
          } catch {
            /* already closed */
          }
        }

        req.close();
        client.close();
        rejectOnce(new NetworkError('Request aborted', url));
      };

      signal.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      req.on('end', cleanup);
      req.on('error', cleanup);
    }

    req.on('response', (hdrs) => {
      const status = Number(hdrs[':status']) || 500;

      if (status !== 200) {
        const errorChunks: Buffer[] = [];
        req.on('data', (c: Buffer) => errorChunks.push(c));
        req.on('end', () => {
          client.close();
          const errorText = Buffer.concat(errorChunks).toString();
          resolveOnce(createUpstreamStatusErrorResponse(status, errorText, true));
        });
        return;
      }

      // Status 200: set up incremental streaming pipeline
      const parser = new StreamingFrameParser();
      const enc = new TextEncoder();
      const toolCallsMap = new Map<
        string,
        {
          id: string;
          type: string;
          function: { name: string; arguments: string };
          isLast: boolean;
          index: number;
        }
      >();
      const pendingPackets: string[] = [];
      let chunkCount = 0;
      let toolCallCount = 0;
      let streamResponseResolved = false;

      const flushPendingPackets = () => {
        if (!streamController || pendingPackets.length === 0 || streamClosed) return;
        for (const packet of pendingPackets.splice(0)) {
          streamController.enqueue(enc.encode(packet));
        }
      };

      const queuePacket = (packet: string) => {
        if (streamClosed) return;
        if (streamController) {
          streamController.enqueue(enc.encode(packet));
          return;
        }
        pendingPackets.push(packet);
      };

      const emitSSE = (data: string) => {
        queuePacket(`data: ${data}\n\n`);
      };

      const emitSSEEvent = (event: string, data: string) => {
        queuePacket(`event: ${event}\ndata: ${data}\n\n`);
      };

      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          flushPendingPackets();
        },
      });

      const resolveStreamingResponse = () => {
        if (streamResponseResolved || settled) return;
        streamResponseResolved = true;
        resolveOnce(
          new Response(readable, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        );
        flushPendingPackets();
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        if (streamController) {
          try {
            streamController.close();
          } catch {
            /* already closed */
          }
        }
        client.close();
      };

      const buildChunk = (
        delta: Record<string, unknown>,
        finishReason: string | null,
        includeUsage = false
      ) => buildSseChunkPayload(responseId, created, model, delta, finishReason, includeUsage);

      const handleFrameError = (frame: Extract<FrameResult, { type: 'error' }>) => {
        const errorPayload = buildCursorErrorEnvelope({
          message: frame.message,
          status: frame.status,
          errorType: frame.errorType,
          code: frame.errorType === 'rate_limit_error' ? 'rate_limited' : 'cursor_error',
        });

        if (!streamResponseResolved && chunkCount === 0 && toolCallCount === 0) {
          streamClosed = true;
          req.close();
          client.close();
          resolveOnce(
            new Response(errorPayload, {
              status: frame.status,
              headers: { 'Content-Type': 'application/json' },
            })
          );
          return;
        }

        resolveStreamingResponse();
        emitSSEEvent('error', errorPayload);
        closeStream();
      };

      req.on('data', (chunk: Buffer) => {
        if (streamClosed) return;
        for (const frame of parser.push(chunk)) {
          if (frame.type === 'error') {
            handleFrameError(frame);
            return;
          }

          resolveStreamingResponse();

          if (frame.type === 'toolCall') {
            const tc = frame.toolCall;

            // Emit role chunk on first content
            if (chunkCount === 0) {
              emitSSE(buildChunk({ role: 'assistant', content: '' }, null));
              chunkCount++;
            }

            if (toolCallsMap.has(tc.id)) {
              const existing = toolCallsMap.get(tc.id);
              if (!existing) continue;
              existing.function.arguments += tc.function.arguments;
              existing.isLast = tc.isLast;
              if (tc.function.arguments) {
                emitSSE(
                  buildChunk(
                    buildToolCallDelta(
                      existing.index,
                      tc.id,
                      tc.function.name,
                      tc.function.arguments
                    ),
                    null
                  )
                );
                chunkCount++;
              }
            } else {
              const idx = toolCallCount++;
              toolCallsMap.set(tc.id, { ...tc, index: idx });
              emitSSE(
                buildChunk(
                  buildToolCallDelta(idx, tc.id, tc.function.name, tc.function.arguments),
                  null
                )
              );
              chunkCount++;
            }
          }

          if (frame.type === 'text') {
            const delta =
              chunkCount === 0 && toolCallCount === 0
                ? { role: 'assistant', content: frame.text }
                : { content: frame.text };
            emitSSE(buildChunk(delta, null));
            chunkCount++;
          }

          if (frame.type === 'thinking') {
            const delta =
              chunkCount === 0 && toolCallCount === 0
                ? { role: 'assistant', reasoning_content: frame.text }
                : { reasoning_content: frame.text };
            emitSSE(buildChunk(delta, null));
            chunkCount++;
          }
        }
      });

      req.on('end', () => {
        if (streamClosed) return;
        for (const frame of parser.finish()) {
          if (frame.type === 'error') {
            handleFrameError(frame);
            return;
          }
        }
        resolveStreamingResponse();
        if (chunkCount === 0 && toolCallCount === 0) {
          emitSSE(buildChunk({ role: 'assistant', content: '' }, null));
        }
        emitSSE(buildChunk({}, toolCallCount > 0 ? 'tool_calls' : 'stop', true));
        emitSSE('[DONE]');
        closeStream();
      });

      req.on('error', (err) => {
        client.close();
        if (!streamResponseResolved) {
          rejectOnce(err instanceof Error ? err : new NetworkError(String(err), url));
          return;
        }

        if (!streamClosed) {
          try {
            streamController?.error(err);
          } catch {
            /* already closed */
          }
        }
      });
    });

    req.on('error', (err) => {
      client.close();
      rejectOnce(err instanceof Error ? err : new NetworkError(String(err), url));
    });

    req.write(body);
    req.end();
  });
}
