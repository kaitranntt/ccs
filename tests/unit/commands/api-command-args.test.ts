import { describe, expect, test } from 'bun:test';

import {
  applyClaudeExtendedContextPreference,
  collectUnexpectedApiArgs,
  hasClaudeModelMapping,
  hasExplicitClaudeExtendedContext,
  parseApiCommandArgs,
} from '../../../src/commands/api-command/shared';

describe('api-command arg parser', () => {
  test('keeps positional API name when boolean flags precede it', () => {
    const parsed = parseApiCommandArgs(['--yes', 'my-api']);

    expect(parsed.yes).toBe(true);
    expect(parsed.name).toBe('my-api');
  });

  test('uses last value when repeated value flags are provided', () => {
    const parsed = parseApiCommandArgs([
      'profile-a',
      '--model',
      'claude-3-5-sonnet',
      '--model=claude-3-7-sonnet',
    ]);

    expect(parsed.name).toBe('profile-a');
    expect(parsed.model).toBe('claude-3-7-sonnet');
    expect(parsed.errors).toEqual([]);
  });

  test('collects missing-value errors for required option values', () => {
    const parsed = parseApiCommandArgs(['profile-a', '--base-url', '--api-key']);

    expect(parsed.errors).toEqual(['Missing value for --base-url', 'Missing value for --api-key']);
  });

  test('supports option terminator for positional args that look like flags', () => {
    const parsed = parseApiCommandArgs(['--yes', '--', '-my-api']);

    expect(parsed.yes).toBe(true);
    expect(parsed.name).toBe('-my-api');
  });

  test('parses --target for default profile target', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target', 'droid']);

    expect(parsed.name).toBe('my-api');
    expect(parsed.target).toBe('droid');
    expect(parsed.errors).toEqual([]);
  });

  test('parses --target=value for default profile target', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target=droid']);

    expect(parsed.name).toBe('my-api');
    expect(parsed.target).toBe('droid');
    expect(parsed.errors).toEqual([]);
  });

  test('parses --cliproxy-provider for routed API profile creation', () => {
    const parsed = parseApiCommandArgs(['my-api', '--cliproxy-provider', 'Gemini']);

    expect(parsed.name).toBe('my-api');
    expect(parsed.cliproxyProvider).toBe('gemini');
    expect(parsed.errors).toEqual([]);
  });

  test('validates invalid --target values', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target', 'invalid-target']);

    expect(parsed.target).toBeUndefined();
    expect(parsed.errors).toEqual([
      'Invalid --target value "invalid-target". Use: claude or droid',
    ]);
  });

  test('rejects runtime-only codex as a persisted API target value', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target', 'codex']);

    expect(parsed.target).toBeUndefined();
    expect(parsed.errors).toEqual(['Invalid --target value "codex". Use: claude or droid']);
  });

  test('collects missing-value error for --target with no value', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target']);

    expect(parsed.target).toBeUndefined();
    expect(parsed.errors).toEqual(['Missing value for --target']);
  });

  test('treats empty --target=value as missing value', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target=']);

    expect(parsed.target).toBeUndefined();
    expect(parsed.errors).toEqual(['Missing value for --target']);
  });

  test('uses last --target value when repeated', () => {
    const parsed = parseApiCommandArgs(['my-api', '--target', 'claude', '--target=droid']);

    expect(parsed.name).toBe('my-api');
    expect(parsed.target).toBe('droid');
    expect(parsed.errors).toEqual([]);
  });

  test('collects unknown options and unexpected trailing positionals', () => {
    const parsed = parseApiCommandArgs(['my-api', '--taret', 'droid', '--yes']);

    expect(parsed.name).toBe('my-api');
    expect(parsed.errors).toEqual(['Unknown option: --taret', 'Unexpected arguments: droid']);
  });

  test('rejects extra positionals for single-name commands by default', () => {
    const parsed = parseApiCommandArgs(['source', 'destination', '--yes']);

    expect(parsed.positionals).toEqual(['source', 'destination']);
    expect(parsed.errors).toEqual(['Unexpected arguments: destination']);
  });

  test('allows copy-style two-positional parsing when requested', () => {
    const parsed = parseApiCommandArgs(['source', 'destination', '--yes'], {
      maxPositionals: 2,
    });

    expect(parsed.positionals).toEqual(['source', 'destination']);
    expect(parsed.errors).toEqual([]);
  });

  test('preserves dash-prefixed names after option terminator', () => {
    const parsed = parseApiCommandArgs(['--yes', '--', '-my-api', 'backup'], {
      maxPositionals: 2,
    });

    expect(parsed.positionals).toEqual(['-my-api', 'backup']);
    expect(parsed.errors).toEqual([]);
  });

  test('accepts single-dash model values without treating them as unknown flags', () => {
    const parsed = parseApiCommandArgs(['my-api', '--model', '-preview']);

    expect(parsed.model).toBe('-preview');
    expect(parsed.errors).toEqual([]);
  });

  test('parses --1m for explicit Claude long context', () => {
    const parsed = parseApiCommandArgs(['my-api', '--1m']);

    expect(parsed.extendedContext).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  test('parses --no-1m for explicit standard-context preference', () => {
    const parsed = parseApiCommandArgs(['my-api', '--no-1m']);

    expect(parsed.extendedContext).toBe(false);
    expect(parsed.errors).toEqual([]);
  });

  test('rejects conflicting --1m and --no-1m flags', () => {
    const parsed = parseApiCommandArgs(['my-api', '--1m', '--no-1m']);

    expect(parsed.extendedContext).toBeUndefined();
    expect(parsed.errors).toEqual(['Cannot combine --1m and --no-1m']);
  });
});

