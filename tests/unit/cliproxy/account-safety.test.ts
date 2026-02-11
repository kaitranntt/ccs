/**
 * Account Safety Guards Unit Tests
 *
 * Tests ban detection, email masking, cross-provider duplicate detection,
 * enforcement lifecycle, and crash recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isBanResponse,
  maskEmail,
  detectCrossProviderDuplicates,
  enforceProviderIsolation,
  cleanupStaleAutoPauses,
  restoreAutoPausedAccounts,
  checkNewAccountConflict,
  handleBanDetection,
  warnCrossProviderDuplicates,
} from '../../../src/cliproxy/account-safety';

// --- Test isolation: use temp CCS_HOME ---

let tmpDir: string;
let origCcsHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-safety-'));
  origCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
});

afterEach(() => {
  if (origCcsHome !== undefined) {
    process.env.CCS_HOME = origCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// CCS_HOME appends .ccs — all paths go through getCcsDir() = CCS_HOME/.ccs
function ccsDir(): string {
  return path.join(tmpDir, '.ccs');
}

// --- Helper: write accounts registry ---

function writeRegistry(providers: Record<string, unknown>): void {
  const registryDir = path.join(ccsDir(), 'cliproxy');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(
    path.join(registryDir, 'accounts.json'),
    JSON.stringify({ version: 1, providers }, null, 2)
  );
}

// --- Helper: write auto-paused file ---

function writeAutoPaused(sessions: unknown[]): void {
  const dir = path.join(ccsDir(), 'cliproxy');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auto-paused.json'), JSON.stringify({ sessions }, null, 2));
}

function readAutoPaused(): { sessions: unknown[] } {
  const filePath = path.join(ccsDir(), 'cliproxy', 'auto-paused.json');
  if (!fs.existsSync(filePath)) return { sessions: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// --- Helper: write dummy token files ---

function writeTokenFile(filename: string, paused = false): void {
  const dir = paused
    ? path.join(ccsDir(), 'cliproxy', 'auth-paused')
    : path.join(ccsDir(), 'cliproxy', 'auth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify({ type: 'test' }));
}

// ========================================
// isBanResponse
// ========================================

describe('isBanResponse', () => {
  it('should detect "disabled in this account"', () => {
    expect(isBanResponse('API access disabled in this account')).toBe(true);
  });

  it('should detect "violation of terms of service"', () => {
    expect(isBanResponse('Your account was flagged for violation of terms of service')).toBe(true);
  });

  it('should detect "account has been suspended"', () => {
    expect(isBanResponse('This account has been suspended by Google')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isBanResponse('ACCOUNT HAS BEEN DISABLED')).toBe(true);
  });

  it('should return false for normal errors', () => {
    expect(isBanResponse('Rate limit exceeded')).toBe(false);
    expect(isBanResponse('Internal server error')).toBe(false);
    expect(isBanResponse('Network timeout')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isBanResponse('')).toBe(false);
  });
});

// ========================================
// maskEmail
// ========================================

describe('maskEmail', () => {
  it('should mask standard email', () => {
    expect(maskEmail('user@example.com')).toBe('use***@example.com');
  });

  it('should handle short local part', () => {
    expect(maskEmail('ab@example.com')).toBe('ab***@example.com');
  });

  it('should handle single char local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('should return input if no @ sign', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  it('should return input if empty string', () => {
    expect(maskEmail('')).toBe('');
  });
});

// ========================================
// detectCrossProviderDuplicates
// ========================================

describe('detectCrossProviderDuplicates', () => {
  it('should return empty map when no duplicates', () => {
    writeRegistry({
      gemini: {
        default: 'user1@gmail.com',
        accounts: {
          'user1@gmail.com': {
            email: 'user1@gmail.com',
            tokenFile: 'gemini-user1.json',
          },
        },
      },
      agy: {
        default: 'user2@gmail.com',
        accounts: {
          'user2@gmail.com': {
            email: 'user2@gmail.com',
            tokenFile: 'agy-user2.json',
          },
        },
      },
    });

    const dupes = detectCrossProviderDuplicates();
    expect(dupes.size).toBe(0);
  });

  it('should detect same email across providers', () => {
    writeRegistry({
      gemini: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'gemini-shared.json',
          },
        },
      },
      agy: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'agy-shared.json',
          },
        },
      },
    });

    const dupes = detectCrossProviderDuplicates();
    expect(dupes.size).toBe(1);
    expect(dupes.get('shared@gmail.com')).toEqual(['gemini', 'agy']);
  });

  it('should skip paused accounts', () => {
    writeRegistry({
      gemini: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'gemini-shared.json',
            paused: true,
          },
        },
      },
      agy: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'agy-shared.json',
          },
        },
      },
    });

    const dupes = detectCrossProviderDuplicates();
    expect(dupes.size).toBe(0);
  });

  it('should be case-insensitive on email', () => {
    writeRegistry({
      gemini: {
        default: 'User@Gmail.com',
        accounts: {
          'User@Gmail.com': {
            email: 'User@Gmail.com',
            tokenFile: 'gemini-user.json',
          },
        },
      },
      agy: {
        default: 'user@gmail.com',
        accounts: {
          'user@gmail.com': {
            email: 'user@gmail.com',
            tokenFile: 'agy-user.json',
          },
        },
      },
    });

    const dupes = detectCrossProviderDuplicates();
    expect(dupes.size).toBe(1);
  });
});

// ========================================
// checkNewAccountConflict
// ========================================

describe('checkNewAccountConflict', () => {
  it('should return null for non-Google provider', () => {
    const result = checkNewAccountConflict('kiro' as never, 'user@gmail.com');
    expect(result).toBeNull();
  });

  it('should return null when no conflict', () => {
    writeRegistry({
      gemini: {
        default: 'other@gmail.com',
        accounts: {
          'other@gmail.com': {
            email: 'other@gmail.com',
            tokenFile: 'gemini-other.json',
          },
        },
      },
    });

    const result = checkNewAccountConflict('agy', 'new@gmail.com');
    expect(result).toBeNull();
  });

  it('should return conflicting providers', () => {
    writeRegistry({
      gemini: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'gemini-shared.json',
          },
        },
      },
    });

    const result = checkNewAccountConflict('agy', 'shared@gmail.com');
    expect(result).toEqual(['gemini']);
  });

  it('should return null when email is undefined', () => {
    const result = checkNewAccountConflict('agy', undefined);
    expect(result).toBeNull();
  });
});

// ========================================
// cleanupStaleAutoPauses
// ========================================

describe('cleanupStaleAutoPauses', () => {
  it('should do nothing when no sessions', () => {
    // No auto-paused.json exists
    cleanupStaleAutoPauses();
    // Should not throw
  });

  it('should remove sessions with dead PIDs', () => {
    // Use PID 999999999 which is almost certainly dead
    writeAutoPaused([
      {
        initiator: 'gemini',
        pid: 999999999,
        pausedAt: new Date().toISOString(),
        accounts: [{ provider: 'agy', accountId: 'test@gmail.com' }],
      },
    ]);

    // Write registry with the paused account so resumeAccount can find it
    writeRegistry({
      agy: {
        default: 'test@gmail.com',
        accounts: {
          'test@gmail.com': {
            email: 'test@gmail.com',
            tokenFile: 'agy-test.json',
            paused: true,
            pausedAt: new Date().toISOString(),
          },
        },
      },
    });
    writeTokenFile('agy-test.json', true);

    cleanupStaleAutoPauses();

    const data = readAutoPaused();
    expect(data.sessions.length).toBe(0);
  });

  it('should keep sessions with alive PIDs', () => {
    const alivePid = process.pid; // Current process is alive

    writeAutoPaused([
      {
        initiator: 'gemini',
        pid: alivePid,
        pausedAt: new Date().toISOString(),
        accounts: [{ provider: 'agy', accountId: 'test@gmail.com' }],
      },
    ]);

    cleanupStaleAutoPauses();

    const data = readAutoPaused();
    expect(data.sessions.length).toBe(1);
  });
});

// ========================================
// enforceProviderIsolation
// ========================================

describe('enforceProviderIsolation', () => {
  it('should return 0 for non-Google provider', () => {
    const result = enforceProviderIsolation('kiro' as never);
    expect(result).toBe(0);
  });

  it('should return 0 when no conflicting accounts', () => {
    writeRegistry({
      gemini: {
        default: 'user1@gmail.com',
        accounts: {
          'user1@gmail.com': {
            email: 'user1@gmail.com',
            tokenFile: 'gemini-user1.json',
          },
        },
      },
      agy: {
        default: 'user2@gmail.com',
        accounts: {
          'user2@gmail.com': {
            email: 'user2@gmail.com',
            tokenFile: 'agy-user2.json',
          },
        },
      },
    });
    writeTokenFile('gemini-user1.json');
    writeTokenFile('agy-user2.json');

    const result = enforceProviderIsolation('gemini');
    expect(result).toBe(0);
  });

  it('should pause conflicting accounts and record session', () => {
    writeRegistry({
      gemini: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'gemini-shared.json',
          },
        },
      },
      agy: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'agy-shared.json',
          },
        },
      },
    });
    writeTokenFile('gemini-shared.json');
    writeTokenFile('agy-shared.json');

    const result = enforceProviderIsolation('gemini');
    expect(result).toBe(1);

    // Verify auto-paused.json was written
    const data = readAutoPaused();
    expect(data.sessions.length).toBe(1);
    expect(data.sessions[0].initiator).toBe('gemini');
    expect(data.sessions[0].pid).toBe(process.pid);
  });
});

// ========================================
// restoreAutoPausedAccounts
// ========================================

describe('restoreAutoPausedAccounts', () => {
  it('should do nothing when no session exists', () => {
    restoreAutoPausedAccounts('gemini');
    // Should not throw
  });

  it('should skip accounts re-paused after enforcement', () => {
    const enforcementTime = '2024-01-01T00:00:00.000Z';
    const laterTime = '2024-01-01T01:00:00.000Z';

    writeAutoPaused([
      {
        initiator: 'gemini',
        pid: process.pid,
        pausedAt: enforcementTime,
        accounts: [{ provider: 'agy', accountId: 'banned@gmail.com' }],
      },
    ]);

    writeRegistry({
      agy: {
        default: 'banned@gmail.com',
        accounts: {
          'banned@gmail.com': {
            email: 'banned@gmail.com',
            tokenFile: 'agy-banned.json',
            paused: true,
            pausedAt: laterTime, // Re-paused AFTER enforcement (e.g., ban)
          },
        },
      },
    });
    writeTokenFile('agy-banned.json', true);

    restoreAutoPausedAccounts('gemini');

    // Account should NOT be restored because it was re-paused later
    const registry = JSON.parse(
      fs.readFileSync(path.join(ccsDir(), 'cliproxy', 'accounts.json'), 'utf-8')
    );
    expect(registry.providers.agy.accounts['banned@gmail.com'].paused).toBe(true);
  });
});

// ========================================
// handleBanDetection
// ========================================

describe('handleBanDetection', () => {
  it('should pause account when ban error detected', () => {
    writeRegistry({
      gemini: {
        default: 'user@gmail.com',
        accounts: {
          'user@gmail.com': {
            email: 'user@gmail.com',
            tokenFile: 'gemini-user.json',
          },
        },
      },
    });
    writeTokenFile('gemini-user.json');

    const result = handleBanDetection(
      'gemini',
      'user@gmail.com',
      'API access disabled in this account'
    );

    expect(result).toBe(true);

    // Verify account was paused in registry
    const registry = JSON.parse(
      fs.readFileSync(path.join(ccsDir(), 'cliproxy', 'accounts.json'), 'utf-8')
    );
    expect(registry.providers.gemini.accounts['user@gmail.com'].paused).toBe(true);
  });

  it('should return false for non-ban errors', () => {
    writeRegistry({
      gemini: {
        default: 'user@gmail.com',
        accounts: {
          'user@gmail.com': {
            email: 'user@gmail.com',
            tokenFile: 'gemini-user.json',
          },
        },
      },
    });
    writeTokenFile('gemini-user.json');

    const result = handleBanDetection('gemini', 'user@gmail.com', 'Rate limit exceeded');

    expect(result).toBe(false);

    // Verify account was NOT paused
    const registry = JSON.parse(
      fs.readFileSync(path.join(ccsDir(), 'cliproxy', 'accounts.json'), 'utf-8')
    );
    expect(registry.providers.gemini.accounts['user@gmail.com'].paused).toBeUndefined();
  });
});

// ========================================
// warnCrossProviderDuplicates
// ========================================

describe('warnCrossProviderDuplicates', () => {
  it('should return true when duplicates exist', () => {
    writeRegistry({
      gemini: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'gemini-shared.json',
          },
        },
      },
      agy: {
        default: 'shared@gmail.com',
        accounts: {
          'shared@gmail.com': {
            email: 'shared@gmail.com',
            tokenFile: 'agy-shared.json',
          },
        },
      },
    });

    const result = warnCrossProviderDuplicates('gemini');
    expect(result).toBe(true);
  });

  it('should return false when no duplicates', () => {
    writeRegistry({
      gemini: {
        default: 'user1@gmail.com',
        accounts: {
          'user1@gmail.com': {
            email: 'user1@gmail.com',
            tokenFile: 'gemini-user1.json',
          },
        },
      },
      agy: {
        default: 'user2@gmail.com',
        accounts: {
          'user2@gmail.com': {
            email: 'user2@gmail.com',
            tokenFile: 'agy-user2.json',
          },
        },
      },
    });

    const result = warnCrossProviderDuplicates('gemini');
    expect(result).toBe(false);
  });

  it('should return false for non-Google providers', () => {
    writeRegistry({
      kiro: {
        default: 'user@example.com',
        accounts: {
          'user@example.com': {
            email: 'user@example.com',
            tokenFile: 'kiro-user.json',
          },
        },
      },
    });

    const result = warnCrossProviderDuplicates('kiro' as never);
    expect(result).toBe(false);
  });
});
