/**
 * RequestTransformer - Handle Anthropic → OpenAI request transformation
 *
 * Responsibilities:
 * - Transform Anthropic request format to OpenAI format
 * - Inject locale and reasoning instructions
 * - Map models and configure parameters
 */

import { createLogger } from '../../services/logging';
import { LocaleEnforcer } from '../locale-enforcer';
import { ReasoningEnforcer } from '../reasoning-enforcer';
import { ContentTransformer } from './content-transformer';
import type {
  Message,
  AnthropicRequest,
  OpenAIRequest,
  ThinkingConfig,
  TransformResult,
} from './types';

const logger = createLogger('glmt:pipeline:request-transformer');

export interface RequestTransformerConfig {
  defaultThinking?: boolean;
  verbose?: boolean;
  explicitReasoning?: boolean;
  log?: (message: string) => void;
}

export class RequestTransformer {
  private localeEnforcer: LocaleEnforcer;
  private reasoningEnforcer: ReasoningEnforcer;
  private contentTransformer: ContentTransformer;
  private log: (message: string) => void;
  private modelMaxTokens: Record<string, number>;

  constructor(config: RequestTransformerConfig = {}) {
    const defaultThinking = config.defaultThinking ?? true;
    this.log = config.log || (() => {});

    this.localeEnforcer = new LocaleEnforcer();
    this.reasoningEnforcer = new ReasoningEnforcer({
      enabled: config.explicitReasoning ?? true,
    });
    this.contentTransformer = new ContentTransformer(defaultThinking);

    this.modelMaxTokens = {
      'GLM-4.6': 128000,
      'GLM-4.5': 96000,
      'GLM-4.5-air': 16000,
    };
  }

  /**
   * Transform Anthropic request to OpenAI format
   */
  transform(anthropicRequest: AnthropicRequest): TransformResult {
    try {
      const messages = anthropicRequest.messages || [];

      // 1. Extract thinking control from messages
      const thinkingConfig = this.contentTransformer.extractThinkingControl(messages);
      const hasControlTags = this.contentTransformer.hasThinkingTags(messages);

      // 2. Detect "think" keywords in user prompts
      const keywordConfig = this.contentTransformer.detectThinkKeywords(messages);
      if (keywordConfig && !anthropicRequest.thinking && !hasControlTags) {
        thinkingConfig.thinking = keywordConfig.thinking;
        thinkingConfig.effort = keywordConfig.effort;
        this.log(
          `Detected think keyword: ${keywordConfig.keyword}, effort=${keywordConfig.effort}`
        );
      }

      // 3. Check anthropicRequest.thinking parameter (takes precedence)
      if (anthropicRequest.thinking) {
        if (anthropicRequest.thinking.type === 'enabled') {
          thinkingConfig.thinking = true;
          this.log('Claude CLI explicitly enabled thinking');
        } else if (anthropicRequest.thinking.type === 'disabled') {
          thinkingConfig.thinking = false;
          this.log('Claude CLI explicitly disabled thinking');
        }
      }

      this.log(`Final thinking control: ${JSON.stringify(thinkingConfig)}`);

      // 4. Map model
      const glmModel = this.mapModel(anthropicRequest.model);

      // 5. Inject locale instruction
      const messagesWithLocale = this.localeEnforcer.injectInstruction(
        messages as Parameters<typeof this.localeEnforcer.injectInstruction>[0]
      ) as unknown as Message[];

      // 6. Inject reasoning instruction
      const messagesWithReasoning = this.reasoningEnforcer.injectInstruction(
        messagesWithLocale as unknown as Parameters<
          typeof this.reasoningEnforcer.injectInstruction
        >[0],
        thinkingConfig
      ) as unknown as Message[];

      // 7. Build OpenAI request
      const openaiRequest: OpenAIRequest = {
        model: glmModel,
        messages: this.contentTransformer.sanitizeMessages(messagesWithReasoning),
        max_tokens: this.getMaxTokens(glmModel),
        stream: anthropicRequest.stream ?? false,
      };

      // 8. Transform tools if present
      if (anthropicRequest.tools && anthropicRequest.tools.length > 0) {
        openaiRequest.tools = this.contentTransformer.transformTools(anthropicRequest.tools);
        openaiRequest.tool_choice = 'auto';
        this.log(`Transformed ${anthropicRequest.tools.length} tools for OpenAI format`);
      }

      // 9. Preserve optional parameters
      if (anthropicRequest.temperature !== undefined) {
        openaiRequest.temperature = anthropicRequest.temperature;
      }
      if (anthropicRequest.top_p !== undefined) {
        openaiRequest.top_p = anthropicRequest.top_p;
      }
      if (anthropicRequest.stream !== undefined) {
        openaiRequest.stream = anthropicRequest.stream;
      }

      // 10. Inject reasoning parameters
      this.injectReasoningParams(openaiRequest, thinkingConfig);

      return { openaiRequest, thinkingConfig };
    } catch (error) {
      const err = error as Error;
      logger.error('transform_failed', 'Anthropic to OpenAI request transformation failed', {
        err: { name: err.name, message: err.message },
      });
      return {
        openaiRequest: anthropicRequest,
        thinkingConfig: { thinking: false, effort: 'medium' },
        error: err.message,
      };
    }
  }

  private injectReasoningParams(
    openaiRequest: OpenAIRequest,
    thinkingConfig: ThinkingConfig
  ): void {
    openaiRequest.do_sample = true;
    if (thinkingConfig.thinking) {
      openaiRequest.reasoning = true;
      openaiRequest.reasoning_effort = thinkingConfig.effort;
    }
  }

  private mapModel(_anthropicModel: string): string {
    return 'GLM-4.6';
  }

  private getMaxTokens(model: string): number {
    return this.modelMaxTokens[model] || 128000;
  }
}