describe('collectUnexpectedApiArgs', () => {
  test('rejects extra args after a no-arg command', () => {
    const parsed = collectUnexpectedApiArgs(['--register', 'extra'], {
      knownFlags: ['--register'],
      maxPositionals: 0,
    });

    expect(parsed.positionals).toEqual(['extra']);
    expect(parsed.errors).toEqual(['Unexpected arguments: extra']);
  });

  test('reports unknown flags separately from leftover positionals', () => {
    const parsed = collectUnexpectedApiArgs(['--bogus', 'value', '--yes'], {
      knownFlags: ['--yes'],
      maxPositionals: 0,
    });

    expect(parsed.positionals).toEqual(['value']);
    expect(parsed.errors).toEqual(['Unknown option: --bogus', 'Unexpected arguments: value']);
  });
});

describe('Claude long-context mapping helpers', () => {
  test('detects Claude mappings and explicit [1m] state across all tiers', () => {
    const models = {
      default: 'gpt-5.4',
      opus: 'claude-opus-4-6[1m]',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    };

    expect(hasClaudeModelMapping(models)).toBe(true);
    expect(hasExplicitClaudeExtendedContext(models)).toBe(true);
  });

  test('applies [1m] only to compatible Claude mappings and leaves Haiku plain', () => {
    const models = applyClaudeExtendedContextPreference(
      {
        default: 'claude-sonnet-4-6',
        opus: 'claude-opus-4-6',
        sonnet: 'claude-sonnet-4-6',
        haiku: 'claude-haiku-4-5-20251001',
      },
      true
    );

    expect(models).toEqual({
      default: 'claude-sonnet-4-6[1m]',
      opus: 'claude-opus-4-6[1m]',
      sonnet: 'claude-sonnet-4-6[1m]',
      haiku: 'claude-haiku-4-5-20251001',
    });
  });

  test('strips [1m] from Claude mappings when standard context is requested', () => {
    const models = applyClaudeExtendedContextPreference(
      {
        default: 'claude-sonnet-4-6[1m]',
        opus: 'claude-opus-4-6[1m]',
        sonnet: 'claude-sonnet-4-6[1m]',
        haiku: 'claude-haiku-4-5-20251001',
      },
      false
    );

    expect(models).toEqual({
      default: 'claude-sonnet-4-6',
      opus: 'claude-opus-4-6',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    });
  });
});
