#!/usr/bin/env node
'use strict';

/**
 * LocaleEnforcer Unit Tests
 *
 * Tests 3 scenarios:
 * 1. English prompt → English output (verify instruction injected)
 * 2. Chinese prompt → English output (verify instruction injected)
 * 3. Mixed prompt → English output (verify instruction injected)
 */

const assert = require('assert');
const { LocaleEnforcer } = require('../../../dist/glmt/locale-enforcer');

describe('LocaleEnforcer', () => {
  describe('Scenario 1: English prompt → English output', () => {
    it('should inject instruction into system prompt', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Plan a microservices architecture' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 2);
      assert.ok(result[0].content.includes('CRITICAL: You MUST respond in English only'));
      assert.ok(result[0].content.includes('You are a helpful assistant'));
      assert.strictEqual(result[1].content, 'Plan a microservices architecture');
    });

    it('should inject instruction into first user message if no system prompt', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        { role: 'user', content: 'Fix the bug in login.js' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].content.includes('CRITICAL: You MUST respond in English only'));
      assert.ok(result[0].content.includes('Fix the bug in login.js'));
    });

    it('should handle array content in system message', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a code assistant.' }
          ]
        },
        { role: 'user', content: 'Implement REST API' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 2);
      assert.ok(Array.isArray(result[0].content));
      assert.strictEqual(result[0].content[0].type, 'text');
      assert.ok(result[0].content[0].text.includes('CRITICAL: You MUST respond in English only'));
      assert.strictEqual(result[0].content[1].text, 'You are a code assistant.');
    });
  });

  describe('Scenario 2: Chinese prompt → English output', () => {
    it('should inject instruction for Chinese prompts', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        { role: 'system', content: '你是一个编程助手' },
        { role: 'user', content: '实现用户认证系统' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 2);
      assert.ok(result[0].content.includes('CRITICAL: You MUST respond in English only'));
      assert.ok(result[0].content.includes('你是一个编程助手'));
      assert.strictEqual(result[1].content, '实现用户认证系统');
    });

    it('should handle Chinese content in array format', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: '分析代码性能' }
          ]
        }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.ok(Array.isArray(result[0].content));
      assert.strictEqual(result[0].content[0].type, 'text');
      assert.ok(result[0].content[0].text.includes('CRITICAL: You MUST respond in English only'));
      assert.strictEqual(result[0].content[1].text, '分析代码性能');
    });
  });

  describe('Scenario 3: Mixed language prompt → English output', () => {
    it('should inject instruction for mixed English and Chinese', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        { role: 'user', content: 'Implement 用户登录 with JWT authentication' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].content.includes('CRITICAL: You MUST respond in English only'));
      assert.ok(result[0].content.includes('Implement 用户登录 with JWT authentication'));
    });

    it('should handle mixed content with multiple text blocks', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Create a REST API for ' },
            { type: 'text', text: '产品管理' }
          ]
        }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.ok(Array.isArray(result[0].content));
      assert.strictEqual(result[0].content.length, 3); // Instruction + 2 original blocks
      assert.ok(result[0].content[0].text.includes('CRITICAL: You MUST respond in English only'));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty messages array', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 0);
    });

    it('should handle messages with no system or user role', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const messages = [
        { role: 'assistant', content: 'Previous response' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].content, 'Previous response');
    });

    it('should not mutate original messages array', () => {
      const enforcer = new LocaleEnforcer({ forceEnglish: true });
      const originalMessages = [
        { role: 'user', content: 'Test prompt' }
      ];
      const originalCopy = JSON.parse(JSON.stringify(originalMessages));

      enforcer.injectInstruction(originalMessages);

      assert.deepStrictEqual(originalMessages, originalCopy);
    });

    it('should handle default forceEnglish option (should be true)', () => {
      const enforcer = new LocaleEnforcer();
      const messages = [
        { role: 'user', content: 'Test' }
      ];

      const result = enforcer.injectInstruction(messages);

      assert.ok(result[0].content.includes('CRITICAL: You MUST respond in English only'));
    });
  });
});
