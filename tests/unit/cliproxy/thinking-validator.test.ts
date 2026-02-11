/**
 * Thinking Validator Unit Tests
 *
 * Tests for thinking budget validation logic
 */

import { describe, it, expect } from 'bun:test';
import {
  validateThinking,
  THINKING_LEVEL_BUDGETS,
  VALID_THINKING_LEVELS,
  THINKING_OFF_VALUES,
  THINKING_BUDGET_MIN,
  THINKING_BUDGET_MAX,
  THINKING_BUDGET_DEFAULT_MIN,
} from '../../../src/cliproxy/thinking-validator';

describe('Thinking Validator', () => {
  describe('Constants', () => {
    it('should export valid budget bounds', () => {
      expect(THINKING_BUDGET_MIN).toBe(0);
      expect(THINKING_BUDGET_MAX).toBe(100000);
      expect(THINKING_BUDGET_DEFAULT_MIN).toBe(512);
    });

    it('should export valid thinking levels', () => {
      expect(VALID_THINKING_LEVELS).toContain('minimal');
      expect(VALID_THINKING_LEVELS).toContain('low');
      expect(VALID_THINKING_LEVELS).toContain('medium');
      expect(VALID_THINKING_LEVELS).toContain('high');
      expect(VALID_THINKING_LEVELS).toContain('xhigh');
      expect(VALID_THINKING_LEVELS).toContain('auto');
    });

    it('should export level budget mappings', () => {
      expect(THINKING_LEVEL_BUDGETS.minimal).toBe(512);
      expect(THINKING_LEVEL_BUDGETS.low).toBe(1024);
      expect(THINKING_LEVEL_BUDGETS.medium).toBe(8192);
      expect(THINKING_LEVEL_BUDGETS.high).toBe(24576);
      expect(THINKING_LEVEL_BUDGETS.xhigh).toBe(32768);
    });

    it('should export off values', () => {
      expect(THINKING_OFF_VALUES).toContain('off');
      expect(THINKING_OFF_VALUES).toContain('none');
      expect(THINKING_OFF_VALUES).toContain('disabled');
      expect(THINKING_OFF_VALUES).toContain('0');
    });
  });

  describe('Off values', () => {
    it('should handle "off" value', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 'off');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('off');
      expect(result.warning).toBeUndefined();
    });

    it('should handle "none" value', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 'none');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('off');
    });

    it('should handle "disabled" value', () => {
      const result = validateThinking('agy', 'claude-sonnet-4-20250514', 'disabled');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('off');
    });

    it('should handle "0" string as off', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', '0');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('off');
    });

    it('should be case-insensitive for off values', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 'OFF');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('off');
    });
  });

  describe('Named levels (levels-type models like Gemini)', () => {
    it('should accept valid level names', () => {
      const levels = ['low', 'medium', 'high'];
      for (const level of levels) {
        const result = validateThinking('gemini', 'gemini-3-pro-preview', level);
        expect(result.valid).toBe(true);
      }
    });

    it('should be case-insensitive for level names', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 'HIGH');
      expect(result.valid).toBe(true);
    });

    it('should map numeric budgets to closest level for level-type models', () => {
      // Level-type models convert budget to closest named level
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 8192);
      expect(result.valid).toBe(true);
      expect(typeof result.value).toBe('string'); // Should be a level name
      expect(result.warning).toContain('Mapped');
    });
  });

  describe('Budget-type models (like Claude via agy)', () => {
    // Claude models via agy use budget-type thinking
    const budgetModel = 'claude-sonnet-4-5-thinking';

    it('should accept valid numeric budget', () => {
      const result = validateThinking('agy', budgetModel, 8192);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(8192);
    });

    it('should accept numeric string budget', () => {
      const result = validateThinking('agy', budgetModel, '8192');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(8192);
    });

    it('should reject negative budgets', () => {
      const result = validateThinking('agy', budgetModel, -100);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('Negative');
    });

    it('should clamp excessively high budgets', () => {
      const result = validateThinking('agy', budgetModel, 999999999);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('Clamped');
    });

    it('should reject partial numeric parses like "123abc"', () => {
      const result = validateThinking('agy', budgetModel, '123abc');
      // Should either fail or find closest level match, not parse as 123
      expect(result.value).not.toBe(123);
    });
  });

  describe('Auto value', () => {
    it('should accept auto value', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', 'auto');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('auto');
    });
  });

  describe('Unknown models', () => {
    it('should pass through value for unknown models with warning', () => {
      const result = validateThinking('gemini', 'unknown-model-xyz', 'high');
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace in input', () => {
      const result = validateThinking('gemini', 'gemini-3-pro-preview', '  high  ');
      expect(result.valid).toBe(true);
    });

    it('should handle empty string by passing through for unknown', () => {
      // Empty string on known model goes to level/budget validation
      const result = validateThinking('gemini', 'gemini-3-pro-preview', '');
      // For level-type models, empty string will try to match levels
      expect(result.valid).toBeDefined(); // Just check it doesn't crash
    });
  });
});
