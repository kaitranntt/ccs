/**
 * Pipeline Types - Shared types for GLMT transformation pipeline
 */

// Content block types
export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | unknown;
}

export interface Message {
  role: string;
  content: string | ContentBlock[];
}

// Tool types
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

// Request/Response types
export interface AnthropicRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: AnthropicTool[];
  stream?: boolean;
  thinking?: {
    type: 'enabled' | 'disabled';
    budget_tokens?: number;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: OpenAITool[];
  tool_choice?: string;
  stream?: boolean;
  do_sample?: boolean;
  reasoning?: boolean;
  reasoning_effort?: string;
}

export interface ThinkingConfig {
  thinking: boolean;
  effort: string;
}

export interface TransformResult {
  openaiRequest: OpenAIRequest | AnthropicRequest;
  thinkingConfig: ThinkingConfig;
  error?: string;
}

// Anthropic contract: a thinking block's signature is a non-empty opaque
// string. Kept as a named alias so existing imports stay intact.
export type ThinkingSignature = string;

// OpenAI response types
export interface OpenAIChoice {
  message: {
    role?: string;
    content?: string | null;
    reasoning_content?: string;
    tool_calls?: OpenAIToolCall[];
  };
  delta?: {
    role?: string;
    content?: string;
    reasoning_content?: string;
    tool_calls?: OpenAIToolCallDelta[];
  };
  finish_reason?: string;
}

export interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: OpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// SSE event types
export interface SSEEvent {
  event?: string;
  data?: OpenAIResponse & {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
}

export interface AnthropicSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// Accumulator block type
export interface AccumulatorBlock {
  index: number;
  type: string;
  content: string;
  stopped: boolean;
}

// Validation result
export interface ValidationResult {
  checks: Record<string, boolean>;
  passed: number;
  total: number;
  valid: boolean;
}

// Config types
export interface GlmtTransformerConfig {
  defaultThinking?: boolean;
  verbose?: boolean;
  debugLog?: boolean;
  debugMode?: boolean;
  debugLogDir?: string;
  explicitReasoning?: boolean;
}
