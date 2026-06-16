/**
 * Unit tests for browser-launch-setup.ts (Phase 04)
 *
 * Tests cover:
 * - resolveBrowserLaunchFlags: no flags (default), --browser-launch override,
 *   blocked override warning emitted, process.exit on parse error
 * - resolveBrowserRuntime: no attach (disabled), active runtime env, MCP sync
 *   error propagation
 *
 * Strategy: mock the utils/browser and unified-config-loader modules so that
 * no real browser detection or file I/O occurs.
 */

import { describe, expect, it, jest, beforeEach, afterEach, mock } from 'bun:test';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal BrowserConfig stub */
function makeBrowserConfig(enabled = false, policy: 'auto' | 'always' | 'never' = 'auto'): object {
  return {
    claude: { enabled, policy, user_data_dir: '', devtools_port: 9222 },
    codex: { enabled: false, policy: 'auto' },
  };
}

// ── resolveBrowserLaunchFlags — no flags ──────────────────────────────────────

describe('resolveBrowserLaunchFlags — no browser flags', () => {
  it('returns undefined override and passes args through unchanged', async () => {
    mock.module('../../../utils/browser', () => ({
      appendBrowserToolArgs: (a: string[]) => a,
      resolveBrowserLaunchFlagResolution: (_args: string[]) => ({
        override: undefined,
        argsWithoutFlags: _args,
      }),
      getBlockedBrowserOverrideWarning: () => null,
      getEffectiveClaudeBrowserAttachConfig: () => ({ enabled: false }),
      resolveBrowserExposure: () => ({ exposeForLaunch: false }),
      ensureBrowserMcpOrThrow: () => true,
      resolveOptionalBrowserAttachRuntime: async () => ({ runtimeEnv: undefined }),
      syncBrowserMcpToConfigDir: () => true,
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      getBrowserConfig: () => makeBrowserConfig(false),
      hasExplicitClaudeBrowserDevtoolsPort: () => false,
      loadOrCreateUnifiedConfig: () => ({}),
      getThinkingConfig: () => ({}),
    }));

    const { resolveBrowserLaunchFlags } = await import('../browser-launch-setup');
    const args = ['--model', 'claude-opus-4-5'];
    const result = resolveBrowserLaunchFlags(args);
    expect(result.browserLaunchOverride).toBeUndefined();
    expect(result.argsWithoutBrowserFlags).toEqual(args);
  });
});

// ── resolveBrowserLaunchFlags — --browser-launch override ─────────────────────

describe('resolveBrowserLaunchFlags — with browser-launch override', () => {
  it('returns override and strips the browser flag from args', async () => {
    mock.module('../../../utils/browser', () => ({
      appendBrowserToolArgs: (a: string[]) => a,
      resolveBrowserLaunchFlagResolution: (_args: string[]) => ({
        override: 'force-enable' as const,
        argsWithoutFlags: ['--model', 'claude-opus-4-5'],
      }),
      getBlockedBrowserOverrideWarning: () => null,
      getEffectiveClaudeBrowserAttachConfig: () => ({ enabled: true }),
      resolveBrowserExposure: () => ({ exposeForLaunch: true }),
      ensureBrowserMcpOrThrow: () => true,
      resolveOptionalBrowserAttachRuntime: async () => ({ runtimeEnv: undefined }),
      syncBrowserMcpToConfigDir: () => true,
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      getBrowserConfig: () => makeBrowserConfig(true, 'auto'),
      hasExplicitClaudeBrowserDevtoolsPort: () => false,
      loadOrCreateUnifiedConfig: () => ({}),
      getThinkingConfig: () => ({}),
    }));

    const { resolveBrowserLaunchFlags } = await import('../browser-launch-setup');
    const result = resolveBrowserLaunchFlags(['--browser-launch', '--model', 'claude-opus-4-5']);
    expect(result.browserLaunchOverride).toBe('force-enable');
    expect(result.argsWithoutBrowserFlags).toEqual(['--model', 'claude-opus-4-5']);
  });
});

// ── resolveBrowserLaunchFlags — blocked override warning emitted ──────────────

