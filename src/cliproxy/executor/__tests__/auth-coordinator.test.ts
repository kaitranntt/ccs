/**
 * Auth Coordinator Tests (Phase 06)
 *
 * Tests for auth-coordinator.ts exported functions.
 *
 * Strategy:
 * - jest.mock() at top level to intercept all imports (static + dynamic)
 *   before the module-under-test is loaded
 * - process.exit spied in beforeEach to prevent runner exit
 * - Dynamic-import paths (e.g. '../auth/auth-handler') are mocked via
 *   jest.mock() from the coordinator's perspective (relative to executor/)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import type { ExecutorConfig } from '../../types';
import type { UnifiedConfig } from '../../../config/schemas/unified-config';
import type { AuthCoordinationContext } from '../auth-coordinator';
import type { ParsedExecutorFlags } from '../arg-parser';

// ── Module mocks (must be top-level, before any import of subject) ────────────

const mockIsAuthenticated = jest.fn(() => false);
const mockClearAuth = jest.fn(() => true);
const mockTriggerOAuth = jest.fn(async () => true);

jest.mock('../../auth/auth-handler', () => ({
  isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
  clearAuth: (...args: unknown[]) => mockClearAuth(...args),
  triggerOAuth: (...args: unknown[]) => mockTriggerOAuth(...args),
}));

const mockEnsureAntigravity = jest.fn(async () => true);
const MOCK_ANTIGRAVITY_FLAGS = ['--accept-agr-risk', '--accept-antigravity-risk'];

jest.mock('../../auth/antigravity-responsibility', () => ({
  ensureCliAntigravityResponsibility: (...args: unknown[]) => mockEnsureAntigravity(...args),
  ANTIGRAVITY_ACCEPT_RISK_FLAGS: MOCK_ANTIGRAVITY_FLAGS,
}));

const mockHandleTokenExpiration = jest.fn(async () => {});
const mockHandleQuotaCheck = jest.fn(async () => {});

jest.mock('../retry-handler', () => ({
  handleTokenExpiration: (...args: unknown[]) => mockHandleTokenExpiration(...args),
  handleQuotaCheck: (...args: unknown[]) => mockHandleQuotaCheck(...args),
}));

const mockApplyAccountSafetyGuards = jest.fn(() => {});
const mockTouchDefaultAccount = jest.fn(() => {});

jest.mock('../account-resolution', () => ({
  applyAccountSafetyGuards: (...args: unknown[]) => mockApplyAccountSafetyGuards(...args),
  touchDefaultAccount: (...args: unknown[]) => mockTouchDefaultAccount(...args),
}));

const mockConfigureProviderModel = jest.fn(async () => {});
const mockGetCurrentModel = jest.fn(() => 'claude-opus');

jest.mock('../../config/model-config', () => ({
  configureProviderModel: (...args: unknown[]) => mockConfigureProviderModel(...args),
  getCurrentModel: (...args: unknown[]) => mockGetCurrentModel(...args),
}));

const mockReconcileCodexModel = jest.fn(async () => {});

jest.mock('../../ai-providers/codex-plan-compatibility', () => ({
  reconcileCodexModelForActivePlan: (...args: unknown[]) => mockReconcileCodexModel(...args),
}));

// Do NOT mock quota-manager, model-catalog, config-generator — pure modules
// with no I/O side effects; mocking them would strip exports needed by the
// wider module graph and cause "Export not found" errors.

// ── Import subject AFTER mocks ─────────────────────────────────────────────────

const {
  resolveSkipLocalAuth,
  handleLogout,
  handleImport,
  runAntigravityGate,
  ensureProviderAuthentication,
  runPreflightQuotaCheck,
  runAccountSafetyGuards,
  ensureModelConfiguration,
} = await import('../auth-coordinator');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFlags(overrides: Partial<Record<string, unknown>> = {}): ParsedExecutorFlags {
  return {
    forceAuth: false,
    pasteCallback: false,
    portForward: false,
    forceHeadless: false,
    forceLogout: false,
    forceConfig: false,
    addAccount: false,
    showAccounts: false,
    forceImport: false,
    gitlabTokenLogin: false,
    acceptAgyRisk: false,
    incognitoFlag: false,
    noIncognitoFlag: false,
    noIncognito: false,
    useAccount: undefined,
    setNickname: undefined,
    kiroAuthMethod: undefined,
    kiroIDCStartUrl: undefined,
    kiroIDCRegion: undefined,
    kiroIDCFlow: undefined,
    gitlabBaseUrl: undefined,
    extendedContextOverride: undefined,
    thinkingParse: {
      value: undefined,
      sourceFlag: undefined,
      sourceDisplay: 'none',
      duplicateDisplays: [],
    } as ParsedExecutorFlags['thinkingParse'],
    ...overrides,
  } as unknown as ParsedExecutorFlags;
}

function makeCtx(overrides: Partial<AuthCoordinationContext> = {}): AuthCoordinationContext {
  return {
    provider: 'gemini',
    compositeProviders: [],
    parsedFlags: makeFlags(),
    cfg: { port: 8090, timeout: 5000, verbose: false, pollInterval: 100 } as ExecutorConfig,
    unifiedConfig: {} as UnifiedConfig,
    verbose: false,
    log: () => {},
    ...overrides,
  };
}

// ── resolveSkipLocalAuth ──────────────────────────────────────────────────────

describe('resolveSkipLocalAuth', () => {
  it('returns false when useRemoteProxy=false', () => {
    expect(resolveSkipLocalAuth('tok', false)).toBe(false);
  });

  it('returns false when token is whitespace only', () => {
    expect(resolveSkipLocalAuth('  ', true)).toBe(false);
  });

  it('returns false when token is undefined', () => {
    expect(resolveSkipLocalAuth(undefined, true)).toBe(false);
  });

  it('returns true when useRemoteProxy=true and token non-empty', () => {
    expect(resolveSkipLocalAuth('tok123', true)).toBe(true);
  });
});

// ── handleLogout ──────────────────────────────────────────────────────────────

describe('handleLogout', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('returns false and does not exit when forceLogout=false', async () => {
    const result = await handleLogout(makeCtx({ parsedFlags: makeFlags({ forceLogout: false }) }));
    expect(result).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 0 when forceLogout=true and clearAuth succeeds', async () => {
    mockClearAuth.mockReturnValue(true);
    await handleLogout(makeCtx({ parsedFlags: makeFlags({ forceLogout: true }) }));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 even when no auth found (clearAuth returns false)', async () => {
    mockClearAuth.mockReturnValue(false);
    await handleLogout(makeCtx({ parsedFlags: makeFlags({ forceLogout: true }) }));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ── handleImport ──────────────────────────────────────────────────────────────

describe('handleImport', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTriggerOAuth.mockResolvedValue(true);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('returns false when forceImport=false', async () => {
    const result = await handleImport(makeCtx({ parsedFlags: makeFlags({ forceImport: false }) }));
    expect(result).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 for non-kiro provider', async () => {
    await handleImport(
      makeCtx({ provider: 'gemini', parsedFlags: makeFlags({ forceImport: true }) })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 when --import + --auth combined', async () => {
    await handleImport(
      makeCtx({ provider: 'kiro', parsedFlags: makeFlags({ forceImport: true, forceAuth: true }) })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 when --import + --logout combined', async () => {
    await handleImport(
      makeCtx({
        provider: 'kiro',
        parsedFlags: makeFlags({ forceImport: true, forceLogout: true }),
      })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 0 on successful kiro import', async () => {
    mockTriggerOAuth.mockResolvedValue(true);
    await handleImport(
      makeCtx({ provider: 'kiro', parsedFlags: makeFlags({ forceImport: true }) })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 when triggerOAuth returns false', async () => {
    mockTriggerOAuth.mockResolvedValue(false);
    await handleImport(
      makeCtx({ provider: 'kiro', parsedFlags: makeFlags({ forceImport: true }) })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ── runAntigravityGate ────────────────────────────────────────────────────────

describe('runAntigravityGate', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAntigravity.mockResolvedValue(true);
    mockIsAuthenticated.mockReturnValue(false);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('returns earlyReturn=false for non-agy provider without calling gate', async () => {
    const result = await runAntigravityGate(makeCtx({ provider: 'gemini' }), false);
    expect(result.earlyReturn).toBe(false);
    expect(mockEnsureAntigravity).not.toHaveBeenCalled();
  });

  it('agy + forceAuth + skipLocalAuth + acknowledged → earlyReturn=true', async () => {
    mockEnsureAntigravity.mockResolvedValue(true);
    const ctx = makeCtx({ provider: 'agy', parsedFlags: makeFlags({ forceAuth: true }) });
    const result = await runAntigravityGate(ctx, true);
    expect(result.earlyReturn).toBe(true);
    expect(mockEnsureAntigravity).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'oauth' })
    );
  });

  it('agy + forceAuth + skipLocalAuth + refused → throws', async () => {
    mockEnsureAntigravity.mockResolvedValue(false);
    const ctx = makeCtx({ provider: 'agy', parsedFlags: makeFlags({ forceAuth: true }) });
    await expect(runAntigravityGate(ctx, true)).rejects.toThrow('Antigravity auth blocked');
  });

  it('agy + no forceAuth + skipLocalAuth + acknowledged → earlyReturn=false, no exit', async () => {
    mockEnsureAntigravity.mockResolvedValue(true);
    mockIsAuthenticated.mockReturnValue(true); // already authenticated → run context triggers
    const ctx = makeCtx({ provider: 'agy', parsedFlags: makeFlags({ forceAuth: false }) });
    const result = await runAntigravityGate(ctx, true);
    expect(result.earlyReturn).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockEnsureAntigravity).toHaveBeenCalledWith(expect.objectContaining({ context: 'run' }));
  });

  it('agy + no forceAuth + skipLocalAuth + refused → process.exit(1)', async () => {
    mockEnsureAntigravity.mockResolvedValue(false);
    mockIsAuthenticated.mockReturnValue(true);
    const ctx = makeCtx({ provider: 'agy', parsedFlags: makeFlags({ forceAuth: false }) });
    await runAntigravityGate(ctx, true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ── ensureProviderAuthentication ──────────────────────────────────────────────

describe('ensureProviderAuthentication', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.mockReturnValue(false);
    mockTriggerOAuth.mockResolvedValue(true);
    mockHandleTokenExpiration.mockResolvedValue(undefined);
    mockTouchDefaultAccount.mockImplementation(() => {});
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('already authenticated → no OAuth trigger, no exit', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    await ensureProviderAuthentication(makeCtx({ provider: 'gemini' }));
    expect(mockTriggerOAuth).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('not authenticated → triggerOAuth called', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    await ensureProviderAuthentication(makeCtx({ provider: 'gemini' }));
    expect(mockTriggerOAuth).toHaveBeenCalledWith('gemini', expect.any(Object));
  });

  it('forceAuth=true → exits 0 after successful OAuth', async () => {
    await ensureProviderAuthentication(
      makeCtx({ provider: 'gemini', parsedFlags: makeFlags({ forceAuth: true }) })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('OAuth fails → throws Authentication required error', async () => {
    mockTriggerOAuth.mockResolvedValue(false);
    await expect(ensureProviderAuthentication(makeCtx({ provider: 'gemini' }))).rejects.toThrow(
      'Authentication required'
    );
  });

  it('calls touchDefaultAccount after successful single-provider auth', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    await ensureProviderAuthentication(makeCtx({ provider: 'gemini' }));
    expect(mockTouchDefaultAccount).toHaveBeenCalledWith('gemini');
  });

  it('runs token refresh after single-provider auth', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    await ensureProviderAuthentication(makeCtx({ provider: 'gemini' }));
    expect(mockHandleTokenExpiration).toHaveBeenCalledWith('gemini', false);
  });

  it('composite + forceAuth: all succeed → exit(0)', async () => {
    mockTriggerOAuth.mockResolvedValue(true);
    const ctx = makeCtx({
      provider: 'agy',
      compositeProviders: ['gemini', 'codex'],
      parsedFlags: makeFlags({ forceAuth: true }),
    });
    await ensureProviderAuthentication(ctx);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockTriggerOAuth).toHaveBeenCalledTimes(2);
  });

  it('composite + forceAuth: partial failure → exit(1)', async () => {
    let call = 0;
    mockTriggerOAuth.mockImplementation(async () => ++call === 1);
    const ctx = makeCtx({
      provider: 'agy',
      compositeProviders: ['gemini', 'codex'],
      parsedFlags: makeFlags({ forceAuth: true }),
    });
    await ensureProviderAuthentication(ctx);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('composite no forceAuth + unauthenticated → exit(1)', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    const ctx = makeCtx({
      provider: 'agy',
      compositeProviders: ['gemini', 'codex'],
      parsedFlags: makeFlags({ forceAuth: false }),
    });
    await ensureProviderAuthentication(ctx);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('composite all authenticated → token refresh for each provider', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    const ctx = makeCtx({
      provider: 'agy',
      compositeProviders: ['gemini', 'codex'],
      parsedFlags: makeFlags({ forceAuth: false }),
    });
    await ensureProviderAuthentication(ctx);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockHandleTokenExpiration).toHaveBeenCalledTimes(2);
  });
});

// ── runPreflightQuotaCheck ────────────────────────────────────────────────────

describe('runPreflightQuotaCheck', () => {
  beforeEach(() => jest.clearAllMocks());

  it('single provider → handleQuotaCheck called once with that provider', async () => {
    await runPreflightQuotaCheck('gemini', []);
    expect(mockHandleQuotaCheck).toHaveBeenCalledWith('gemini');
    expect(mockHandleQuotaCheck).toHaveBeenCalledTimes(1);
  });

  it('composite list → checks only managed providers from the list', async () => {
    // Real MANAGED_QUOTA_PROVIDERS = ['agy','claude','codex','gemini','ghcp']
    // 'gemini' and 'codex' are both managed; 'kiro' is not
    await runPreflightQuotaCheck('agy', ['gemini', 'kiro']);
    expect(mockHandleQuotaCheck).toHaveBeenCalledWith('gemini');
    expect(mockHandleQuotaCheck).not.toHaveBeenCalledWith('kiro');
  });
});

// ── runAccountSafetyGuards ────────────────────────────────────────────────────

describe('runAccountSafetyGuards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delegates to applyAccountSafetyGuards with correct args', () => {
    runAccountSafetyGuards('gemini', ['codex']);
    expect(mockApplyAccountSafetyGuards).toHaveBeenCalledWith('gemini', ['codex']);
  });
});

// ── ensureModelConfiguration ──────────────────────────────────────────────────

describe('ensureModelConfiguration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-composite provider with model support → configureProviderModel called', async () => {
    const cfg = { isComposite: false, customSettingsPath: undefined } as ExecutorConfig;
    await ensureModelConfiguration('gemini', cfg, false);
    expect(mockConfigureProviderModel).toHaveBeenCalledWith('gemini', false, undefined);
  });

  it('composite variant → configureProviderModel NOT called', async () => {
    const cfg = { isComposite: true } as ExecutorConfig;
    await ensureModelConfiguration('gemini', cfg, false);
    expect(mockConfigureProviderModel).not.toHaveBeenCalled();
  });

  it('agy (has model support) → configureProviderModel IS called', async () => {
    // agy IS in MODEL_CATALOG so supportsModelConfig returns true
    const cfg = { isComposite: false } as ExecutorConfig;
    await ensureModelConfiguration('agy', cfg, false);
    expect(mockConfigureProviderModel).toHaveBeenCalled();
  });

  it('codex non-composite → reconcileCodexModelForActivePlan called', async () => {
    const cfg = { isComposite: false } as ExecutorConfig;
    await ensureModelConfiguration('codex', cfg, false);
    expect(mockReconcileCodexModel).toHaveBeenCalled();
  });

  it('codex composite → reconcileCodexModelForActivePlan NOT called', async () => {
    const cfg = { isComposite: true } as ExecutorConfig;
    await ensureModelConfiguration('codex', cfg, false);
    expect(mockReconcileCodexModel).not.toHaveBeenCalled();
  });

  // claude is model-neutral passthrough — must never auto-prompt at launch
  it('claude non-composite → configureProviderModel NOT called (model-neutral)', async () => {
    const cfg = { isComposite: false, customSettingsPath: undefined } as ExecutorConfig;
    await ensureModelConfiguration('claude', cfg, false);
    expect(mockConfigureProviderModel).not.toHaveBeenCalled();
  });

  it('claude composite → configureProviderModel NOT called', async () => {
    const cfg = { isComposite: true } as ExecutorConfig;
    await ensureModelConfiguration('claude', cfg, false);
    expect(mockConfigureProviderModel).not.toHaveBeenCalled();
  });
});
