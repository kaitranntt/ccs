/**
 * GlmtTransformer - Orchestrator for Anthropic ↔ OpenAI format transformation
 *
 * Pipeline Architecture:
 * - RequestTransformer: Anthropic → OpenAI request conversion
 * - StreamParser: Delta processing for streaming responses
 * - ResponseBuilder: SSE event generation
 * - ToolCallHandler: Tool call processing
 */

import * as fs from 'fs';
import * as path from 'path';
import { DeltaAccumulator } from './delta-accumulator';

import { createLogger } from '../services/logging';
import {
  RequestTransformer,
  StreamParser,
  ResponseBuilder,
  ToolCallHandler,
  ContentTransformer,
  type AnthropicRequest,
  type OpenAIResponse,
  type AnthropicResponse,
  type ThinkingConfig,
  type TransformResult,
  type SSEEvent,
  type AnthropicSSEEvent,
  type GlmtTransformerConfig,
  type ContentBlock,
  type Message,
  type ThinkingSignature,
  type ValidationResult,
} from './pipeline';
import { getCcsDir } from '../config/config-loader-facade';

export class GlmtTransformer {
  private verbose: boolean;
  private debugLog: boolean;
  debugLogDir: string;
  private readonly logger = createLogger('glmt:transformer');

  private requestTransformer: RequestTransformer;
  private streamParser: StreamParser;
  private responseBuilder: ResponseBuilder;
  private toolCallHandler: ToolCallHandler;
  private contentTransformer: ContentTransformer;

  constructor(config: GlmtTransformerConfig = {}) {
    this.verbose = config.verbose || false;

    const debugEnabled = process.env.CCS_DEBUG === '1';
    this.debugLog = config.debugLog ?? debugEnabled;
    this.debugLogDir = config.debugLogDir || path.join(getCcsDir(), 'logs');

    // Initialize pipeline components
    this.requestTransformer = new RequestTransformer({
      defaultThinking: config.defaultThinking ?? true,
      verbose: this.verbose,
      explicitReasoning: config.explicitReasoning ?? true,
      log: (msg) => this.log(msg),
    });

    this.responseBuilder = new ResponseBuilder(this.verbose);
    this.toolCallHandler = new ToolCallHandler();
    this.contentTransformer = new ContentTransformer(config.defaultThinking ?? true);
    this.streamParser = new StreamParser({
      verbose: this.verbose,
      debugMode: config.debugMode ?? debugEnabled,
      debugLog: this.debugLog,
      writeDebugLog: (type, data) => this.writeDebugLog(type, data),
    });
  }

  /** Transform Anthropic request to OpenAI format */
  transformRequest(anthropicRequest: AnthropicRequest): TransformResult {
    this.writeDebugLog('request-anthropic', anthropicRequest);
    const result = this.requestTransformer.transform(anthropicRequest);
    this.writeDebugLog('request-openai', result.openaiRequest);
    return result;
  }

  /** Transform OpenAI response to Anthropic format */
  transformResponse(
    openaiResponse: OpenAIResponse,
    _thinkingConfig: ThinkingConfig = { thinking: false, effort: 'medium' }
  ): AnthropicResponse {
    this.writeDebugLog('response-openai', openaiResponse);

    try {
      const choice = openaiResponse.choices?.[0];
      if (!choice) throw new Error('No choices in OpenAI response');

      const message = choice.message;
      const content: ContentBlock[] = [];

      if (message.reasoning_content) {
        this.log(`Detected reasoning_content: ${message.reasoning_content.length} chars`);
        content.push({
          type: 'thinking',
          thinking: message.reasoning_content,
          signature: this.responseBuilder.generateThinkingSignature(message.reasoning_content),
        });
      }

      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }

      if (message.tool_calls?.length) {
        content.push(...this.toolCallHandler.processToolCalls(message.tool_calls));
      }

      const anthropicResponse: AnthropicResponse = {
        id: openaiResponse.id || 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content,
        model: openaiResponse.model || 'glm-5',
        stop_reason: this.responseBuilder.mapStopReason(choice.finish_reason || 'stop'),
        usage: {
          input_tokens: openaiResponse.usage?.prompt_tokens || 0,
          output_tokens: openaiResponse.usage?.completion_tokens || 0,
        },
      };

      this.writeDebugLog('response-anthropic', anthropicResponse);
      return anthropicResponse;
    } catch (error) {
      const err = error as Error;
      this.logger.stage(
        'cleanup',
        'response.transform_failed',
        'GLMT response transformation failed',
        undefined,
        { level: 'error', error: { name: err.name, message: err.message } }
      );
      return {
        id: 'msg_error_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '[Transformation Error] ' + err.message }],
        model: 'glm-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }
  }

  /** Transform streaming delta (delegates to StreamParser) */
  transformDelta(openaiEvent: SSEEvent, accumulator: DeltaAccumulator): AnthropicSSEEvent[] {
    return this.streamParser.transformDelta(openaiEvent, accumulator);
  }

  /** Finalize streaming (delegates to StreamParser) */
  finalizeDelta(accumulator: DeltaAccumulator): AnthropicSSEEvent[] {
    return this.streamParser.finalizeDelta(accumulator);
  }

  private redactSensitiveData(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map((item) => this.redactSensitiveData(item));

    const SENSITIVE_KEYS =
      /^(authorization|auth[_-]?token|api[_-]?key|apikey|token|secret|password|credential|x-api-key|anthropic-api-key|cookie)$/i;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.redactSensitiveData(value);
      }
    }
    return result;
  }

  private writeDebugLog(type: string, data: unknown): void {
    if (!this.debugLog) return;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
      const filepath = path.join(this.debugLogDir, `${timestamp}-${type}.json`);
      fs.mkdirSync(this.debugLogDir, { recursive: true });
      const redacted = this.redactSensitiveData(data);
      fs.writeFileSync(filepath, JSON.stringify(redacted, null, 2) + '\n', 'utf8');
    } catch (error) {
      this.logger.warn('debug-log.write_failed', 'GLMT debug log write failed', {
        err: { name: (error as Error).name, message: (error as Error).message },
      });
    }
  }

  private log(message: string): void {
    if (this.verbose) {
      this.logger.debug('transformer.verbose', message);
    }
  }

  // ========== Backwards-compatible public methods ==========

  /** Generate thinking signature (delegates to ResponseBuilder) */
  generateThinkingSignature(thinking: string): ThinkingSignature {
    return this.responseBuilder.generateThinkingSignature(thinking);
  }

  /** Map stop reason (delegates to ResponseBuilder) */
  mapStopReason(openaiReason: string): string {
    return this.responseBuilder.mapStopReason(openaiReason);
  }

  /** Detect think keywords (delegates to ContentTransformer) */
  detectThinkKeywords(
    messages: Message[]
  ): { thinking: boolean; effort: string; keyword: string } | null {
    return this.contentTransformer.detectThinkKeywords(messages);
  }

  /** Validate transformation result */
  validateTransformation(anthropicResponse: AnthropicResponse): ValidationResult {
    const checks: Record<string, boolean> = {
      hasContent: Boolean(anthropicResponse.content && anthropicResponse.content.length > 0),
      hasThinking: anthropicResponse.content?.some((block) => block.type === 'thinking') || false,
      hasText: anthropicResponse.content?.some((block) => block.type === 'text') || false,
      validStructure:
        anthropicResponse.type === 'message' && anthropicResponse.role === 'assistant',
      hasUsage: Boolean(anthropicResponse.usage),
    };

    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;

    return { checks, passed, total, valid: passed === total };
  }
}

export default GlmtTransformer;
