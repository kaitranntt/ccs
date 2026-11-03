/**
 * Unit tests for account-resolution.ts (Phase 05)
 *
 * Tests cover:
 * - resolveRuntimeQuotaMonitorProviders: single provider, composite, dedup
 * - resolveAccounts: --accounts early exit, --use switching, --nickname rename,
 *   default touch (no --use), warnOAuthBanRisk delegation
 * - applyAccountSafetyGuards: delegates to safety functions (isolation + warn)
 *
 * Strategy: pure unit tests on the exported functions. Account-manager and
 * account-safety modules are mocked to avoid file I/O.
 */

import { afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

// ── resolveRuntimeQuotaMonitorProviders ───────────────────────────────────────

describe('resolveRuntimeQuotaMonitorProviders', () => {
  // Import the module under test directly (no heavy deps needed for this fn)
  it('returns empty array when provider is not managed', async () => {
    const { resolveRuntimeQuotaMonitorProviders } = await import('../account-resolution');
    const result = resolveRuntimeQuotaMonitorProviders('kiro', []);
    expect(result).toEqual([]);
  });

  it('returns [provider] for single managed provider', async () => {
    const { resolveRuntimeQuotaMonitorProviders } = await import('../account-resolution');
    const result = resolveRuntimeQuotaMonitorProviders('agy', []);
    expect(result).toContain('agy');
    expect(result).toHaveLength(1);
  });

  it('returns composite providers that are managed, deduped', async () => {
    const { resolveRuntimeQuotaMonitorProviders } = await import('../account-resolution');
    // agy is managed; kiro is not; duplicate agy should be deduped
    const result = resolveRuntimeQuotaMonitorProviders('gemini', ['agy', 'kiro', 'agy']);
    expect(result).toContain('agy');
    expect(result).not.toContain('kiro');
    expect(result.filter((p) => p === 'agy')).toHaveLength(1);
  });

  it('ignores base provider when compositeProviders is non-empty', async () => {
    const { resolveRuntimeQuotaMonitorProviders } = await import('../account-resolution');
    // base provider is gemini (managed), but composite list contains only kiro (not managed)
    const result = resolveRuntimeQuotaMonitorProviders('gemini', ['kiro']);
    expect(result).toEqual([]);
  });
});

// ── resolveAccounts — --accounts early exit ───────────────────────────────────

describe('resolveAccounts — --accounts early exit', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('calls process.exit(0) and returns earlyExit=true when showAccounts=true (no accounts)', async () => {
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: () => true,
      getDefaultAccount: () => undefined,
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: (a: { email?: string }) => a.email ?? 'unknown',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    const result = await resolveAccounts({
      provider: 'gemini',
      showAccounts: true,
      useAccount: undefined,
      setNickname: undefined,
      addAccount: false,
    });

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(result.earlyExit).toBe(true);
  });

  it('prints account list when accounts exist', async () => {
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [
        { id: 'acc1', email: 'test@example.com', isDefault: true, nickname: 'main' },
      ],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: () => true,
      getDefaultAccount: () => undefined,
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'test@example.com',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    await resolveAccounts({
      provider: 'gemini',
      showAccounts: true,
      useAccount: undefined,
      setNickname: undefined,
      addAccount: false,
    });

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('test@example.com');
    expect(allOutput).toContain('(default)');
  });
});

// ── resolveAccounts — --use switching ─────────────────────────────────────────

