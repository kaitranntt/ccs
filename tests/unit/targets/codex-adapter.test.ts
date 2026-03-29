import { describe, expect, test } from 'bun:test';

import { CodexAdapter } from '../../../src/targets/codex-adapter';

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  test('supports only adapter-level default and cliproxy profile types', () => {
    expect(adapter.supportsProfileType('default')).toBe(true);
    expect(adapter.supportsProfileType('cliproxy')).toBe(true);
    expect(adapter.supportsProfileType('settings')).toBe(false);
    expect(adapter.supportsProfileType('account')).toBe(false);
    expect(adapter.supportsProfileType('copilot')).toBe(false);
  });

  test('passes default-mode args through unchanged', () => {
    expect(
      adapter.buildArgs('default', ['--search'], {
        profileType: 'default',
      })
    ).toEqual(['--search']);
  });

  test('translates default-mode reasoning overrides into transient codex config', () => {
    const args = adapter.buildArgs('default', ['--search'], {
      profileType: 'default',
      creds: {
        profile: 'default',
        baseUrl: '',
        apiKey: '',
        reasoningOverride: 'medium',
      },
    });

    expect(args).toEqual(['-c', 'model_reasoning_effort="medium"', '--search']);
  });

  test('injects transient config overrides for CCS-backed launches', () => {
    const args = adapter.buildArgs('codex', ['--search'], {
      profileType: 'cliproxy',
      creds: {
        profile: 'codex',
        baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
        apiKey: 'cliproxy-token',
        model: 'gpt-5.4',
        reasoningOverride: 'high',
      },
      binaryInfo: {
        path: '/tmp/codex',
        needsShell: false,
        features: ['config-overrides'],
      },
    });

    expect(args).toContain('-c');
    expect(args).toContain('model_provider="ccs_runtime"');
    expect(args).toContain('model_providers.ccs_runtime.env_key="CCS_CODEX_API_KEY"');
    expect(args).toContain('model="gpt-5.4"');
    expect(args).toContain('model_reasoning_effort="high"');
    expect(args.at(-1)).toBe('--search');
  });

  test('fails fast when Codex binary lacks config override support', () => {
    expect(() =>
      adapter.buildArgs('codex', [], {
        profileType: 'cliproxy',
        creds: {
          profile: 'codex',
          baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
          apiKey: 'cliproxy-token',
        },
        binaryInfo: {
          path: '/tmp/codex',
          needsShell: false,
          version: 'codex-cli 0.1.0',
          features: [],
        },
      })
    ).toThrow(/does not advertise --config overrides/);
  });

  test('rejects native Codex provider-selection flags for CCS-backed launches', () => {
    expect(() =>
      adapter.buildArgs('codex', ['--profile', 'other', '--search'], {
        profileType: 'cliproxy',
        creds: {
          profile: 'codex',
          baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
          apiKey: 'cliproxy-token',
        },
        binaryInfo: {
          path: '/tmp/codex',
          needsShell: false,
          features: ['config-overrides'],
        },
      })
    ).toThrow(/does not allow --profile\/-p/);
  });

  test('rejects unsupported reasoning override values for CCS-backed launches', () => {
    expect(() =>
      adapter.buildArgs('codex', ['--search'], {
        profileType: 'cliproxy',
        creds: {
          profile: 'codex',
          baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
          apiKey: 'cliproxy-token',
          reasoningOverride: 8192,
        },
        binaryInfo: {
          path: '/tmp/codex',
          needsShell: false,
          features: ['config-overrides'],
        },
      })
    ).toThrow(/supports reasoning levels only/);
  });

  test('injects CCS_CODEX_API_KEY for CCS-backed launches only', () => {
    const settingsEnv = adapter.buildEnv(
      {
        profile: 'codex',
        baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
        apiKey: 'cliproxy-token',
      },
      'cliproxy'
    );
    expect(settingsEnv.CCS_CODEX_API_KEY).toBe('cliproxy-token');

    const defaultEnv = adapter.buildEnv(
      {
        profile: 'default',
        baseUrl: '',
        apiKey: '',
      },
      'default'
    );
    expect(defaultEnv.CCS_CODEX_API_KEY).toBeUndefined();
  });
});
