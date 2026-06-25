import { describe, expect, test } from 'bun:test';

import { CodexAdapter } from '../../../src/targets/codex-adapter';
import { CCSXP_CLIPROXY_SHORTCUT_ENV } from '../../../src/targets/codex-cliproxy-provider-config';
import {
  buildCodexBrowserMcpOverrides,
  getCodexBrowserMcpServerName,
} from '../../../src/utils/browser-codex-overrides';

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

  test('builds browser MCP overrides with Codex-safe defaults', () => {
    const serverName = getCodexBrowserMcpServerName();
    expect(buildCodexBrowserMcpOverrides()).toEqual([
      `mcp_servers.${serverName}.command=${JSON.stringify(process.platform === 'win32' ? 'npx.cmd' : 'npx')}`,
      `mcp_servers.${serverName}.args=${JSON.stringify(['-y', '@playwright/mcp@0.0.70'])}`,
      `mcp_servers.${serverName}.enabled=true`,
      `mcp_servers.${serverName}.tool_timeout_sec=30`,
    ]);
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
      binaryInfo: {
        path: '/tmp/codex',
        needsShell: false,
        features: ['config-overrides'],
      },
    });

    expect(args).toEqual(['-c', 'model_reasoning_effort="medium"', '--search']);
  });

  test('injects runtime config overrides for native Codex default launches', () => {
    const runtimeConfigOverrides = buildCodexBrowserMcpOverrides();
    const args = adapter.buildArgs('default', ['--search'], {
      profileType: 'default',
      creds: {
        profile: 'default',
        baseUrl: '',
        apiKey: '',
        runtimeConfigOverrides,
      },
      binaryInfo: {
        path: '/tmp/codex',
        needsShell: false,
        features: ['config-overrides'],
      },
    });

    expect(args).toEqual([
      ...runtimeConfigOverrides.flatMap((override) => ['-c', override]),
      '--search',
    ]);
  });

  test('rejects default-mode reasoning overrides when codex lacks config override support', () => {
    expect(() =>
      adapter.buildArgs('default', ['--search'], {
        profileType: 'default',
        creds: {
          profile: 'default',
          baseUrl: '',
          apiKey: '',
          reasoningOverride: 'high',
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

  test('rejects ccsxp default launches when codex lacks config override support', () => {
    const originalShortcut = process.env[CCSXP_CLIPROXY_SHORTCUT_ENV];
    process.env[CCSXP_CLIPROXY_SHORTCUT_ENV] = '1';
    try {
      expect(() =>
        adapter.buildArgs('default', ['--config', 'model_provider="cliproxy"', '--version'], {
          profileType: 'default',
          binaryInfo: {
            path: '/tmp/codex',
            needsShell: false,
            version: 'codex-cli 0.1.0',
            features: [],
          },
        })
      ).toThrow(/does not advertise --config overrides/);
    } finally {
      if (originalShortcut === undefined) {
        delete process.env[CCSXP_CLIPROXY_SHORTCUT_ENV];
      } else {
        process.env[CCSXP_CLIPROXY_SHORTCUT_ENV] = originalShortcut;
      }
    }
  });

  test('injects transient config overrides for CCS-backed launches', () => {
    const runtimeConfigOverrides = buildCodexBrowserMcpOverrides();
    const args = adapter.buildArgs('codex', ['--search'], {
      profileType: 'cliproxy',
      creds: {
        profile: 'codex',
        baseUrl: 'http://127.0.0.1:8317',
        apiKey: 'cliproxy-token',
        model: 'gpt-5.4',
        reasoningOverride: 'high',
        runtimeConfigOverrides,
      },
      binaryInfo: {
        path: '/tmp/codex',
        needsShell: false,
        features: ['config-overrides'],
      },
    });

    expect(args).toContain('-c');
    expect(args).toContain('model_provider="ccs_runtime"');
    expect(args).toContain(
      'model_providers.ccs_runtime.base_url="http://127.0.0.1:8317/backend-api/codex"'
    );
    expect(args).toContain('model_providers.ccs_runtime.env_key="CCS_CODEX_API_KEY"');
    expect(args).toContain('model="gpt-5.4"');
    expect(args).toContain(
      `mcp_servers.${getCodexBrowserMcpServerName()}.command=${JSON.stringify(process.platform === 'win32' ? 'npx.cmd' : 'npx')}`
    );
    expect(args).toContain('model_reasoning_effort="high"');
    expect(args[args.length - 1]).toBe('--search');
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

  test('rejects user-supplied --config overrides for CCS-backed launches', () => {
    const options = {
      profileType: 'cliproxy' as const,
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
    };

    expect(() => adapter.buildArgs('codex', ['-c', 'model="other"', '--search'], options)).toThrow(
      /does not allow --config\/-c/
    );
    expect(() =>
      adapter.buildArgs('codex', ['--config=model="other"', '--search'], options)
    ).toThrow(/does not allow --config\/-c/);
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
    const originalCodeXHome = process.env.CODEX_HOME;
    const originalCodeXCi = process.env.CODEX_CI;
    const originalCodeXManagedByBun = process.env.CODEX_MANAGED_BY_BUN;
    const originalCodeXThreadId = process.env.CODEX_THREAD_ID;
    const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

    try {
      process.env.CODEX_HOME = '/tmp/codex-home';
      process.env.CODEX_CI = '1';
      process.env.CODEX_MANAGED_BY_BUN = '1';
      process.env.CODEX_THREAD_ID = 'thread-123';
      process.env.ANTHROPIC_BASE_URL = 'https://stale-proxy.invalid';

      const settingsEnv = adapter.buildEnv(
        {
          profile: 'codex',
          baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
          apiKey: 'cliproxy-token',
        },
        'cliproxy'
      );
      expect(settingsEnv.CCS_CODEX_API_KEY).toBe('cliproxy-token');
      expect(settingsEnv.CODEX_HOME).toBe('/tmp/codex-home');
      expect(settingsEnv.CODEX_CI).toBeUndefined();
      expect(settingsEnv.CODEX_MANAGED_BY_BUN).toBeUndefined();
      expect(settingsEnv.CODEX_THREAD_ID).toBeUndefined();
      expect(settingsEnv.ANTHROPIC_BASE_URL).toBeUndefined();

      const defaultEnv = adapter.buildEnv(
        {
          profile: 'default',
          baseUrl: '',
          apiKey: '',
        },
        'default'
      );
      expect(defaultEnv.CCS_CODEX_API_KEY).toBeUndefined();
      expect(defaultEnv.CODEX_HOME).toBe('/tmp/codex-home');
      expect(defaultEnv.CODEX_CI).toBeUndefined();
      expect(defaultEnv.CODEX_MANAGED_BY_BUN).toBeUndefined();
      expect(defaultEnv.CODEX_THREAD_ID).toBeUndefined();
      expect(defaultEnv.ANTHROPIC_BASE_URL).toBeUndefined();
    } finally {
      if (originalCodeXHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodeXHome;
      }
      if (originalCodeXCi === undefined) {
        delete process.env.CODEX_CI;
      } else {
        process.env.CODEX_CI = originalCodeXCi;
      }
      if (originalCodeXManagedByBun === undefined) {
        delete process.env.CODEX_MANAGED_BY_BUN;
      } else {
        process.env.CODEX_MANAGED_BY_BUN = originalCodeXManagedByBun;
      }
      if (originalCodeXThreadId === undefined) {
        delete process.env.CODEX_THREAD_ID;
      } else {
        process.env.CODEX_THREAD_ID = originalCodeXThreadId;
      }
      if (originalAnthropicBaseUrl === undefined) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl;
      }
    }
  });
});
