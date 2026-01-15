/**
 * ContentTransformer - Handle message sanitization and content transformations
 *
 * Responsibilities:
 * - Sanitize messages for OpenAI API compatibility
 * - Extract thinking control tags from messages
 * - Detect think keywords in user prompts
 * - Transform tools between Anthropic and OpenAI formats
 */

import type { Message, ContentBlock, AnthropicTool, OpenAITool, ThinkingConfig } from './types';

export class ContentTransformer {
  private defaultThinking: boolean;

  constructor(defaultThinking = true) {
    this.defaultThinking = defaultThinking;
  }

  /**
   * Sanitize messages for OpenAI API compatibility
   */
  sanitizeMessages(messages: Message[]): Message[] {
    const result: Message[] = [];

    for (const msg of messages) {
      // If content is a string, add as-is
      if (typeof msg.content === 'string') {
        result.push(msg);
        continue;
      }

      // If content is an array, process blocks
      if (Array.isArray(msg.content)) {
        // Separate tool_result blocks from other content
        const toolResults = msg.content.filter((block) => block.type === 'tool_result');
        const textBlocks = msg.content.filter((block) => block.type === 'text');

        // CRITICAL: Tool messages must come BEFORE user text in OpenAI API
        for (const toolResult of toolResults) {
          result.push({
            role: 'tool',
            content:
              typeof toolResult.content === 'string'
                ? toolResult.content
                : JSON.stringify(toolResult.content),
          } as Message & { tool_call_id: string });
        }

        // Add text content as user/assistant message AFTER tool messages
        if (textBlocks.length > 0) {
          const textContent =
            textBlocks.length === 1
              ? textBlocks[0].text || ''
              : textBlocks.map((b) => b.text || '').join('\n');

          result.push({
            role: msg.role,
            content: textContent,
          });
        }

        // If no content at all, add empty message
        if (textBlocks.length === 0 && toolResults.length === 0) {
          result.push({
            role: msg.role,
            content: '',
          });
        }

        continue;
      }

      // Fallback: return message as-is
      result.push(msg);
    }

    return result;
  }

  /**
   * Transform Anthropic tools to OpenAI tools format
   */
  transformTools(anthropicTools: AnthropicTool[]): OpenAITool[] {
    return anthropicTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: this.sanitizeToolName(tool.name),
        description: tool.description,
        parameters: tool.input_schema || {},
      },
    }));
  }

  /**
   * Sanitize tool name to meet OpenAI/Gemini requirements
   * Must start with letter/underscore and contain only alphanumeric/underscore/dash
   */
  private sanitizeToolName(name: string): string {
    // Replace any invalid characters with underscore
    let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Ensure strict start with letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }

    // Max length 64 chars
    return sanitized.slice(0, 64);
  }

  /**
   * Check if messages contain thinking control tags
   */
  hasThinkingTags(messages: Message[]): boolean {
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const content = msg.content;
      if (typeof content !== 'string') continue;

      // Check for control tags
      if (/<Thinking:(On|Off)>/i.test(content) || /<Effort:(Low|Medium|High)>/i.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract thinking control tags from user messages
   */
  extractThinkingControl(messages: Message[]): ThinkingConfig {
    const config: ThinkingConfig = {
      thinking: this.defaultThinking,
      effort: 'medium',
    };

    // Scan user messages for control tags
    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      const content = msg.content;
      if (typeof content !== 'string') continue;

      // Check for <Thinking:On|Off>
      const thinkingMatch = content.match(/<Thinking:(On|Off)>/i);
      if (thinkingMatch) {
        config.thinking = thinkingMatch[1].toLowerCase() === 'on';
      }

      // Check for <Effort:Low|Medium|High>
      const effortMatch = content.match(/<Effort:(Low|Medium|High)>/i);
      if (effortMatch) {
        config.effort = effortMatch[1].toLowerCase();
      }
    }

    return config;
  }

  /**
   * Detect Anthropic-style "think" keywords in user prompts
   */
  detectThinkKeywords(
    messages: Message[]
  ): { thinking: boolean; effort: string; keyword: string } | null {
    if (!messages || messages.length === 0) return null;

    // Extract text from user messages
    const text = messages
      .filter((m) => m.role === 'user')
      .map((m) => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return (m.content as ContentBlock[])
            .filter((block) => block.type === 'text')
            .map((block) => block.text || '')
            .join(' ');
        }
        return '';
      })
      .join(' ');

    // Priority: ultrathink > think harder > think hard > think
    if (/\bultrathink\b/i.test(text)) {
      return { thinking: true, effort: 'max', keyword: 'ultrathink' };
    }
    if (/\bthink\s+harder\b/i.test(text)) {
      return { thinking: true, effort: 'high', keyword: 'think harder' };
    }
    if (/\bthink\s+hard\b/i.test(text)) {
      return { thinking: true, effort: 'medium', keyword: 'think hard' };
    }
    if (/\bthink\b/i.test(text)) {
      return { thinking: true, effort: 'low', keyword: 'think' };
    }

    return null; // No keywords detected
  }
}
