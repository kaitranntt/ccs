import { DeltaAccumulator } from '../../glmt/delta-accumulator';
import { GlmtTransformer } from '../../glmt/glmt-transformer';
import { SSEParser } from '../../glmt/sse-parser';
import type { OpenAIResponse, SSEEvent } from '../../glmt/pipeline';

const JSON_TRANSLATION_ERROR_MESSAGE = 'Failed to translate OpenAI-compatible JSON response';
const STREAM_TRANSLATION_ERROR_MESSAGE = 'Failed to translate OpenAI-compatible SSE response';

type ResponseHeaders = Headers | Record<string, string> | Array<[string, string]>;

interface AnthropicErrorPayload {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

function createAnthropicErrorPayload(type: string, message: string): AnthropicErrorPayload {
  return {
    type: 'error',
    error: {
      type,
      message,
    },
  };
}

function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function logTranslationError(context: string, error: unknown): void {
  console.error(`[proxy-sse-transformer] ${context}: ${formatErrorForLog(error)}`);
}

export function createAnthropicErrorResponse(
  status: number,
  type: string,
  message: string,
  headers?: ResponseHeaders
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  responseHeaders.delete('Content-Encoding');
  responseHeaders.delete('Content-Length');

  return new Response(JSON.stringify(createAnthropicErrorPayload(type, message)), {
    status,
    headers: responseHeaders,
  });
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function hasTranslatableChoices(value: unknown): value is OpenAIResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { choices } = value as OpenAIResponse;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    return false;
  }

  const message = (firstChoice as { message?: unknown }).message;
  return typeof message === 'object' && message !== null;
}

function isSyntheticTransformationFallback(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    (value as { id: string }).id.startsWith('msg_error_')
  );
}

async function createAnthropicErrorProxyResponse(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete('Content-Type');
  headers.delete('Content-Length');

  let type =
    response.status === 401
      ? 'authentication_error'
      : response.status === 429
        ? 'rate_limit_error'
        : response.status >= 400 && response.status < 500
          ? 'invalid_request_error'
          : 'api_error';
  let message = `Upstream request failed with status ${response.status}`;

  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as {
        error?: { type?: string; message?: string };
        message?: string;
      };

      if (typeof payload?.error?.type === 'string' && payload.error.type.trim().length > 0) {
        type = payload.error.type;
      }

      if (typeof payload?.error?.message === 'string' && payload.error.message.trim().length > 0) {
        message = payload.error.message;
      } else if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
        message = payload.message;
      }
    } else {
      const text = (await response.text()).trim();
      if (text.length > 0) {
        message = text;
      }
    }
  } catch (error) {
    logTranslationError('Failed to parse upstream error response', error);
  }

  return createAnthropicErrorResponse(response.status, type, message, headers);
}

async function createAnthropicJsonResponse(response: Response): Promise<Response> {
  try {
    const openAIResponse = await response.json();
    if (!hasTranslatableChoices(openAIResponse)) {
      return createAnthropicErrorResponse(502, 'api_error', JSON_TRANSLATION_ERROR_MESSAGE);
    }

    const anthropicResponse = new GlmtTransformer().transformResponse(openAIResponse);
    if (isSyntheticTransformationFallback(anthropicResponse)) {
      logTranslationError(
        'OpenAI-compatible JSON translation produced synthetic fallback response',
        anthropicResponse
      );
      return createAnthropicErrorResponse(502, 'api_error', JSON_TRANSLATION_ERROR_MESSAGE);
    }

    return new Response(JSON.stringify(anthropicResponse), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logTranslationError('OpenAI-compatible JSON translation failed', error);
    return createAnthropicErrorResponse(502, 'api_error', JSON_TRANSLATION_ERROR_MESSAGE);
  }
}

function createAnthropicStreamingResponse(response: Response): Response {
  const body = response.body;
  if (!body) {
    return createAnthropicErrorResponse(
      502,
      'api_error',
      'Upstream stream ended before a response body was available'
    );
  }

  const parser = new SSEParser({ throwOnMalformedJson: true });
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator({});
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          const events = parser.parse(Buffer.from(value));
          for (const event of events) {
            const anthropicEvents = transformer.transformDelta(event as SSEEvent, accumulator);
            for (const anthropicEvent of anthropicEvents) {
              controller.enqueue(
                encoder.encode(formatSseEvent(anthropicEvent.event, anthropicEvent.data))
              );
            }
          }
        }

        if (!accumulator.isFinalized() && accumulator.isMessageStarted()) {
          for (const anthropicEvent of transformer.finalizeDelta(accumulator)) {
            controller.enqueue(
              encoder.encode(formatSseEvent(anthropicEvent.event, anthropicEvent.data))
            );
          }
        }
      } catch (error) {
        logTranslationError('OpenAI-compatible SSE translation failed', error);
        controller.enqueue(
          encoder.encode(
            formatSseEvent(
              'error',
              createAnthropicErrorPayload('api_error', STREAM_TRANSLATION_ERROR_MESSAGE)
            )
          )
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: response.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function createAnthropicProxyResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    return createAnthropicErrorProxyResponse(response);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isEventStream =
    contentType === 'text/event-stream' || contentType.startsWith('text/event-stream;');

  return isEventStream
    ? createAnthropicStreamingResponse(response)
    : createAnthropicJsonResponse(response);
}

export class ProxySseStreamTransformer {
  async transform(response: Response): Promise<Response> {
    return createAnthropicProxyResponse(response);
  }

  error(status: number, type: string, message: string): Response {
    return createAnthropicErrorResponse(status, type, message);
  }
}
