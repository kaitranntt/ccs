/**
 * Tests for claude-launcher.ts — Phase 09
 *
 * Verifies:
 * - spawn called with expected args and env
 * - Windows shell escaping path
 * - Cleanup handlers registered (setupCleanupHandlers called)
 *
 * Strategy: mock child_process.spawn and all side-effectful dependencies so
 * no real processes are started.
 */

import { describe, expect, it, jest, beforeEach, afterEach, mock } from 'bun:test';
import type { ChildProcess } from 'child_process';
import type { ExecutorConfig } from '../../types';

// ── Spawn mock ────────────────────────────────────────────────────────────────

const mockSpawnResult = {
  pid: 42,
  on: jest.fn(),
  stdout: null,
  stderr: null,
} as unknown as ChildProcess;

const mockSpawn = jest.fn().mockReturnValue(mockSpawnResult);

mock.module('child_process', () => ({
  spawn: mockSpawn,
}));

// ── Dependency mocks ──────────────────────────────────────────────────────────

const mockEscapeShellArg = jest.fn((s: string) => `"${s}"`);
const mockGetWindowsEscapedCommandShell = jest.fn().mockReturnValue('cmd.exe');

mock.module('../../../utils/shell-executor', () => ({
  escapeShellArg: mockEscapeShellArg,
  getWindowsEscapedCommandShell: mockGetWindowsEscapedCommandShell,
}));

mock.module('../../config/config-generator', () => ({
  getProviderSettingsPath: jest.fn().mockReturnValue('/fake/.ccs/settings/gemini.json'),
  CLIPROXY_DEFAULT_PORT: 8317,
  generateConfig: jest.fn(),
  getProviderConfig: jest.fn(),
}));

mock.module('../../../utils/websearch-manager', () => ({
  appendThirdPartyWebSearchToolArgs: (args: string[]) => args,
  createWebSearchTraceContext: jest.fn().mockReturnValue({}),
  ensureWebSearchMcpOrThrow: jest.fn(),
  displayWebSearchStatus: jest.fn(),
  getWebSearchHookEnv: jest.fn().mockReturnValue({}),
}));

mock.module('../../../utils/image-analysis', () => ({
  appendThirdPartyImageAnalysisToolArgs: (args: string[]) => [...args, '--mcp-image-analysis'],
  syncImageAnalysisMcpToConfigDir: jest.fn(),
  ensureImageAnalysisMcpOrThrow: jest.fn().mockReturnValue(true),
}));

mock.module('../../../utils/browser', () => ({
  appendBrowserToolArgs: (args: string[]) => [...args, '--browser'],
}));

mock.module('../../accounts/account-manager', () => ({
  getDefaultAccount: jest.fn().mockReturnValue(null),
}));

const mockSetupCleanupHandlers = jest.fn();
mock.module('../session-bridge', () => ({
  setupCleanupHandlers: mockSetupCleanupHandlers,
  checkOrJoinProxy: jest.fn(),
  registerProxySession: jest.fn(),
}));

const mockResolveRuntimeQuotaMonitorProviders = jest.fn().mockReturnValue([]);
mock.module('../account-resolution', () => ({
  resolveRuntimeQuotaMonitorProviders: mockResolveRuntimeQuotaMonitorProviders,
  resolveAccounts: jest.fn(),
}));

// Dynamic import for quota-manager
mock.module('../../quota/quota-manager', () => ({
  startQuotaMonitor: jest.fn(),
  stopQuotaMonitor: jest.fn(),
}));

const mockCleanupLaunchSettings = jest.fn();
const mockPrepareLaunchSettings = jest.fn().mockReturnValue({
  settingsPath: '/tmp/fake-settings-overlay.json',
  cleanup: mockCleanupLaunchSettings,
});

mock.module('../launch-settings', () => ({
  prepareLaunchSettings: mockPrepareLaunchSettings,
}));

// ── Subject under test ────────────────────────────────────────────────────────

import { launchClaude } from '../claude-launcher';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
  return {
    port: 8317,
    timeout: 5000,
    verbose: false,
    pollInterval: 100,
    ...overrides,
  } as ExecutorConfig;
}

