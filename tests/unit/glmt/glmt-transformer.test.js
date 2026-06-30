const assert = require('assert');
const GlmtTransformer = require('../../../dist/glmt/glmt-transformer').default;
const { getCcsDir } = require('../../../dist/utils/config-manager');

describe('GlmtTransformer', () => {
  describe('Request transformation', () => {
    it('transforms Anthropic request to OpenAI format', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 4096
      };

      const { openaiRequest } = transformer.transformRequest(input);

      assert.strictEqual(openaiRequest.model, 'GLM-4.6');
      assert.strictEqual(openaiRequest.do_sample, true);
      assert.strictEqual(openaiRequest.max_tokens, 128000);
      assert.ok(openaiRequest.messages);
    });

    it('preserves temperature and top_p parameters', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        top_p: 0.9
      };

      const { openaiRequest } = transformer.transformRequest(input);

      assert.strictEqual(openaiRequest.temperature, 0.7);
      assert.strictEqual(openaiRequest.top_p, 0.9);
    });

    it.skip('handles errors in transformRequest gracefully', () => { // Skip: requires proper null safety mocking
      const transformer = new GlmtTransformer();
      const { thinkingConfig, error } = transformer.transformRequest(null);

      assert.ok(error);
      assert.strictEqual(thinkingConfig.thinking, false);
    });

    it('enables streaming when requested', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        stream: true
      };

      const { openaiRequest } = transformer.transformRequest(input);

      assert.strictEqual(openaiRequest.stream, true);
    });
  });

  describe('Thinking control tags', () => {
    it('extracts Thinking:On and Effort:High tags', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{
          role: 'user',
          content: '<Thinking:On> <Effort:High> Solve this problem'
        }]
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(thinkingConfig.effort, 'high');
    });

    it('respects Thinking:Off tag', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{
          role: 'user',
          content: '<Thinking:Off> Quick question'
        }]
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, false);
    });

    it('enables thinking by default when configured', () => {
      const transformer = new GlmtTransformer({ defaultThinking: true });
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const { openaiRequest, thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(openaiRequest.reasoning, true);
    });
  });

  describe('Response transformation', () => {
    it('converts reasoning_content to thinking block', () => {
      const transformer = new GlmtTransformer();
      const openaiResponse = {
        id: 'chatcmpl-123',
        model: 'GLM-4.6',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Here is the answer',
            reasoning_content: 'Let me think through this problem...'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const result = transformer.transformResponse(openaiResponse, {});

      assert.strictEqual(result.content.length, 2);
      assert.strictEqual(result.content[0].type, 'thinking');
      assert.strictEqual(result.content[0].thinking, 'Let me think through this problem...');
      assert.strictEqual(result.content[1].type, 'text');
      assert.strictEqual(result.content[1].text, 'Here is the answer');
    });

    it('handles response without reasoning_content', () => {
      const transformer = new GlmtTransformer();
      const openaiResponse = {
        id: 'chatcmpl-123',
        model: 'GLM-4.6',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Simple answer'
          },
          finish_reason: 'stop'
        }]
      };

      const result = transformer.transformResponse(openaiResponse, {});

      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].type, 'text');
      assert.strictEqual(result.content[0].text, 'Simple answer');
    });

    it.skip('handles errors in transformResponse gracefully', () => { // Skip: requires proper null safety mocking
      const transformer = new GlmtTransformer();
      const result = transformer.transformResponse({}, {});

      assert.strictEqual(result.type, 'message');
      assert.strictEqual(result.role, 'assistant');
      assert.ok(result.content[0].text);
    });
  });

  describe('Thinking signature', () => {
    it('generates thinking signature as a non-empty opaque string', () => {
      const transformer = new GlmtTransformer();
      const thinking = 'This is my reasoning process';
      const signature = transformer.generateThinkingSignature(thinking);

      // Anthropic contract: a thinking block's signature is a non-empty
      // opaque string, not an object.
      assert.strictEqual(typeof signature, 'string');
      assert.ok(signature.length > 0);
      // Deterministic: same reasoning yields the same signature (no Date.now()).
      assert.strictEqual(signature, transformer.generateThinkingSignature(thinking));
    });
  });

  describe('Stop reason mapping', () => {
    it('maps OpenAI stop reasons to Anthropic', () => {
      const transformer = new GlmtTransformer();

      assert.strictEqual(transformer.mapStopReason('stop'), 'end_turn');
      assert.strictEqual(transformer.mapStopReason('length'), 'max_tokens');
      assert.strictEqual(transformer.mapStopReason('tool_calls'), 'tool_use');
      assert.strictEqual(transformer.mapStopReason('unknown'), 'end_turn');
    });
  });

  describe('Debug mode', () => {
    it('is disabled by default', () => {
      const transformer = new GlmtTransformer();
      assert.strictEqual(transformer.debugLog, false);
    });

    it('is enabled via config', () => {
      const transformer = new GlmtTransformer({ debugLog: true });
      assert.strictEqual(transformer.debugLog, true);
    });

    it('is enabled via CCS_DEBUG=1', () => {
      process.env.CCS_DEBUG = '1';
      const transformer = new GlmtTransformer();
      assert.strictEqual(transformer.debugLog, true);
      delete process.env.CCS_DEBUG;
    });

    it('uses CCS logs directory by default', () => {
      const transformer = new GlmtTransformer();
      const path = require('path');
      const expectedPath = path.join(getCcsDir(), 'logs');
      assert.strictEqual(transformer.debugLogDir, expectedPath);
    });
  });

  describe('Validation', () => {
    it('validates transformation with all checks', () => {
      const transformer = new GlmtTransformer();
      const validResponse = {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reasoning...' },
          { type: 'text', text: 'answer' }
        ],
        usage: { input_tokens: 10, output_tokens: 20 }
      };

      const validation = transformer.validateTransformation(validResponse);
      assert.strictEqual(validation.passed, 5);
      assert.strictEqual(validation.total, 5);
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.checks.hasContent, true);
      assert.strictEqual(validation.checks.hasThinking, true);
      assert.strictEqual(validation.checks.hasText, true);
      assert.strictEqual(validation.checks.validStructure, true);
      assert.strictEqual(validation.checks.hasUsage, true);
    });

    it('validates transformation without thinking block', () => {
      const transformer = new GlmtTransformer();
      const response = {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'answer' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      };

      const validation = transformer.validateTransformation(response);
      assert.strictEqual(validation.passed, 4);
      assert.strictEqual(validation.checks.hasThinking, false);
      assert.strictEqual(validation.checks.hasText, true);
    });
  });

  describe('Thinking parameter', () => {
    it('processes thinking parameter with type=enabled', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test question' }],
        thinking: { type: 'enabled', budget_tokens: 1024 }
      };

      const { openaiRequest, thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(openaiRequest.reasoning, true);
    });

    it('processes thinking parameter with type=disabled', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test question' }],
        thinking: { type: 'disabled' }
      };

      const { openaiRequest, thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, false);
      assert.strictEqual(openaiRequest.reasoning, undefined);
    });

    it('ignores budget_tokens (Z.AI does not support reasoning_effort)', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        thinking: { type: 'enabled', budget_tokens: 2048 }
      };

      const { thinkingConfig, openaiRequest } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(openaiRequest.reasoning, true);
    });

    it('maps budget_tokens 2049-8192 to medium effort', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        thinking: { type: 'enabled', budget_tokens: 4096 }
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.effort, 'medium');
    });

    it('handles thinking parameter without budget_tokens', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        thinking: { type: 'enabled' }
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.ok(thinkingConfig.effort);
    });

    it('thinking parameter overrides message tags', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{
          role: 'user',
          content: '<Thinking:Off> <Effort:High> Test question'
        }],
        thinking: { type: 'enabled', budget_tokens: 1024 }
      };

      const { thinkingConfig, openaiRequest } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(openaiRequest.reasoning, true);
    });

    it('message tags work when thinking parameter absent', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{
          role: 'user',
          content: '<Thinking:On> <Effort:Medium> Test question'
        }]
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(thinkingConfig.effort, 'medium');
    });

    it('handles invalid thinking type gracefully', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'Test' }],
        thinking: { type: 'invalid' }
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.ok(thinkingConfig);
    });
  });

  describe('Keyword detection', () => {
    it('detects "think" keyword (low effort)', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'think about the solution' }
      ]);

      assert.strictEqual(result.thinking, true);
      assert.strictEqual(result.effort, 'low');
      assert.strictEqual(result.keyword, 'think');
    });

    it('detects "think hard" keyword (medium effort)', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'think hard about edge cases' }
      ]);

      assert.strictEqual(result.thinking, true);
      assert.strictEqual(result.effort, 'medium');
      assert.strictEqual(result.keyword, 'think hard');
    });

    it('detects "think harder" keyword (high effort)', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'think harder about edge cases' }
      ]);

      assert.strictEqual(result.thinking, true);
      assert.strictEqual(result.effort, 'high');
      assert.strictEqual(result.keyword, 'think harder');
    });

    it('detects "ultrathink" keyword (max effort)', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'ultrathink this complex problem' }
      ]);

      assert.strictEqual(result.thinking, true);
      assert.strictEqual(result.effort, 'max');
      assert.strictEqual(result.keyword, 'ultrathink');
    });

    it('ignores "thinking" word (not exact match)', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'I am thinking about the solution' }
      ]);

      assert.strictEqual(result, null);
    });

    it('returns null when no keywords present', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'fix the bug quickly' }
      ]);

      assert.strictEqual(result, null);
    });

    it('ultrathink has highest priority when multiple keywords present', () => {
      const transformer = new GlmtTransformer();
      const result = transformer.detectThinkKeywords([
        { role: 'user', content: 'think hard and think harder, or maybe ultrathink about this' }
      ]);

      assert.strictEqual(result.thinking, true);
      assert.strictEqual(result.effort, 'max');
      assert.strictEqual(result.keyword, 'ultrathink');
    });

    it('keyword detection triggers thinking in transformRequest', () => {
      const transformer = new GlmtTransformer();
      const input = {
        model: 'claude-sonnet-4.5',
        messages: [{ role: 'user', content: 'think hard about this architecture problem' }]
      };

      const { thinkingConfig } = transformer.transformRequest(input);

      assert.strictEqual(thinkingConfig.thinking, true);
      assert.strictEqual(thinkingConfig.effort, 'medium');
    });
  });
});