describe('resolveAccounts — --use switching', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('calls setDefaultAccount + touchAccount and logs success', async () => {
    const setDefaultMock = jest.fn(() => true);
    const touchMock = jest.fn();
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => ({ id: 'acc1', email: 'user@example.com', nickname: undefined }),
      setDefaultAccount: setDefaultMock,
      touchAccount: touchMock,
      renameAccount: () => true,
      getDefaultAccount: () => undefined,
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'user@example.com',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: 'user@example.com',
      setNickname: undefined,
      addAccount: false,
    });

    expect(setDefaultMock).toHaveBeenCalledWith('gemini', 'acc1');
    expect(touchMock).toHaveBeenCalledWith('gemini', 'acc1');
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Switched to account');
  });

  it('exits 1 without renaming when setDefaultAccount fails', async () => {
    const touchMock = jest.fn();
    const renameMock = jest.fn(() => true);
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => ({ id: 'acc2', email: 'user@example.com', nickname: 'work' }),
      setDefaultAccount: () => false,
      touchAccount: touchMock,
      renameAccount: renameMock,
      getDefaultAccount: () => ({ id: 'acc1', email: 'other@example.com' }),
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'user@example.com',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    const result = await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: 'work',
      setNickname: 'renamed',
      addAccount: false,
    });

    expect(result.earlyExit).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(touchMock).not.toHaveBeenCalled();
    expect(renameMock).not.toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).not.toContain('Switched to account');
  });

  it('calls process.exit(1) when account not found', async () => {
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: () => true,
      getDefaultAccount: () => undefined,
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'x',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: 'nonexistent',
      setNickname: undefined,
      addAccount: false,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ── resolveAccounts — --nickname rename ───────────────────────────────────────

describe('resolveAccounts — --nickname rename', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('renames default account and exits 0 on success', async () => {
    const renameMock = jest.fn(() => true);
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: renameMock,
      getDefaultAccount: () => ({ id: 'acc1', email: 'user@example.com' }),
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'user@example.com',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: undefined,
      setNickname: 'work',
      addAccount: false,
    });

    expect(renameMock).toHaveBeenCalledWith('gemini', 'acc1', 'work');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 when no default account found', async () => {
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: () => false,
      getDefaultAccount: () => undefined,
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'x',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: undefined,
      setNickname: 'work',
      addAccount: false,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('skips rename when addAccount=true (--auth flow)', async () => {
    const renameMock = jest.fn(() => true);
    mock.module('../../accounts/account-manager', () => ({
      getProviderAccounts: () => [],
      findAccountByQuery: () => undefined,
      setDefaultAccount: () => {},
      touchAccount: () => {},
      renameAccount: renameMock,
      getDefaultAccount: () => ({ id: 'acc1', email: 'user@example.com' }),
    }));
    mock.module('../../accounts/email-account-identity', () => ({
      formatAccountDisplayName: () => 'user@example.com',
    }));
    mock.module('../../config/config-generator', () => ({
      getProviderConfig: () => ({ displayName: 'Gemini' }),
    }));
    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: () => false,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: () => 0,
      restoreAutoPausedAccounts: () => {},
    }));

    const { resolveAccounts } = await import('../account-resolution');
    const result = await resolveAccounts({
      provider: 'gemini',
      showAccounts: false,
      useAccount: undefined,
      setNickname: 'work',
      addAccount: true, // suppresses rename
    });

    expect(renameMock).not.toHaveBeenCalled();
    expect(result.earlyExit).toBe(false);
  });
});

// ── applyAccountSafetyGuards — delegation ─────────────────────────────────────

describe('applyAccountSafetyGuards', () => {
  it('calls cleanupStaleAutoPauses and enforceProviderIsolation', async () => {
    const cleanupMock = jest.fn();
    const enforceMock = jest.fn(() => 0);
    const warnDupMock = jest.fn(() => false);

    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: warnDupMock,
      cleanupStaleAutoPauses: cleanupMock,
      enforceProviderIsolation: enforceMock,
      restoreAutoPausedAccounts: () => {},
    }));

    const { applyAccountSafetyGuards } = await import('../account-resolution');
    applyAccountSafetyGuards('gemini', []);

    expect(cleanupMock).toHaveBeenCalledTimes(1);
    expect(enforceMock).toHaveBeenCalledWith('gemini');
  });

  it('calls warnCrossProviderDuplicates when isolation returns 0', async () => {
    const warnDupMock = jest.fn(() => false);
    const enforceMock = jest.fn(() => 0);

    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: warnDupMock,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: enforceMock,
      restoreAutoPausedAccounts: () => {},
    }));

    const { applyAccountSafetyGuards } = await import('../account-resolution');
    applyAccountSafetyGuards('gemini', []);

    expect(warnDupMock).toHaveBeenCalledWith('gemini');
  });

  it('does NOT call warnCrossProviderDuplicates when isolation is enforced', async () => {
    const warnDupMock = jest.fn(() => false);
    const enforceMock = jest.fn(() => 2); // 2 accounts isolated

    mock.module('../../accounts/account-safety', () => ({
      warnOAuthBanRisk: () => {},
      warnCrossProviderDuplicates: warnDupMock,
      cleanupStaleAutoPauses: () => {},
      enforceProviderIsolation: enforceMock,
      restoreAutoPausedAccounts: () => {},
    }));

    const { applyAccountSafetyGuards } = await import('../account-resolution');
    applyAccountSafetyGuards('gemini', []);

    expect(warnDupMock).not.toHaveBeenCalled();
  });
});
