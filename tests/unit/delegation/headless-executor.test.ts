/**
 * Tests for headless-executor CLI flag passthrough feature
 * Covers: duplicate flag filtering, undefined checks, flag construction
 */

import { describe, it, expect } from 'bun:test';
import { summarizeClaudeLaunchArgsForLog } from '../../../src/delegation/headless-executor';

describe('HeadlessExecutor flag construction', () => {
  // Test the flag construction logic by simulating the filtering behavior
  // Since HeadlessExecutor.execute() spawns a process, we test the logic directly

  describe('Duplicate flag filtering', () => {
    function filterExtraArgs(extraArgs: string[], explicitFlags: Set<string>): string[] {
      const filteredExtras: string[] = [];
      for (let i = 0; i < extraArgs.length; i++) {
        if (explicitFlags.has(extraArgs[i])) {
          // Skip this flag and its value (next element)
          if (i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('-')) {
            i++; // Skip value too
          }
          continue;
        }
        filteredExtras.push(extraArgs[i]);
      }
      return filteredExtras;
    }

    const explicitFlags = new Set(['--max-turns', '--fallback-model', '--agents', '--betas']);

    it('removes duplicate --max-turns from extraArgs', () => {
      const result = filterExtraArgs(['--max-turns', '10', '--verbose'], explicitFlags);
      expect(result).not.toContain('--max-turns');
      expect(result).not.toContain('10');
      expect(result).toContain('--verbose');
    });

    it('removes duplicate --fallback-model from extraArgs', () => {
      const result = filterExtraArgs(['--fallback-model', 'opus', '--debug'], explicitFlags);
      expect(result).not.toContain('--fallback-model');
      expect(result).not.toContain('opus');
      expect(result).toContain('--debug');
    });

    it('removes duplicate --agents from extraArgs', () => {
      const result = filterExtraArgs(['--agents', '{"x":1}', '--json'], explicitFlags);
      expect(result).not.toContain('--agents');
      expect(result).not.toContain('{"x":1}');
      expect(result).toContain('--json');
    });

    it('removes duplicate --betas from extraArgs', () => {
      const result = filterExtraArgs(['--betas', 'feature1', '--output', 'json'], explicitFlags);
      expect(result).not.toContain('--betas');
      expect(result).not.toContain('feature1');
      expect(result).toContain('--output');
      expect(result).toContain('json');
    });

    it('handles flag at end of array without value', () => {
      const result = filterExtraArgs(['--verbose', '--max-turns'], explicitFlags);
      expect(result).toContain('--verbose');
      expect(result).not.toContain('--max-turns');
    });

    it('handles flag with dash-prefixed next arg (not a value)', () => {
      const result = filterExtraArgs(['--max-turns', '--verbose'], explicitFlags);
      // --max-turns is filtered, but --verbose is kept because it starts with -
      expect(result).not.toContain('--max-turns');
      expect(result).toContain('--verbose');
    });

    it('preserves unknown flags', () => {
      const result = filterExtraArgs(['--custom-flag', 'value', '--another'], explicitFlags);
      expect(result).toEqual(['--custom-flag', 'value', '--another']);
    });

    it('handles empty array', () => {
      const result = filterExtraArgs([], explicitFlags);
      expect(result).toEqual([]);
    });

    it('removes multiple duplicate flags', () => {
      const result = filterExtraArgs(
        ['--max-turns', '5', '--agents', '{}', '--fallback-model', 'sonnet'],
        explicitFlags
      );
      expect(result).toEqual([]);
    });
  });

  describe('Debug launch-arg logging', () => {
    it('summarizes launch args without persisting prompt text or passthrough secret values', () => {
      const prompt = 'please analyze api_key=plainsecretvalue in this prompt';
      const args = [
        '-p',
        prompt,
        '--settings',
        '/tmp/settings.json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--api-key',
        'plainsecretvalue',
      ];

      const summary = summarizeClaudeLaunchArgsForLog(args, 2);
      const serialized = JSON.stringify(summary);

      expect(serialized).not.toContain(prompt);
      expect(serialized).not.toContain('plainsecretvalue');
      expect(summary).toMatchObject({
        argCount: args.length,
        hasPrompt: true,
        hasSettings: true,
        outputFormat: 'configured',
        verbose: true,
        filteredExtraArgCount: 2,
      });
    });
  });

  describe('Flag undefined vs truthy checks', () => {
    // Simulate the flag construction logic
    function buildArgs(options: {
      maxTurns?: number;
      fallbackModel?: string;
      agents?: string;
      betas?: string;
    }): string[] {
      const args: string[] = [];
      const { maxTurns, fallbackModel, agents, betas } = options;

      if (maxTurns !== undefined && maxTurns > 0) {
        args.push('--max-turns', String(maxTurns));
      }
      if (fallbackModel !== undefined && fallbackModel) {
        args.push('--fallback-model', fallbackModel);
      }
      if (agents !== undefined && agents) {
        args.push('--agents', agents);
      }
      if (betas !== undefined && betas) {
        args.push('--betas', betas);
      }

      return args;
    }

    it('handles all undefined options', () => {
      const args = buildArgs({});
      expect(args).toEqual([]);
    });

    it('handles maxTurns = 0 (should not add flag)', () => {
      const args = buildArgs({ maxTurns: 0 });
      expect(args).toEqual([]);
    });

    it('handles maxTurns > 0', () => {
      const args = buildArgs({ maxTurns: 10 });
      expect(args).toEqual(['--max-turns', '10']);
    });

    it('handles empty string fallbackModel (should not add flag)', () => {
      const args = buildArgs({ fallbackModel: '' });
      expect(args).toEqual([]);
    });

    it('handles valid fallbackModel', () => {
      const args = buildArgs({ fallbackModel: 'sonnet' });
      expect(args).toEqual(['--fallback-model', 'sonnet']);
    });

    it('handles empty string agents (should not add flag)', () => {
      const args = buildArgs({ agents: '' });
      expect(args).toEqual([]);
    });

    it('handles valid JSON agents', () => {
      const args = buildArgs({ agents: '{"name":"test"}' });
      expect(args).toEqual(['--agents', '{"name":"test"}']);
    });

    it('handles all valid options', () => {
      const args = buildArgs({
        maxTurns: 5,
        fallbackModel: 'opus',
        agents: '{}',
        betas: 'feature1',
      });
      expect(args).toContain('--max-turns');
      expect(args).toContain('--fallback-model');
      expect(args).toContain('--agents');
      expect(args).toContain('--betas');
    });
  });
});
