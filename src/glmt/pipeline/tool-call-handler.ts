/**
 * ToolCallHandler - Handle tool call processing for streaming responses
 *
 * Responsibilities:
 * - Process tool call deltas from OpenAI
 * - Generate tool_use content blocks for Anthropic format
 * - Handle input_json_delta events
 */

import { createLogger } from '../../services/logging';
import type { DeltaAccumulator } from '../delta-accumulator';
import type { OpenAIToolCallDelta, OpenAIToolCall, ContentBlock, AnthropicSSEEvent } from './types';

const logger = createLogger('glmt:pipeline:tool-call-handler');

export class ToolCallHandler {
  processToolCalls(toolCalls: OpenAIToolCall[]): ContentBlock[] {
    const content: ContentBlock[] = [];

    for (const toolCall of toolCalls) {
      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = JSON.parse(toolCall.function.arguments || '{}');
      } catch (parseError) {
        const err = parseError as Error;
        logger.warn(
          'tool_arguments_invalid_json',
          'Tool call arguments contained invalid JSON, storing raw value',
          {
            err: { name: err.name, message: err.message },
            toolCallId: toolCall.id,
            toolCallName: toolCall.function.name,
          }
        );
        parsedInput = { _error: 'Invalid JSON', _raw: toolCall.function.arguments };
      }

      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      });
    }

    return content;
  }

  processToolCallDeltas(
    toolCallDeltas: OpenAIToolCallDelta[],
    accumulator: DeltaAccumulator
  ): AnthropicSSEEvent[] {
    const events: AnthropicSSEEvent[] = [];

    for (const toolCallDelta of toolCallDeltas) {
      const isNewToolCall = !accumulator.hasToolCall(toolCallDelta.index);
      accumulator.addToolCallDelta(toolCallDelta);

      if (isNewToolCall) {
        // OpenAI may interleave tool_call fragments across chunks, so blocks must stay open
        // until the stream finalizes. Closing on a later index truncates earlier tool input.
        const block = accumulator.startBlock('tool_use');
        const toolCall = accumulator.getToolCall(toolCallDelta.index);
        accumulator.setToolCallBlockIndex(toolCallDelta.index, block.index);

        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: block.index,
            content_block: {
              type: 'tool_use',
              id: toolCall?.id || `tool_${toolCallDelta.index}`,
              name: toolCall?.function?.name || '',
              input: {},
            },
          },
        });
      }

      if (toolCallDelta.function?.arguments) {
        const toolCallBlockIndex = accumulator.getToolCallBlockIndex(toolCallDelta.index);
        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: toolCallBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: toolCallDelta.function.arguments,
            },
          },
        });
      }
    }

    return events;
  }
}
