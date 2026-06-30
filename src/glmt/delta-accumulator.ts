#!/usr/bin/env node

/**
 * DeltaAccumulator - Maintain state across streaming deltas
 *
 * Tracks:
 * - Message metadata (id, model, role)
 * - Content blocks (thinking, text)
 * - Current block index
 * - Accumulated content
 *
 * Usage:
 *   const acc = new DeltaAccumulator(thinkingConfig);
 *   const events = transformer.transformDelta(openaiEvent, acc);
 */

import { createLogger } from '../services/logging';

interface ThinkingConfig {
  [key: string]: unknown;
}

interface DeltaAccumulatorOptions {
  maxBlocks?: number;
  maxBufferSize?: number;
  loopDetectionThreshold?: number;
}

interface ContentBlock {
  index: number;
  type: string;
  content: string;
  started: boolean;
  stopped: boolean;
}

interface ToolCall {
  index: number;
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
  blockIndex: number;
}

interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface UsageStats {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
}

interface AccumulatorSummary {
  messageId: string;
  model: string | null;
  role: string;
  blockCount: number;
  currentIndex: number;
  toolCallCount: number;
  messageStarted: boolean;
  finalized: boolean;
  loopDetected: boolean;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class DeltaAccumulator {
  private messageId: string;
  private model: string | null;
  private role: string;
  private contentBlocks: ContentBlock[];
  private currentBlockIndex: number;
  private toolCalls: ToolCall[];
  private toolCallsIndex: Record<number, ToolCall>;
  private thinkingBuffer: string;
  private textBuffer: string;
  private maxBlocks: number;
  private maxBufferSize: number;
  private loopDetectionThreshold: number;
  private loopDetected: boolean;
  private messageStarted: boolean;
  private finalized: boolean;
  private inputTokens: number;
  private outputTokens: number;
  private readonly logger = createLogger('glmt:delta-accumulator');

  constructor(_thinkingConfig: ThinkingConfig = {}, options: DeltaAccumulatorOptions = {}) {
    this.messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    this.model = null;
    this.role = 'assistant';

    // Content blocks
    this.contentBlocks = [];
    this.currentBlockIndex = -1;

    // Tool calls tracking
    this.toolCalls = [];
    this.toolCallsIndex = {};

    // Buffers
    this.thinkingBuffer = '';
    this.textBuffer = '';

    // C-02 Fix: Limits to prevent unbounded accumulation
    this.maxBlocks = options.maxBlocks || 100;
    this.maxBufferSize = options.maxBufferSize || 10 * 1024 * 1024; // 10MB

    // Loop detection configuration
    this.loopDetectionThreshold = options.loopDetectionThreshold || 3;
    this.loopDetected = false;

    // State flags
    this.messageStarted = false;
    this.finalized = false;

    // Statistics
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  /**
   * Get current content block
   * @returns Current block or null
   */
  getCurrentBlock(): ContentBlock | null {
    if (this.currentBlockIndex >= 0 && this.currentBlockIndex < this.contentBlocks.length) {
      return this.contentBlocks[this.currentBlockIndex];
    }
    return null;
  }

  /**
   * Start new content block
   * @param type - Block type ('thinking', 'text', or 'tool_use')
   * @returns New block
   */
  startBlock(type: string): ContentBlock {
    // C-02 Fix: Enforce max blocks limit
    if (this.contentBlocks.length >= this.maxBlocks) {
      throw new Error(`Maximum ${this.maxBlocks} content blocks exceeded (DoS protection)`);
    }

    this.currentBlockIndex++;
    const block: ContentBlock = {
      index: this.currentBlockIndex,
      type: type,
      content: '',
      started: true,
      stopped: false,
    };
    this.contentBlocks.push(block);

    // Reset buffer for new block (tool_use doesn't use buffers)
    if (type === 'thinking') {
      this.thinkingBuffer = '';
    } else if (type === 'text') {
      this.textBuffer = '';
    }

    return block;
  }

  /**
   * Add delta to current block
   * @param delta - Content delta
   */
  addDelta(delta: string): void {
    const block = this.getCurrentBlock();
    if (!block) {
      // FIX: Guard against null block (should never happen, but defensive)
      this.logger.error(
        'delta.no_current_block',
        'DeltaAccumulator addDelta called with no current block',
        { currentBlockIndex: this.currentBlockIndex }
      );
      return;
    }

    if (block.type === 'thinking') {
      // C-02 Fix: Enforce buffer size limit
      if (this.thinkingBuffer.length + delta.length > this.maxBufferSize) {
        throw new Error(`Thinking buffer exceeded ${this.maxBufferSize} bytes (DoS protection)`);
      }
      this.thinkingBuffer += delta;
      block.content = this.thinkingBuffer;

      // FIX: Verify assignment succeeded (paranoid check for race conditions)
      if (block.content.length !== this.thinkingBuffer.length) {
        this.logger.error(
          'delta.assignment_failed',
          'DeltaAccumulator block content assignment failed',
          {
            blockIndex: block.index,
            expected: this.thinkingBuffer.length,
            actual: block.content.length,
          }
        );
      }
    } else if (block.type === 'text') {
      // C-02 Fix: Enforce buffer size limit
      if (this.textBuffer.length + delta.length > this.maxBufferSize) {
        throw new Error(`Text buffer exceeded ${this.maxBufferSize} bytes (DoS protection)`);
      }
      this.textBuffer += delta;
      block.content = this.textBuffer;
    }
  }

  /**
   * Mark current block as stopped
   */
  stopCurrentBlock(): void {
    const block = this.getCurrentBlock();
    if (block) {
      block.stopped = true;

      // FIX: Log block closure for debugging (helps diagnose timing issues)
      if (block.type === 'thinking' && process.env.CCS_DEBUG === '1') {
        this.logger.debug('delta.stopped_thinking_block', 'Stopped thinking block', {
          blockIndex: block.index,
          contentLength: block.content?.length || 0,
        });
      }
    }
  }

  /**
   * Update usage statistics
   * @param usage - Usage object from OpenAI
   */
  updateUsage(usage: UsageStats): void {
    if (usage) {
      this.inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
      this.outputTokens = usage.completion_tokens || usage.output_tokens || 0;
      this.usageReceived = true;
    }
  }

  /**
   * Add or update tool call delta
   * @param toolCallDelta - Tool call delta from OpenAI
   */
  addToolCallDelta(toolCallDelta: ToolCallDelta): void {
    const index = toolCallDelta.index;

    if (!this.toolCallsIndex[index]) {
      const toolCall: ToolCall = {
        index: index,
        id: '',
        type: 'function',
        function: {
          name: '',
          arguments: '',
        },
        blockIndex: -1,
      };
      this.toolCalls.push(toolCall);
      this.toolCallsIndex[index] = toolCall;
    }

    const toolCall = this.toolCallsIndex[index];

    if (toolCallDelta.id) {
      toolCall.id = toolCallDelta.id;
    }

    if (toolCallDelta.type) {
      toolCall.type = toolCallDelta.type;
    }

    if (toolCallDelta.function?.name) {
      toolCall.function.name += toolCallDelta.function.name;
    }

    if (toolCallDelta.function?.arguments) {
      toolCall.function.arguments += toolCallDelta.function.arguments;
    }
  }

  setToolCallBlockIndex(toolCallIndex: number, blockIndex: number): void {
    const toolCall = this.toolCallsIndex[toolCallIndex];
    if (toolCall) {
      toolCall.blockIndex = blockIndex;
    }
  }

  getToolCallBlockIndex(toolCallIndex: number): number {
    const toolCall = this.toolCallsIndex[toolCallIndex];
    if (!toolCall || toolCall.blockIndex < 0) {
      throw new Error(`Tool call ${toolCallIndex} does not have an assigned content block`);
    }
    return toolCall.blockIndex;
  }

  getUnstoppedBlocks(): ContentBlock[] {
    return this.contentBlocks.filter((b) => !b.stopped);
  }

  /**
   * Get all tool calls
   * @returns Tool calls array
   */
  getToolCalls(): ToolCall[] {
    return this.toolCalls;
  }

  /**
   * Check for planning loop pattern
   * Loop = N consecutive thinking blocks with no tool calls
   * @returns True if loop detected
   */
  checkForLoop(): boolean {
    // Already detected loop
    if (this.loopDetected) {
      return true;
    }

    // Need minimum blocks to detect pattern
    if (this.contentBlocks.length < this.loopDetectionThreshold) {
      return false;
    }

    // Get last N blocks
    const recentBlocks = this.contentBlocks.slice(-this.loopDetectionThreshold);

    // Check if all recent blocks are thinking blocks
    const allThinking = recentBlocks.every((b) => b.type === 'thinking');

    // Check if no tool calls have been made at all
    const noToolCalls = this.toolCalls.length === 0;

    // Loop detected if: all recent blocks are thinking AND no tool calls yet
    if (allThinking && noToolCalls) {
      this.loopDetected = true;
      return true;
    }

    return false;
  }

  /**
   * Reset loop detection state (for testing)
   */
  resetLoopDetection(): void {
    this.loopDetected = false;
  }

  /**
   * Get summary of accumulated state
   * @returns Summary
   */
  getSummary(): AccumulatorSummary {
    return {
      messageId: this.messageId,
      model: this.model,
      role: this.role,
      blockCount: this.contentBlocks.length,
      currentIndex: this.currentBlockIndex,
      toolCallCount: this.toolCalls.length,
      messageStarted: this.messageStarted,
      finalized: this.finalized,
      loopDetected: this.loopDetected,
      usage: {
        input_tokens: this.inputTokens,
        output_tokens: this.outputTokens,
      },
    };
  }

  // ========== State Getters ==========

  /**
   * Check if message has been finalized
   */
  isFinalized(): boolean {
    return this.finalized;
  }

  /**
   * Check if message has started
   */
  isMessageStarted(): boolean {
    return this.messageStarted;
  }

  /**
   * Get message ID
   */
  getMessageId(): string {
    return this.messageId;
  }

  /**
   * Get model name
   */
  getModel(): string | null {
    return this.model;
  }

  /**
   * Get role
   */
  getRole(): string {
    return this.role;
  }

  /**
   * Get input tokens
   */
  getInputTokens(): number {
    return this.inputTokens;
  }

  /**
   * Get output tokens
   */
  getOutputTokens(): number {
    return this.outputTokens;
  }

  // ========== State Setters ==========

  /**
   * Set model name
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Set message started flag
   */
  setMessageStarted(started: boolean): void {
    this.messageStarted = started;
  }

  /**
   * Set role
   */
  setRole(role: string): void {
    this.role = role;
  }

  /**
   * Set finalized flag
   */
  setFinalized(finalized: boolean): void {
    this.finalized = finalized;
  }

  // ========== Finish Reason ==========

  private finishReason: string | null = null;
  private usageReceived: boolean = false;

  /**
   * Set finish reason
   */
  setFinishReason(reason: string): void {
    this.finishReason = reason;
  }

  /**
   * Get finish reason
   */
  getFinishReason(): string | null {
    return this.finishReason;
  }

  /**
   * Check if usage stats have been received
   */
  hasUsageReceived(): boolean {
    return this.usageReceived;
  }

  /**
   * Mark usage as received
   */
  setUsageReceived(received: boolean): void {
    this.usageReceived = received;
  }

  // ========== Tool Call Helpers ==========

  /**
   * Check if there are any tool calls, or check if a specific index exists
   */
  hasToolCall(index?: number): boolean {
    if (index === undefined) {
      return this.toolCalls.length > 0;
    }
    return this.toolCallsIndex[index] !== undefined;
  }

  /**
   * Get tool call by index
   */
  getToolCall(index: number): ToolCall | undefined {
    return this.toolCallsIndex[index];
  }
}
