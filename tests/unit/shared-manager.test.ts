/**
 * Unit tests for SharedManager - plugin registry path normalization
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test the normalization regex pattern directly
const normalizePluginPaths = (content: string): string => {
  return content.replace(/\/\.ccs\/instances\/[^/]+\//g, '/.claude/');
};

describe('SharedManager', () => {
  describe('normalizePluginRegistryPaths', () => {
    describe('regex pattern', () => {
      it('should replace instance paths with canonical claude path', () => {
        const input = '/home/user/.ccs/instances/ck/plugins/cache/plugin/0.0.2';
        const expected = '/home/user/.claude/plugins/cache/plugin/0.0.2';
        expect(normalizePluginPaths(input)).toBe(expected);
      });

      it('should handle different instance names', () => {
        const inputs = [
          '/home/user/.ccs/instances/work/plugins/cache/plugin/1.0.0',
          '/home/user/.ccs/instances/personal/plugins/cache/plugin/1.0.0',
          '/home/user/.ccs/instances/test-account/plugins/cache/plugin/1.0.0',
        ];
        for (const input of inputs) {
          expect(normalizePluginPaths(input)).toContain('/.claude/');
          expect(normalizePluginPaths(input)).not.toContain('/.ccs/instances/');
        }
      });

      it('should handle multiple occurrences', () => {
        const input = JSON.stringify({
          plugins: {
            'plugin-a': [{ installPath: '/home/user/.ccs/instances/ck/plugins/a' }],
            'plugin-b': [{ installPath: '/home/user/.ccs/instances/work/plugins/b' }],
          },
        });
        const result = normalizePluginPaths(input);
        expect(result).not.toContain('/.ccs/instances/');
        expect(result.match(/\.claude/g)?.length).toBe(2);
      });

      it('should not modify already-canonical paths', () => {
        const input = '/home/user/.claude/plugins/cache/plugin/0.0.2';
        expect(normalizePluginPaths(input)).toBe(input);
      });

      it('should be idempotent', () => {
        const input = '/home/user/.ccs/instances/ck/plugins/cache/plugin/0.0.2';
        const first = normalizePluginPaths(input);
        const second = normalizePluginPaths(first);
        expect(first).toBe(second);
      });

      it('should preserve JSON structure', () => {
        const original = {
          version: 2,
          plugins: {
            'claude-hud@claude-hud': [
              {
                scope: 'user',
                installPath: '/home/kai/.ccs/instances/ck/plugins/cache/claude-hud/claude-hud/0.0.2',
                version: '0.0.2',
              },
            ],
          },
        };
        const input = JSON.stringify(original, null, 2);
        const result = normalizePluginPaths(input);

        // Should be valid JSON
        expect(() => JSON.parse(result)).not.toThrow();

        // Should have normalized path
        const parsed = JSON.parse(result);
        expect(parsed.plugins['claude-hud@claude-hud'][0].installPath).toBe(
          '/home/kai/.claude/plugins/cache/claude-hud/claude-hud/0.0.2'
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty object', () => {
        const input = JSON.stringify({});
        expect(normalizePluginPaths(input)).toBe(input);
      });

      it('should handle plugins without installPath', () => {
        const input = JSON.stringify({ plugins: {} });
        expect(normalizePluginPaths(input)).toBe(input);
      });

      it('should handle Windows-style paths (backslash)', () => {
        // Windows paths use backslashes, regex should not match
        const input = 'C:\\Users\\user\\.ccs\\instances\\ck\\plugins\\cache';
        expect(normalizePluginPaths(input)).toBe(input);
      });
    });
  });
});
