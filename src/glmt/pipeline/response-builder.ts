/**
 * ResponseBuilder - Create SSE events for Anthropic streaming format
 *
 * Responsibilities:
 * - Create message_start, message_delta, message_stop events
 * - Create content_block_start, content_block_delta, content_block_stop events
 * - Generate thinking signatures
 * - Map stop reasons between formats
 */

import * as crypto from 'crypto';
import { createLogger } from '../../services/logging';
import type { DeltaAccumulator } from '../delta-accumulator';
import type { AccumulatorBlock, AnthropicSSEEvent, ThinkingSignature } from './types';

const logger = createLogger('glmt:pipeline:response-builder');

export class ResponseBuilder {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  /**
   * Create message_start event
   */
  createMessageStartEvent(accumulator: DeltaAccumulator): AnthropicSSEEvent {
    return {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: accumulator.getMessageId(),
          type: 'message',
          role: accumulator.getRole(),
          content: [],
          model: accumulator.getModel() || 'glm-5',
          stop_reason: null,
          usage: {
            input_tokens: accumulator.getInputTokens(),
            output_tokens: 0,
          },
        },
      },
    };
  }

  /**
   * Create content_block_start event
   */
  createContentBlockStartEvent(block: AccumulatorBlock): AnthropicSSEEvent {
    return {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: block.index,
        content_block: {
          type: block.type,
          [block.type]: '',
        },
      },
    };
  }

  /**
   * Create thinking_delta event
   */
  createThinkingDeltaEvent(block: AccumulatorBlock, delta: string): AnthropicSSEEvent {
    return {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: block.index,
        delta: {
          type: 'thinking_delta',
          thinking: delta,
        },
      },
    };
  }

  /**
   * Create text_delta event
   */
  createTextDeltaEvent(block: AccumulatorBlock, delta: string): AnthropicSSEEvent {
    return {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: block.index,
        delta: {
          type: 'text_delta',
          text: delta,
        },
      },
    };
  }

  /**
   * Create thinking signature delta event
   */
  createSignatureDeltaEvent(block: AccumulatorBlock): AnthropicSSEEvent | null {
    // FIX: Guard against empty content (signature timing race)
    if (!block.content || block.content.length === 0) {
      if (this.verbose) {
        logger.warn(
          'signature_empty_thinking_block',
          'Skipping signature for empty thinking block - possible race condition',
          { blockIndex: block.index }
        );
      }
      return null;
    }

    const signature = this.generateThinkingSignature(block.content);

    if (this.verbose) {
      logger.info('signature_generated', 'Generated thinking signature', {
        blockIndex: block.index,
        contentLength: block.content.length,
      });
    }

    return {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: block.index,
        delta: {
          type: 'thinking_signature_delta',
          signature: signature,
        },
      },
    };
  }

  /**
   * Create content_block_stop event
   */
  createContentBlockStopEvent(block: AccumulatorBlock): AnthropicSSEEvent {
    return {
      event: 'content_block_stop',
      data: {
        type: 'content_block_stop',
        index: block.index,
      },
    };
  }

  /**
   * Generate finalization events (message_delta + message_stop)
   */
  createFinalizationEvents(accumulator: DeltaAccumulator, stopReason: string): AnthropicSSEEvent[] {
    return [
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: {
            stop_reason: stopReason,
          },
          usage: {
            input_tokens: accumulator.getInputTokens(),
            output_tokens: accumulator.getOutputTokens(),
          },
        },
      },
      {
        event: 'message_stop',
        data: {
          type: 'message_stop',
        },
      },
    ];
  }

  /**
   * Generate thinking signature for Claude Code UI
   */
  generateThinkingSignature(thinking: string): ThinkingSignature {
    // Generate signature hash
    const hash = crypto.createHash('sha256').update(thinking).digest('hex').substring(0, 16);

    return {
      type: 'thinking_signature',
      hash: hash,
      length: thinking.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Map OpenAI stop reason to Anthropic stop reason
   */
  mapStopReason(openaiReason: string): string {
    const mapping: Record<string, string> = {
      stop: 'end_turn',
      length: 'max_tokens',
      tool_calls: 'tool_use',
      content_filter: 'stop_sequence',
    };
    return mapping[openaiReason] || 'end_turn';
  }
}
