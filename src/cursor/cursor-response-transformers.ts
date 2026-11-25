/**
 * Cursor response transformers (buffered protobuf -> OpenAI JSON or SSE).
 */

import { parseProtobufFrames } from './cursor-connect-transport';
import { buildCursorErrorEnvelope, createCursorErrorResponse } from './cursor-executor-errors';

export function buildSseChunkPayload(
  responseId: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null,
  includeUsage = false
): string {
  const payload: Record<string, unknown> = {
    id: responseId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  if (includeUsage) {
    payload.usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }
  return JSON.stringify(payload);
}

export function buildToolCallDelta(
  index: number,
  id: string,
  name: string,
  argumentsChunk: string
): Record<string, unknown> {
  return {
    tool_calls: [
      {
        index,
        id,
        type: 'function',
        function: {
          name,
          arguments: argumentsChunk,
        },
      },
    ],
  };
}

export function transformProtobufToJSON(buffer: Buffer, model: string): Response {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  let totalContent = '';
  let totalReasoning = '';
  const toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];
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

  for (const frame of parseProtobufFrames(buffer)) {
    if (frame.type === 'error') {
      return createCursorErrorResponse(frame.error);
    }

    if (frame.type === 'toolCall') {
      const tc = frame.toolCall;

      if (toolCallsMap.has(tc.id)) {
        const existing = toolCallsMap.get(tc.id);
        if (!existing) continue;
        existing.function.arguments += tc.function.arguments;
        existing.isLast = tc.isLast;
      } else {
        toolCallsMap.set(tc.id, {
          ...tc,
          index: toolCallsMap.size,
        });
      }

      if (tc.isLast) {
        const finalToolCall = toolCallsMap.get(tc.id);
        if (!finalToolCall) continue;
        toolCalls.push({
          id: finalToolCall.id,
          type: finalToolCall.type,
          function: {
            name: finalToolCall.function.name,
            arguments: finalToolCall.function.arguments,
          },
        });
      }
    }

    if (frame.type === 'text') {
      totalContent += frame.text;
    }

    if (frame.type === 'thinking') {
      totalReasoning += frame.text;
    }
  }

  // Finalize remaining tool calls
  for (const id of Array.from(toolCallsMap.keys())) {
    const tc = toolCallsMap.get(id);
    if (!tc) continue;
    if (!toolCalls.find((t) => t.id === id)) {
      toolCalls.push({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      });
    }
  }

  const message: {
    role: string;
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  } = {
    role: 'assistant',
    content: totalContent || null,
  };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  if (totalReasoning) {
    message.reasoning_content = totalReasoning;
  }

  const completion = {
    id: responseId,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };

  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function transformProtobufToSSE(buffer: Buffer, model: string): Response {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const chunks: string[] = [];
  const toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
    index: number;
  }> = [];
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

  const pushSseData = (
    delta: Record<string, unknown>,
    finishReason: string | null,
    usage = false
  ) => {
    chunks.push(
      `data: ${buildSseChunkPayload(responseId, created, model, delta, finishReason, usage)}\n\n`
    );
  };

  for (const frame of parseProtobufFrames(buffer)) {
    if (frame.type === 'error') {
      if (chunks.length === 0 && toolCalls.length === 0) {
        return createCursorErrorResponse(frame.error);
      }

      chunks.push(`event: error\ndata: ${buildCursorErrorEnvelope(frame.error)}\n\n`);
      return new Response(chunks.join(''), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    if (frame.type === 'toolCall') {
      const tc = frame.toolCall;

      if (chunks.length === 0) {
        pushSseData({ role: 'assistant', content: '' }, null);
      }

      if (toolCallsMap.has(tc.id)) {
        const existing = toolCallsMap.get(tc.id);
        if (!existing) continue;
        existing.function.arguments += tc.function.arguments;
        existing.isLast = tc.isLast;

        if (tc.function.arguments) {
          pushSseData(
            buildToolCallDelta(existing.index, tc.id, tc.function.name, tc.function.arguments),
            null
          );
        }
      } else {
        const toolCallIndex = toolCalls.length;
        toolCalls.push({ ...tc, index: toolCallIndex });
        toolCallsMap.set(tc.id, { ...tc, index: toolCallIndex });

        pushSseData(
          buildToolCallDelta(toolCallIndex, tc.id, tc.function.name, tc.function.arguments),
          null
        );
      }
    }

    if (frame.type === 'text') {
      const delta =
        chunks.length === 0 && toolCalls.length === 0
          ? { role: 'assistant', content: frame.text }
          : { content: frame.text };
      pushSseData(delta, null);
    }

    if (frame.type === 'thinking') {
      const delta =
        chunks.length === 0 && toolCalls.length === 0
          ? { role: 'assistant', reasoning_content: frame.text }
          : { reasoning_content: frame.text };
      pushSseData(delta, null);
    }
  }

  if (chunks.length === 0 && toolCalls.length === 0) {
    pushSseData({ role: 'assistant', content: '' }, null);
  }

  pushSseData({}, toolCalls.length > 0 ? 'tool_calls' : 'stop', true);
  chunks.push('data: [DONE]\n\n');

  return new Response(chunks.join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