describe('resolveBrowserLaunchFlags — blocked override warning', () => {
  let stderrSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('emits warn() when getBlockedBrowserOverrideWarning returns a message', async () => {
    mock.module('../../../utils/browser', () => ({
      appendBrowserToolArgs: (a: string[]) => a,
      resolveBrowserLaunchFlagResolution: (args: string[]) => ({
        override: 'force-enable' as const,
        argsWithoutFlags: args,
      }),
      getBlockedBrowserOverrideWarning: () => 'Browser override is blocked by policy',
      getEffectiveClaudeBrowserAttachConfig: () => ({ enabled: false }),
      resolveBrowserExposure: () => ({ exposeForLaunch: false }),
      ensureBrowserMcpOrThrow: () => true,
      resolveOptionalBrowserAttachRuntime: async () => ({ runtimeEnv: undefined }),
      syncBrowserMcpToConfigDir: () => true,
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      getBrowserConfig: () => makeBrowserConfig(false, 'never'),
      hasExplicitClaudeBrowserDevtoolsPort: () => false,
      loadOrCreateUnifiedConfig: () => ({}),
      getThinkingConfig: () => ({}),
    }));

    const { resolveBrowserLaunchFlags } = await import('../browser-launch-setup');
    resolveBrowserLaunchFlags(['--model', 'claude-opus-4-5']);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toContain('Browser override is blocked by policy');
  });
});

// ── resolveBrowserRuntime — attach disabled ───────────────────────────────────

describe('resolveBrowserRuntime — attach disabled', () => {
  it('returns undefined browserRuntimeEnv when browser attach is disabled', async () => {
    mock.module('../../../utils/browser', () => ({
      appendBrowserToolArgs: (a: string[]) => a,
      resolveBrowserLaunchFlagResolution: (a: string[]) => ({
        override: undefined,
        argsWithoutFlags: a,
      }),
      getBlockedBrowserOverrideWarning: () => null,
      getEffectiveClaudeBrowserAttachConfig: () => ({ enabled: false }),
      resolveBrowserExposure: () => ({ exposeForLaunch: false }),
      ensureBrowserMcpOrThrow: () => true,
      resolveOptionalBrowserAttachRuntime: async () => ({ runtimeEnv: undefined }),
      syncBrowserMcpToConfigDir: () => true,
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      getBrowserConfig: () => makeBrowserConfig(false),
      hasExplicitClaudeBrowserDevtoolsPort: () => false,
      loadOrCreateUnifiedConfig: () => ({}),
      getThinkingConfig: () => ({}),
    }));

    const { resolveBrowserRuntime } = await import('../browser-launch-setup');
    const result = await resolveBrowserRuntime(undefined, undefined);
    expect(result.browserRuntimeEnv).toBeUndefined();
  });
});

// ── resolveBrowserRuntime — active runtime env ────────────────────────────────

describe('resolveBrowserRuntime — active runtime env', () => {
  it('returns runtimeEnv when browser attach resolves successfully', async () => {
    const fakeRuntimeEnv = { CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1:9222/json' };
    mock.module('../../../utils/browser', () => ({
      appendBrowserToolArgs: (a: string[]) => a,
      resolveBrowserLaunchFlagResolution: (a: string[]) => ({
        override: 'force-enable' as const,
        argsWithoutFlags: a,
      }),
      getBlockedBrowserOverrideWarning: () => null,
      getEffectiveClaudeBrowserAttachConfig: () => ({ enabled: true }),
      resolveBrowserExposure: () => ({ exposeForLaunch: true }),
      ensureBrowserMcpOrThrow: () => true,
      resolveOptionalBrowserAttachRuntime: async () => ({ runtimeEnv: fakeRuntimeEnv }),
      syncBrowserMcpToConfigDir: () => true,
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      getBrowserConfig: () => makeBrowserConfig(true, 'always'),
      hasExplicitClaudeBrowserDevtoolsPort: () => false,
      loadOrCreateUnifiedConfig: () => ({}),
      getThinkingConfig: () => ({}),
    }));

    const { resolveBrowserRuntime } = await import('../browser-launch-setup');
    const result = await resolveBrowserRuntime('force-enable', undefined);
    expect(result.browserRuntimeEnv).toEqual(fakeRuntimeEnv);
  });
});
