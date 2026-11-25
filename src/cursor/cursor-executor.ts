/**
 * Cursor Executor
 * Handles HTTP/2 requests to Cursor API with protobuf encoding/decoding
 */

import { generateCursorBody } from './cursor-protobuf.js';
import { buildCursorRequest } from './cursor-translator.js';
import type { CursorTool, CursorApiCredentials } from './cursor-protobuf-schema.js';
import { buildCursorConnectHeaders, generateCursorChecksum } from './cursor-client-policy.js';
import { createLogger } from '../services/logging';
import {
  type ExecutorParams,
  type Http2Response,
  getHttp2,
  makeFetchRequest,
  makeHttp2Request,
} from './cursor-connect-transport';
import { createUpstreamStatusErrorResponse } from './cursor-executor-errors';
import { transformProtobufToJSON, transformProtobufToSSE } from './cursor-response-transformers';
import { executeCursorStreaming } from './cursor-streaming-bridge';

const logger = createLogger('cursor:executor');

export type { ExecutorParams, Http2Response };

export class CursorExecutor {
  private readonly baseUrl = 'https://api2.cursor.sh';
  private readonly chatPath = '/aiserver.v1.AiService/StreamChat';

  buildUrl(): string {
    return `${this.baseUrl}${this.chatPath}`;
  }

  /**
   * Generate checksum using Jyh cipher (time-based XOR with rolling key seed=165)
   */
  generateChecksum(machineId: string): string {
    return generateCursorChecksum(machineId);
  }

  buildHeaders(credentials: CursorApiCredentials): Record<string, string> {
    return buildCursorConnectHeaders(credentials);
  }

  transformRequest(
    model: string,
    body: ExecutorParams['body'],
    stream: boolean,
    credentials: CursorApiCredentials
  ): Uint8Array {
    const translatedBody = buildCursorRequest(model, body, stream, credentials);
    const messages = translatedBody.messages || [];
    const tools = (translatedBody.tools || body.tools || []) as CursorTool[];
    const reasoningEffort = body.reasoning_effort || null;
    return generateCursorBody(messages, model, tools, reasoningEffort);
  }

  async makeFetchRequest(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<Http2Response> {
    return makeFetchRequest(url, headers, body, signal);
  }

  async makeHttp2Request(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<Http2Response> {
    return makeHttp2Request(url, headers, body, signal);
  }

  async execute(params: ExecutorParams): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: ExecutorParams['body'];
  }> {
    const { model, body, stream, credentials, signal } = params;
    const url = this.buildUrl();
    const headers = this.buildHeaders(credentials);
    const transformedBody = this.transformRequest(model, body, stream, credentials);

    const startedAt = Date.now();
    logger.stage('upstream', 'cursor.upstream.request', 'Sending Cursor upstream request', {
      provider: 'cursor',
      model,
      stream,
    });

    try {
      // Streaming requests use incremental HTTP/2 → SSE pipeline
      if (stream) {
        const response = await executeCursorStreaming(url, headers, transformedBody, model, signal);
        return { response, url, headers, transformedBody: body };
      }

      // Non-streaming: buffer entire response then transform to JSON
      const http2 = await getHttp2();
      const response = http2
        ? await this.makeHttp2Request(url, headers, transformedBody, signal)
        : await this.makeFetchRequest(url, headers, transformedBody, signal);

      if (response.status !== 200) {
        const errorText = response.body?.toString() || 'Unknown error';
        logger.stage(
          'cleanup',
          'cursor.upstream.error',
          'Cursor upstream returned non-200 status',
          { provider: 'cursor', model, status: response.status },
          { level: 'error', latencyMs: Date.now() - startedAt }
        );
        const errorResponse = createUpstreamStatusErrorResponse(response.status, errorText);
        return { response: errorResponse, url, headers, transformedBody: body };
      }

      const transformedResponse = this.transformProtobufToJSON(response.body, model, body);
      logger.stage(
        'transform',
        'cursor.upstream.transformed',
        'Cursor response transformed',
        { provider: 'cursor', model },
        { latencyMs: Date.now() - startedAt }
      );
      return { response: transformedResponse, url, headers, transformedBody: body };
    } catch (error) {
      const err = error as Error;
      logger.stage(
        'cleanup',
        'cursor.upstream.exception',
        'Cursor upstream request threw',
        { provider: 'cursor', model },
        {
          level: 'error',
          latencyMs: Date.now() - startedAt,
          error: { name: err.name, message: err.message },
        }
      );
      const errorResponse = new Response(
        JSON.stringify({
          error: {
            message: err.message,
            type: 'connection_error',
            code: '',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      return { response: errorResponse, url, headers, transformedBody: body };
    }
  }

  transformProtobufToJSON(buffer: Buffer, model: string, _body: ExecutorParams['body']): Response {
    return transformProtobufToJSON(buffer, model);
  }

  /** @deprecated Use executeStreaming() for real-time SSE. Retained for fetch fallback. */
  transformProtobufToSSE(buffer: Buffer, model: string, _body: ExecutorParams['body']): Response {
    return transformProtobufToSSE(buffer, model);
  }
}

export default CursorExecutor;
