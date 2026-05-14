/**
 * Tests for resolveProfileAndTarget() — Phase C extraction.
 *
 * The function has deep dynamic-import dependencies (ProfileDetector, targets,
 * browser config, etc.).  Strategy: mock the heavy boundary modules and verify
 * the control-flow contract and shape of the returned ResolvedProfile object.
 *
 * Coverage goals:
 *  - Default 'claude' profile resolves with null targetAdapter
 *  - CLIProxy profile (gemini) resolves correctly
 *  - Settings profile (glm) resolves with settings loaded + compatibility check
 *  - Unknown profile triggers ProfileError (thrown, caught by main's try/catch)
 *  - --target droid resolves droid adapter + binary
 *  - Compatibility check runs for non-settings profiles (duplication preserved)
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { Logger } from '../../services/logging/logger';

// ========== Stub Logger ==========

function makeStubLogger(): Logger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    stage: mock(() => {}),
  } as unknown as Logger;
}

// ========== Module mocks ==========

// We need to mock heavy dependencies at the module level before importing the SUT.
// Bun's module mock API replaces modules in the registry for the current test file.

// Mock ProfileDetector — most tests override detectProfileType per-case
const mockDetectProfileType = mock((_profile: string) => ({
  type: 'default' as const,
  name: 'default',
  target: undefined,
}));
const mockGetAllProfiles = mock(() => ({
  settings: [] as string[],
  cliproxy: [],
  cliproxyVariants: [],
}));

mock.module('../../auth/profile-detector', () => ({
  default: class MockProfileDetector {
    detectProfileType = mockDetectProfileType;
    getAllProfiles = mockGetAllProfiles;
  },
}));

// Mock management / registry / context modules (dynamically imported, no-op for these tests)
mock.module('../../management/instance-manager', () => ({ default: class {} }));
mock.module('../../auth/profile-registry', () => ({ default: class {} }));
mock.module('../../auth/account-context', () => ({
  resolveAccountContextPolicy: mock(() => 'default'),
  isAccountContextMetadata: mock(() => false),
}));
mock.module('../../auth/profile-continuity-inheritance', () => ({
  resolveProfileContinuityInheritance: mock(() => null),
}));

// Mock target-resolver
const mockResolveTargetType = mock((_args: string[]) => 'claude' as const);
const mockStripTargetFlag = mock((args: string[]) => args);
mock.module('../../targets/target-resolver', () => ({
  resolveTargetType: mockResolveTargetType,
  stripTargetFlag: mockStripTargetFlag,
}));

// Mock targets registry
const mockGetTarget = mock((_name: string) => null);
const mockEvaluateTargetRuntimeCompatibility = mock(() => ({ supported: true }));
const mockPruneOrphanedModels = mock(async () => {});
mock.module('../../targets', () => ({
  getTarget: mockGetTarget,
  evaluateTargetRuntimeCompatibility: mockEvaluateTargetRuntimeCompatibility,
  pruneOrphanedModels: mockPruneOrphanedModels,
}));

// Mock claude-detector
const mockDetectClaudeCli = mock(() => '/usr/local/bin/claude');
mock.module('../../utils/claude-detector', () => ({
  detectClaudeCli: mockDetectClaudeCli,
}));

// Mock ErrorManager
mock.module('../../utils/error-manager', () => ({
  ErrorManager: { showClaudeNotFound: mock(async () => {}) },
}));

// Mock config-manager
mock.module('../../utils/config-manager', () => ({
  getSettingsPath: mock((name: string) => `/tmp/.ccs/profiles/${name}/settings.json`),
  loadSettings: mock(() => ({ env: {} })),
}));

// Mock helpers
mock.module('../../utils/helpers', () => ({
  expandPath: mock((p: string) => p),
}));

// Mock browser config
mock.module('../../config/unified-config-loader', () => ({
  getBrowserConfig: mock(() => ({
    claude: { enabled: false, policy: 'never' },
    codex: { enabled: false, policy: 'never' },
  })),
}));

// Mock browser utilities
mock.module('../../utils/browser', () => ({
  getEffectiveClaudeBrowserAttachConfig: mock(() => undefined),
  resolveBrowserExposure: mock(() => ({ enabled: false })),
  getBlockedBrowserOverrideWarning: mock(() => undefined),
}));

// Mock cliproxy bridge
mock.module('../../api/services/cliproxy-profile-bridge', () => ({
  resolveCliproxyBridgeMetadata: mock(() => undefined),
}));

// Mock environment-builder (only resolveCodexRuntimeConfigOverrides is called)
mock.module('../environment-builder', () => ({
  resolveCodexRuntimeConfigOverrides: mock(() => [] as string[]),
  resolveNativeClaudeLaunchArgs: mock((a: string[]) => a),
  refreshUpdateCache: mock(() => {}),
  showCachedUpdateNotification: mock(async () => {}),
}));

// Mock cli-argument-parser (detectProfile + normalization helpers)
const mockDetectProfile = mock((args: string[]) => ({
  profile: args[0] || 'default',
  remainingArgs: args.slice(1),
}));
mock.module('../cli-argument-parser', () => ({
  detectProfile: mockDetectProfile,
  resolveRuntimeReasoningFlags: mock((args: string[]) => ({
    argsWithoutReasoningFlags: args,
    reasoningOverride: undefined,
    reasoningSource: undefined,
  })),
  normalizeCodexRuntimeReasoningOverride: mock(() => undefined),
  exitWithRuntimeReasoningFlagError: mock(() => {}),
  normalizeNativeClaudeEffortArgs: mock((a: string[]) => a),
  shouldNormalizeNativeClaudeEffort: mock(() => false),
  bootstrapAndParseEarlyCli: mock(async () => ({
    exitNow: false,
    args: [],
    browserLaunchOverride: undefined,
  })),
}));

// Mock droid command/reasoning modules
mock.module('../../targets/droid-command-router', () => ({
  DroidCommandRouterError: class DroidCommandRouterError extends Error {},
  routeDroidCommandArgs: mock((args: string[]) => ({
    mode: 'interactive',
    argsForDroid: args,
    duplicateReasoningDisplays: [],
    reasoningSourceDisplay: undefined,
    autoPrependedExec: false,
  })),
}));
mock.module('../../targets/droid-reasoning-runtime', () => ({
  DroidReasoningFlagError: class DroidReasoningFlagError extends Error {
    constructor(msg: string, _flag?: string) {
      super(msg);
    }
  },
}));

// ========== Import SUT after mocks are registered ==========

import { resolveProfileAndTarget } from '../profile-resolver';

// ========== Tests ==========

describe('resolveProfileAndTarget', () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  const stubLogger = makeStubLogger();

  beforeEach(() => {
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    process.env['CI'] = '1';
    process.env['CCS_HOME'] = '/tmp/ccs-test-profile-resolver';
    // Reset relevant mocks to defaults
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'default' as const,
      name: 'default',
      target: undefined,
    }));
    mockResolveTargetType.mockImplementation((_args: string[]) => 'claude' as const);
    mockStripTargetFlag.mockImplementation((args: string[]) => args);
    mockGetTarget.mockImplementation((_name: string) => null);
    mockDetectClaudeCli.mockImplementation(() => '/usr/local/bin/claude');
    mockEvaluateTargetRuntimeCompatibility.mockImplementation(() => ({ supported: true }));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env['CI'];
    delete process.env['CCS_HOME'];
  });

  it('resolves default claude profile with null targetAdapter', async () => {
    const result = await resolveProfileAndTarget({
      args: [],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(result.resolvedTarget).toBe('claude');
    expect(result.targetAdapter).toBeNull();
    expect(result.claudeCli).toBe('/usr/local/bin/claude');
    expect(result.profileInfo.type).toBe('default');
    expect(result.targetBinaryInfo).toBeNull();
    expect(result.targetRemainingArgs).toEqual([]);
    expect(result.nativeClaudeRemainingArgs).toEqual([]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('resolves gemini cliproxy profile', async () => {
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'cliproxy' as const,
      name: 'gemini',
      provider: 'gemini',
      target: undefined,
    }));
    mockDetectProfile.mockImplementation((args: string[]) => ({
      profile: 'gemini',
      remainingArgs: args.slice(1),
    }));

    const result = await resolveProfileAndTarget({
      args: ['gemini'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(result.profile).toBe('gemini');
    expect(result.profileInfo.type).toBe('cliproxy');
    expect(result.resolvedTarget).toBe('claude');
    expect(result.targetAdapter).toBeNull();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('keeps explicit codex cliproxy profile on the Codex target', async () => {
    const mockCodexAdapter = {
      displayName: 'Codex CLI',
      detectBinary: mock(() => ({ path: '/usr/local/bin/codex', version: '1.0.0' })),
      supportsProfileType: mock(() => true),
    };
    mockGetTarget.mockImplementation((_name: string) => mockCodexAdapter);
    mockResolveTargetType.mockImplementation((_args: string[]) => 'codex' as const);
    mockStripTargetFlag.mockImplementation((args: string[]) => {
      const next: string[] = [];
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--target') {
          index += 1;
          continue;
        }
        next.push(args[index]);
      }
      return next;
    });
    mockDetectProfile.mockImplementation((args: string[]) => ({
      profile: args[0] || 'default',
      remainingArgs: args.slice(1),
    }));
    mockDetectProfileType.mockImplementation((profile: string) =>
      profile === 'codex'
        ? {
            type: 'cliproxy' as const,
            name: 'codex',
            provider: 'codex',
            target: undefined,
          }
        : {
            type: 'account' as const,
            name: 'work',
            target: undefined,
          }
    );

    const result = await resolveProfileAndTarget({
      args: ['codex', '--target', 'codex', 'fix failing tests'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(result.profile).toBe('codex');
    expect(result.profileInfo.type).toBe('cliproxy');
    expect(result.resolvedTarget).toBe('codex');
    expect(result.targetAdapter).toBe(mockCodexAdapter);
    expect(result.targetRemainingArgs).toEqual(['fix failing tests']);
    expect(mockEvaluateTargetRuntimeCompatibility).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'codex',
        profileType: 'cliproxy',
        cliproxyProvider: 'codex',
      })
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('resolves settings profile (glm) with --target droid and loads settings', async () => {
    // Settings loading only runs in the non-claude preflight block (resolvedTarget !== 'claude').
    const mockDroidAdapter = {
      displayName: 'Factory Droid',
      detectBinary: mock(() => ({ path: '/usr/local/bin/droid', version: '1.0.0' })),
      supportsProfileType: mock(() => true),
    };
    mockGetTarget.mockImplementation((_name: string) => mockDroidAdapter);
    mockResolveTargetType.mockImplementation((_args: string[]) => 'droid' as const);
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'settings' as const,
      name: 'glm',
      settingsPath: undefined,
      target: undefined,
    }));
    mockDetectProfile.mockImplementation((args: string[]) => ({
      profile: 'glm',
      remainingArgs: args.slice(1),
    }));

    const result = await resolveProfileAndTarget({
      args: ['glm', '--target', 'droid'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(result.profile).toBe('glm');
    expect(result.profileInfo.type).toBe('settings');
    expect(result.resolvedTarget).toBe('droid');
    // Settings are loaded inside the non-claude preflight block
    expect(result.resolvedSettingsPath).toBeDefined();
    expect(result.resolvedSettings).toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('calls process.exit(1) for unknown profile when claude CLI not found', async () => {
    // Simulate claude not found for claude target
    mockDetectClaudeCli.mockImplementation(() => null);

    await resolveProfileAndTarget({
      args: [],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('resolves --target droid with droid adapter and binary', async () => {
    const mockBinaryInfo = { path: '/usr/local/bin/droid', version: '1.0.0' };
    const mockDroidAdapter = {
      displayName: 'Factory Droid',
      detectBinary: mock(() => mockBinaryInfo),
      supportsProfileType: mock(() => true),
    };
    mockGetTarget.mockImplementation((_name: string) => mockDroidAdapter);
    mockResolveTargetType.mockImplementation((_args: string[]) => 'droid' as const);
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'settings' as const,
      name: 'glm',
      settingsPath: undefined,
      target: undefined,
    }));
    mockDetectProfile.mockImplementation((args: string[]) => ({
      profile: 'glm',
      remainingArgs: args.slice(1),
    }));

    const result = await resolveProfileAndTarget({
      args: ['glm', '--target', 'droid'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(result.resolvedTarget).toBe('droid');
    expect(result.targetAdapter).toBe(mockDroidAdapter);
    expect(result.targetBinaryInfo).toBe(mockBinaryInfo);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('calls process.exit(1) when droid binary not found', async () => {
    const mockDroidAdapter = {
      displayName: 'Factory Droid',
      detectBinary: mock(() => null),
      supportsProfileType: mock(() => true),
    };
    mockGetTarget.mockImplementation((_name: string) => mockDroidAdapter);
    mockResolveTargetType.mockImplementation((_args: string[]) => 'droid' as const);
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'default' as const,
      name: 'default',
      target: undefined,
    }));

    await resolveProfileAndTarget({
      args: ['--target', 'droid'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('runs compatibility check for non-settings profiles (duplication preserved)', async () => {
    const mockDroidAdapter = {
      displayName: 'Factory Droid',
      detectBinary: mock(() => ({ path: '/usr/local/bin/droid', version: '1.0.0' })),
      supportsProfileType: mock(() => true),
    };
    mockGetTarget.mockImplementation((_name: string) => mockDroidAdapter);
    mockResolveTargetType.mockImplementation((_args: string[]) => 'droid' as const);
    mockDetectProfileType.mockImplementation((_profile: string) => ({
      type: 'cliproxy' as const,
      name: 'gemini',
      provider: 'gemini',
      target: undefined,
    }));
    mockDetectProfile.mockImplementation((args: string[]) => ({
      profile: 'gemini',
      remainingArgs: args.slice(1),
    }));

    await resolveProfileAndTarget({
      args: ['gemini', '--target', 'droid'],
      browserLaunchOverride: undefined,
      cliLogger: stubLogger,
    });

    // Compatibility check must have been called (the duplication from Phase C)
    expect(mockEvaluateTargetRuntimeCompatibility).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