function baseContext(overrides: object = {}) {
  return {
    claudeCli: '/usr/local/bin/claude',
    claudeArgs: ['chat', '--model', 'gemini-2.5-pro'],
    env: { ANTHROPIC_BASE_URL: 'http://localhost:8317' } as NodeJS.ProcessEnv,
    cfg: makeCfg(),
    provider: 'gemini' as const,
    compositeProviders: [] as string[],
    skipLocalAuth: true,
    sessionId: undefined,
    imageAnalysisMcpReady: false,
    browserRuntimeEnv: undefined,
    inheritedClaudeConfigDir: undefined,
    codexReasoningProxy: null,
    toolSanitizationProxy: null,
    httpsTunnel: null,
    verbose: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('launchClaude', () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockSetupCleanupHandlers.mockClear();
    mockEscapeShellArg.mockClear();
    mockCleanupLaunchSettings.mockClear();
    mockPrepareLaunchSettings.mockClear();
    mockPrepareLaunchSettings.mockReturnValue({
      settingsPath: '/tmp/fake-settings-overlay.json',
      cleanup: mockCleanupLaunchSettings,
    });
  });

  it('calls spawn with claudeCli and includes --settings arg', async () => {
    const ctx = baseContext();
    await launchClaude(ctx);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, spawnArgs] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('/usr/local/bin/claude');
    expect(spawnArgs).toContain('--settings');
  });

  it('inherits process env merged with provided env', async () => {
    const ctx = baseContext({ env: { CUSTOM_KEY: 'custom-value' } as NodeJS.ProcessEnv });
    await launchClaude(ctx);

    const spawnOpts = mockSpawn.mock.calls[0][2] as { env: NodeJS.ProcessEnv };
    expect(spawnOpts.env?.CUSTOM_KEY).toBe('custom-value');
  });

  it('passes stdio: inherit', async () => {
    await launchClaude(baseContext());
    const spawnOpts = mockSpawn.mock.calls[0][2] as { stdio: string };
    expect(spawnOpts.stdio).toBe('inherit');
  });

  it('appends image analysis args when imageAnalysisMcpReady=true', async () => {
    await launchClaude(baseContext({ imageAnalysisMcpReady: true }));
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain('--mcp-image-analysis');
  });

  it('does not append image analysis args when imageAnalysisMcpReady=false', async () => {
    await launchClaude(baseContext({ imageAnalysisMcpReady: false }));
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).not.toContain('--mcp-image-analysis');
  });

  it('appends browser tool args when browserRuntimeEnv is set', async () => {
    await launchClaude(
      baseContext({ browserRuntimeEnv: { CCS_BROWSER: '1' } as NodeJS.ProcessEnv })
    );
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain('--browser');
  });

  it('registers cleanup handlers after spawn', async () => {
    await launchClaude(baseContext());
    expect(mockSetupCleanupHandlers).toHaveBeenCalledTimes(1);
    // First arg should be the ChildProcess returned by spawn
    expect(mockSetupCleanupHandlers.mock.calls[0][0]).toBe(mockSpawnResult);
  });

  it('returns the ChildProcess from spawn', async () => {
    const result = await launchClaude(baseContext());
    expect(result).toBe(mockSpawnResult);
  });

  it('calls cleanup and rethrows when spawn throws synchronously', async () => {
    const spawnErr = new Error('ERR_INVALID_ARG_VALUE');
    mockSpawn.mockImplementationOnce(() => {
      throw spawnErr;
    });

    await expect(launchClaude(baseContext())).rejects.toThrow('ERR_INVALID_ARG_VALUE');
    expect(mockCleanupLaunchSettings).toHaveBeenCalledTimes(1);
  });

  describe('Windows shell escaping', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('uses shell mode for .cmd executables on Windows', async () => {
      await launchClaude(baseContext({ claudeCli: 'C:\\tools\\claude.cmd' }));
      const spawnOpts = mockSpawn.mock.calls[0][1] as { shell: string | boolean };
      // shell property should be set (cmd.exe from mock)
      expect(spawnOpts.shell).toBeTruthy();
    });

    it('skips shell mode for non-script executables on Windows', async () => {
      await launchClaude(baseContext({ claudeCli: 'C:\\tools\\claude.exe' }));
      // spawn should be called with separate args array, not a shell cmd string
      const [, secondArg] = mockSpawn.mock.calls[0];
      expect(Array.isArray(secondArg)).toBe(true);
    });
  });
});
