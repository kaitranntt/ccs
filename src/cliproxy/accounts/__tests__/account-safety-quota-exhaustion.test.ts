/**
 * Account Safety Quota Exhaustion Handler Tests
 *
 * Tests for handleQuotaExhaustion() and writeQuotaWarning():
 * - Cooldown application
 * - Account switching
 * - Fallback when no alternatives
 * - Warning output formatting
 * - Email masking
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  handleQuotaExhaustion,
  writeQuotaWarning,
  maskEmail,
  pauseAccountForQuotaCooldown,
  restoreExpiredQuotaPauses,
} from '../../accounts/account-safety';
import { sanitizeEmail } from '../../auth/auth-utils';

// Setup test isolation
let tmpDir: string;
let origCcsHome: string | undefined;
let originalFetch: typeof fetch;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-exhaust-'));
  origCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (origCcsHome !== undefined) {
    process.env.CCS_HOME = origCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: write accounts registry
function writeRegistry(providers: Record<string, unknown>): void {
  const registryDir = path.join(tmpDir, '.ccs', 'cliproxy');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(
    path.join(registryDir, 'accounts.json'),
    JSON.stringify({ version: 1, providers }, null, 2)
  );
}

// Helper: write unified config
function writeConfig(quotaConfig: unknown): void {
  const configDir = path.join(tmpDir, '.ccs');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.yaml'),
    JSON.stringify({
      version: 13,
      quota_management: quotaConfig,
    })
  );
}

function writeClaudeAuth(accountId: string, accessToken: string): void {
  const authDir = path.join(tmpDir, '.ccs', 'cliproxy', 'auth');
  const tokenFile = `claude-${sanitizeEmail(accountId)}.json`;
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, tokenFile),
    JSON.stringify(
      {
        access_token: accessToken,
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
        email: accountId,
      },
      null,
      2
    )
  );
}

function writeCodexAuth(tokenFile: string, accountId: string, accessToken: string): void {
  writeAuthToken(tokenFile, {
    access_token: accessToken,
    account_id: `chatgpt-${accountId}`,
    expired: '2099-01-01T00:00:00.000Z',
    type: 'codex',
    email: accountId,
  });
}

function writeGhcpAuth(tokenFile: string, accessToken: string): void {
  writeAuthToken(tokenFile, {
    access_token: accessToken,
    type: 'ghcp',
  });
}

function writeGeminiAuth(tokenFile: string, accountId: string, accessToken: string): void {
  writeAuthToken(tokenFile, {
    type: 'gemini',
    email: accountId,
    project_id: 'cloudaicompanion-test-123',
    token: {
      access_token: accessToken,
      refresh_token: `${accessToken}-refresh`,
      expiry: Date.now() + 60 * 60 * 1000,
    },
  });
}

function writeAuthToken(tokenFile: string, payload: Record<string, unknown>): void {
  const authDir = path.join(tmpDir, '.ccs', 'cliproxy', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, tokenFile), JSON.stringify(payload, null, 2));
}

describe('Quota Exhaustion Handlers', () => {
  describe('writeQuotaWarning', () => {
    it('should write to stderr with box format', async () => {
      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as any;

      writeQuotaWarning('test@gmail.com', 20);

      process.stderr.write = originalWrite;

      // Verify output contains account
      const fullOutput = stderrWrites.join('');
      expect(fullOutput).toContain('tes');
      expect(fullOutput).toContain('20%');

      // Verify box borders present
      expect(fullOutput).toContain('\u2554'); // Top-left corner
      expect(fullOutput).toContain('\u2557'); // Top-right corner
      expect(fullOutput).toContain('\u255A'); // Bottom-left corner
      expect(fullOutput).toContain('\u255D'); // Bottom-right corner
      expect(fullOutput).toContain('\u2551'); // Vertical bar
    });

    it('should mask email showing only first 3 chars', async () => {
      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as any;

      writeQuotaWarning('verylongemail@example.com', 15);

      process.stderr.write = originalWrite;

      const fullOutput = stderrWrites.join('');
      // Should show "ver***@example.com"
      expect(fullOutput).toContain('ver***@example.com');
      expect(fullOutput).not.toContain('verylongemail@example.com');
    });

    it('should include threshold percentage', async () => {
      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as any;

      writeQuotaWarning('test@gmail.com', 5);

      process.stderr.write = originalWrite;

      const fullOutput = stderrWrites.join('');
      expect(fullOutput).toContain('5%');
    });
  });

  describe('maskEmail', () => {
    it('should mask standard email', () => {
      const result = maskEmail('user@example.com');
      expect(result).toBe('use***@example.com');
    });

    it('should handle short local part', () => {
      const result = maskEmail('ab@example.com');
      expect(result).toBe('ab***@example.com');
    });

    it('should handle single char local part', () => {
      const result = maskEmail('a@example.com');
      expect(result).toBe('a***@example.com');
    });

    it('should return input if no @ sign', () => {
      const result = maskEmail('not-an-email');
      expect(result).toBe('not-an-email');
    });

    it('should return input if empty string', () => {
      const result = maskEmail('');
      expect(result).toBe('');
    });
  });

  describe('handleQuotaExhaustion', () => {
    it('should apply cooldown to exhausted account', async () => {
      writeRegistry({
        agy: {
          default: 'exhausted@gmail.com',
          accounts: {
            'exhausted@gmail.com': {
              email: 'exhausted@gmail.com',
              tokenFile: 'agy-exhausted.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      const { isOnCooldown } = await import('../../quota/quota-manager');

      const result = await handleQuotaExhaustion('agy', 'exhausted@gmail.com', 10);

      // Verify cooldown was applied (account now on cooldown)
      expect(isOnCooldown('agy', 'exhausted@gmail.com')).toBe(true);
      // Should return a result with reason
      expect(result.reason).toBeDefined();
    });

    it('should handle no alternatives gracefully', async () => {
      writeRegistry({
        agy: {
          default: 'only@gmail.com',
          accounts: {
            'only@gmail.com': {
              email: 'only@gmail.com',
              tokenFile: 'agy-only.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      const result = await handleQuotaExhaustion('agy', 'only@gmail.com', 10);
      const { getAccount } = await import('../account-manager');

      // Should return gracefully with null switched
      expect(result.switchedTo).toBeNull();
      expect(result.reason).toContain('no alternatives');
      expect(getAccount('agy', 'only@gmail.com')?.paused).not.toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
    });

    it('should switch Claude accounts without durable pause when fallback quota is unknown', async () => {
      writeRegistry({
        claude: {
          default: 'exhausted@example.com',
          accounts: {
            'exhausted@example.com': {
              email: 'exhausted@example.com',
              tokenFile: `claude-${sanitizeEmail('exhausted@example.com')}.json`,
            },
            'fallback@example.com': {
              email: 'fallback@example.com',
              tokenFile: `claude-${sanitizeEmail('fallback@example.com')}.json`,
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeClaudeAuth('exhausted@example.com', 'exhausted-token');
      writeClaudeAuth('fallback@example.com', 'fallback-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const authHeader = new Headers(options?.headers).get('Authorization') ?? '';
        if (authHeader === 'Bearer fallback-token') {
          return Promise.resolve(new Response('', { status: 404 }));
        }

        return Promise.resolve(new Response('', { status: 500 }));
      }) as typeof fetch;

      const result = await handleQuotaExhaustion('claude', 'exhausted@example.com', 10);
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedTo).toBe('fallback@example.com');
      expect(getDefaultAccount('claude')?.id).toBe('fallback@example.com');
      expect(getAccount('claude', 'exhausted@example.com')?.paused).not.toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
      expect(
        fs.existsSync(
          path.join(
            tmpDir,
            '.ccs',
            'cliproxy',
            'auth',
            `claude-${sanitizeEmail('exhausted@example.com')}.json`
          )
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            tmpDir,
            '.ccs',
            'cliproxy',
            'auth-paused',
            `claude-${sanitizeEmail('exhausted@example.com')}.json`
          )
        )
      ).toBe(false);
    });

    it('should self-pause exhausted Codex accounts when a healthy fallback exists', async () => {
      writeRegistry({
        codex: {
          default: 'exhausted@example.com',
          accounts: {
            'exhausted@example.com': {
              email: 'exhausted@example.com',
              tokenFile: 'codex-exhausted.json',
            },
            'fallback@example.com': {
              email: 'fallback@example.com',
              tokenFile: 'codex-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth('codex-exhausted.json', 'exhausted@example.com', 'exhausted-token');
      writeCodexAuth('codex-fallback.json', 'fallback@example.com', 'fallback-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        const usedPercent = accountHeader === 'chatgpt-fallback@example.com' ? 10 : 100;
        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: usedPercent, reset_after_seconds: 3600 },
              secondary_window: { used_percent: usedPercent, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const result = await handleQuotaExhaustion('codex', 'exhausted@example.com', 10);
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedTo).toBe('fallback@example.com');
      expect(getDefaultAccount('codex')?.id).toBe('fallback@example.com');
      expect(getAccount('codex', 'exhausted@example.com')?.paused).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-exhausted.json'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'codex-exhausted.json'))
      ).toBe(false);
    });

    it('should not durably self-pause the only exhausted Codex account during preflight', async () => {
      writeRegistry({
        codex: {
          default: 'only-codex@example.com',
          accounts: {
            'only-codex@example.com': {
              email: 'only-codex@example.com',
              tokenFile: 'codex-only.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth('codex-only.json', 'only-codex@example.com', 'only-token');

      global.fetch = mock(() =>
        Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: 100, reset_after_seconds: 3600 },
              secondary_window: { used_percent: 100, reset_after_seconds: 604800 },
            },
          })
        )
      ) as typeof fetch;

      const { preflightCheck } = await import('../../quota/quota-manager');
      const result = await preflightCheck('codex');
      const { getAccount } = await import('../account-manager');

      expect(result.accountId).toBe('only-codex@example.com');
      expect(result.switchedFrom).toBeUndefined();
      expect(result.reason).toContain('no alternatives available');
      expect(getAccount('codex', 'only-codex@example.com')?.paused).not.toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'codex-only.json'))).toBe(
        true
      );
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-only.json'))
      ).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
    });

    it('should self-pause an exhausted Codex default during preflight when fallback exists', async () => {
      writeRegistry({
        codex: {
          default: 'preflight-exhausted@example.com',
          accounts: {
            'preflight-exhausted@example.com': {
              email: 'preflight-exhausted@example.com',
              tokenFile: 'codex-preflight-exhausted.json',
            },
            'preflight-fallback@example.com': {
              email: 'preflight-fallback@example.com',
              tokenFile: 'codex-preflight-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth(
        'codex-preflight-exhausted.json',
        'preflight-exhausted@example.com',
        'preflight-exhausted-token'
      );
      writeCodexAuth(
        'codex-preflight-fallback.json',
        'preflight-fallback@example.com',
        'preflight-fallback-token'
      );

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        const usedPercent = accountHeader === 'chatgpt-preflight-fallback@example.com' ? 10 : 100;
        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: usedPercent, reset_after_seconds: 3600 },
              secondary_window: { used_percent: usedPercent, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const { preflightCheck } = await import('../../quota/quota-manager');
      const result = await preflightCheck('codex');
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedFrom).toBe('preflight-exhausted@example.com');
      expect(result.accountId).toBe('preflight-fallback@example.com');
      expect(getDefaultAccount('codex')?.id).toBe('preflight-fallback@example.com');
      expect(getAccount('codex', 'preflight-exhausted@example.com')?.paused).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-preflight-exhausted.json')
        )
      ).toBe(true);
    });

    it('should self-pause exhausted non-default Codex accounts before CLIProxy rotation', async () => {
      writeRegistry({
        codex: {
          default: 'rotation-default@example.com',
          accounts: {
            'rotation-default@example.com': {
              email: 'rotation-default@example.com',
              tokenFile: 'codex-rotation-default.json',
            },
            'rotation-exhausted@example.com': {
              email: 'rotation-exhausted@example.com',
              tokenFile: 'codex-rotation-exhausted.json',
            },
            'rotation-healthy@example.com': {
              email: 'rotation-healthy@example.com',
              tokenFile: 'codex-rotation-healthy.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth(
        'codex-rotation-default.json',
        'rotation-default@example.com',
        'rotation-default-token'
      );
      writeCodexAuth(
        'codex-rotation-exhausted.json',
        'rotation-exhausted@example.com',
        'rotation-exhausted-token'
      );
      writeCodexAuth(
        'codex-rotation-healthy.json',
        'rotation-healthy@example.com',
        'rotation-healthy-token'
      );

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        const usedPercent = accountHeader === 'chatgpt-rotation-exhausted@example.com' ? 100 : 10;
        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: usedPercent, reset_after_seconds: 3600 },
              secondary_window: { used_percent: usedPercent, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const { preflightCheck } = await import('../../quota/quota-manager');
      const result = await preflightCheck('codex');
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.accountId).toBe('rotation-default@example.com');
      expect(result.switchedFrom).toBeUndefined();
      expect(getDefaultAccount('codex')?.id).toBe('rotation-default@example.com');
      expect(getAccount('codex', 'rotation-default@example.com')?.paused).not.toBe(true);
      expect(getAccount('codex', 'rotation-healthy@example.com')?.paused).not.toBe(true);
      expect(getAccount('codex', 'rotation-exhausted@example.com')?.paused).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-rotation-exhausted.json')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'codex-rotation-exhausted.json')
        )
      ).toBe(false);
    });

    it('should durably pause non-default Codex accounts already on cooldown', async () => {
      writeRegistry({
        codex: {
          default: 'cooldown-default@example.com',
          accounts: {
            'cooldown-default@example.com': {
              email: 'cooldown-default@example.com',
              tokenFile: 'codex-cooldown-default.json',
            },
            'cooldown-exhausted@example.com': {
              email: 'cooldown-exhausted@example.com',
              tokenFile: 'codex-cooldown-exhausted.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth(
        'codex-cooldown-default.json',
        'cooldown-default@example.com',
        'cooldown-default-token'
      );
      writeCodexAuth(
        'codex-cooldown-exhausted.json',
        'cooldown-exhausted@example.com',
        'cooldown-exhausted-token'
      );

      const { applyCooldown, preflightCheck } = await import('../../quota/quota-manager');
      applyCooldown('codex', 'cooldown-exhausted@example.com', 10);

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        const usedPercent = accountHeader === 'chatgpt-cooldown-default@example.com' ? 10 : 100;
        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: usedPercent, reset_after_seconds: 3600 },
              secondary_window: { used_percent: usedPercent, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const result = await preflightCheck('codex');
      const { getAccount } = await import('../account-manager');

      expect(result.accountId).toBe('cooldown-default@example.com');
      expect(getAccount('codex', 'cooldown-exhausted@example.com')?.paused).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-cooldown-exhausted.json')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'codex-cooldown-exhausted.json')
        )
      ).toBe(false);
    });

    it('should reconcile exhausted rotation accounts before honoring forced default', async () => {
      writeRegistry({
        codex: {
          default: 'forced-default@example.com',
          accounts: {
            'forced-default@example.com': {
              email: 'forced-default@example.com',
              tokenFile: 'codex-forced-default.json',
            },
            'forced-exhausted@example.com': {
              email: 'forced-exhausted@example.com',
              tokenFile: 'codex-forced-exhausted.json',
            },
            'forced-healthy@example.com': {
              email: 'forced-healthy@example.com',
              tokenFile: 'codex-forced-healthy.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        manual: {
          forced_default: 'forced-default@example.com',
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth('codex-forced-default.json', 'forced-default@example.com', 'forced-token');
      writeCodexAuth(
        'codex-forced-exhausted.json',
        'forced-exhausted@example.com',
        'forced-exhausted-token'
      );
      writeCodexAuth('codex-forced-healthy.json', 'forced-healthy@example.com', 'healthy-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        const usedPercent = accountHeader === 'chatgpt-forced-exhausted@example.com' ? 100 : 10;
        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: usedPercent, reset_after_seconds: 3600 },
              secondary_window: { used_percent: usedPercent, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const { preflightCheck } = await import('../../quota/quota-manager');
      const result = await preflightCheck('codex');
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.accountId).toBe('forced-default@example.com');
      expect(result.reason).toBe('Forced default override');
      expect(getDefaultAccount('codex')?.id).toBe('forced-default@example.com');
      expect(getAccount('codex', 'forced-default@example.com')?.paused).not.toBe(true);
      expect(getAccount('codex', 'forced-healthy@example.com')?.paused).not.toBe(true);
      expect(getAccount('codex', 'forced-exhausted@example.com')?.paused).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'codex-forced-exhausted.json')
        )
      ).toBe(true);
    });

    it('should not durably self-pause during preflight when fallback quota is unknown', async () => {
      writeRegistry({
        codex: {
          default: 'preflight-unknown-exhausted@example.com',
          accounts: {
            'preflight-unknown-exhausted@example.com': {
              email: 'preflight-unknown-exhausted@example.com',
              tokenFile: 'codex-preflight-unknown-exhausted.json',
            },
            'preflight-unknown-fallback@example.com': {
              email: 'preflight-unknown-fallback@example.com',
              tokenFile: 'codex-preflight-unknown-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeCodexAuth(
        'codex-preflight-unknown-exhausted.json',
        'preflight-unknown-exhausted@example.com',
        'preflight-unknown-exhausted-token'
      );
      writeCodexAuth(
        'codex-preflight-unknown-fallback.json',
        'preflight-unknown-fallback@example.com',
        'preflight-unknown-fallback-token'
      );

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const accountHeader = new Headers(options?.headers).get('ChatGPT-Account-Id') ?? '';
        if (accountHeader === 'chatgpt-preflight-unknown-fallback@example.com') {
          return Promise.resolve(new Response('', { status: 500 }));
        }

        return Promise.resolve(
          Response.json({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: 100, reset_after_seconds: 3600 },
              secondary_window: { used_percent: 100, reset_after_seconds: 604800 },
            },
          })
        );
      }) as typeof fetch;

      const { preflightCheck } = await import('../../quota/quota-manager');
      const result = await preflightCheck('codex');
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedFrom).toBe('preflight-unknown-exhausted@example.com');
      expect(result.accountId).toBe('preflight-unknown-fallback@example.com');
      expect(getDefaultAccount('codex')?.id).toBe('preflight-unknown-fallback@example.com');
      expect(getAccount('codex', 'preflight-unknown-exhausted@example.com')?.paused).not.toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'codex-preflight-unknown-exhausted.json')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            tmpDir,
            '.ccs',
            'cliproxy',
            'auth-paused',
            'codex-preflight-unknown-exhausted.json'
          )
        )
      ).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
    });

    it('should self-pause exhausted Gemini accounts when a healthy fallback exists', async () => {
      writeRegistry({
        gemini: {
          default: 'gemini-exhausted@example.com',
          accounts: {
            'gemini-exhausted@example.com': {
              email: 'gemini-exhausted@example.com',
              tokenFile: 'gemini-exhausted.json',
            },
            'gemini-fallback@example.com': {
              email: 'gemini-fallback@example.com',
              tokenFile: 'gemini-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeGeminiAuth('gemini-exhausted.json', 'gemini-exhausted@example.com', 'exhausted-token');
      writeGeminiAuth('gemini-fallback.json', 'gemini-fallback@example.com', 'fallback-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const authHeader = new Headers(options?.headers).get('Authorization') ?? '';
        const remainingFraction = authHeader === 'Bearer fallback-token' ? 0.9 : 0;
        return Promise.resolve(
          Response.json({
            buckets: [
              {
                model_id: 'gemini-3-flash-preview',
                remaining_fraction: remainingFraction,
                remaining_amount: Math.round(remainingFraction * 100),
                reset_time: '2026-05-01T00:00:00Z',
              },
            ],
          })
        );
      }) as typeof fetch;

      const result = await handleQuotaExhaustion('gemini', 'gemini-exhausted@example.com', 10);
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedTo).toBe('gemini-fallback@example.com');
      expect(getDefaultAccount('gemini')?.id).toBe('gemini-fallback@example.com');
      expect(getAccount('gemini', 'gemini-exhausted@example.com')?.paused).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'gemini-exhausted.json'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth', 'gemini-exhausted.json'))
      ).toBe(false);
    });

    it('should self-pause exhausted GitHub Copilot accounts when a healthy fallback exists', async () => {
      writeRegistry({
        ghcp: {
          default: 'ghcp-exhausted',
          accounts: {
            'ghcp-exhausted': {
              tokenFile: 'ghcp-exhausted.json',
            },
            'ghcp-fallback': {
              tokenFile: 'ghcp-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeGhcpAuth('ghcp-exhausted.json', 'exhausted-token');
      writeGhcpAuth('ghcp-fallback.json', 'fallback-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const authHeader = new Headers(options?.headers).get('Authorization') ?? '';
        const remaining = authHeader === 'token fallback-token' ? 90 : 0;
        return Promise.resolve(
          Response.json({
            copilot_plan: 'individual',
            quota_reset_date: '2026-05-01T00:00:00Z',
            quota_snapshots: {
              premium_interactions: { entitlement: 100, remaining },
              chat: { entitlement: 100, remaining },
              completions: { entitlement: 100, remaining },
            },
          })
        );
      }) as typeof fetch;

      const result = await handleQuotaExhaustion('ghcp', 'ghcp-exhausted', 10);
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedTo).toBe('ghcp-fallback');
      expect(getDefaultAccount('ghcp')?.id).toBe('ghcp-fallback');
      expect(getAccount('ghcp', 'ghcp-exhausted')?.paused).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'ghcp-exhausted.json'))
      ).toBe(true);
    });

    it('should ignore omitted GitHub Copilot snapshots when selecting a fallback', async () => {
      writeRegistry({
        ghcp: {
          default: 'ghcp-partial-exhausted',
          accounts: {
            'ghcp-partial-exhausted': {
              tokenFile: 'ghcp-partial-exhausted.json',
            },
            'ghcp-partial-fallback': {
              tokenFile: 'ghcp-partial-fallback.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro', 'free'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      writeGhcpAuth('ghcp-partial-exhausted.json', 'partial-exhausted-token');
      writeGhcpAuth('ghcp-partial-fallback.json', 'partial-fallback-token');

      global.fetch = mock((_url: string, options?: RequestInit) => {
        const authHeader = new Headers(options?.headers).get('Authorization') ?? '';
        const remaining = authHeader === 'token partial-fallback-token' ? 90 : 0;
        return Promise.resolve(
          Response.json({
            copilot_plan: 'individual',
            quota_reset_date: '2026-05-01T00:00:00Z',
            quota_snapshots: {
              premium_interactions: { entitlement: 100, remaining },
              chat: { entitlement: 100, remaining },
            },
          })
        );
      }) as typeof fetch;

      const result = await handleQuotaExhaustion('ghcp', 'ghcp-partial-exhausted', 10);
      const { getAccount, getDefaultAccount } = await import('../account-manager');

      expect(result.switchedTo).toBe('ghcp-partial-fallback');
      expect(getDefaultAccount('ghcp')?.id).toBe('ghcp-partial-fallback');
      expect(getAccount('ghcp', 'ghcp-partial-exhausted')?.paused).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'ghcp-partial-exhausted.json')
        )
      ).toBe(true);
    });

    it('should write warning to stderr', async () => {
      writeRegistry({
        agy: {
          default: 'exhausted@gmail.com',
          accounts: {
            'exhausted@gmail.com': {
              email: 'exhausted@gmail.com',
              tokenFile: 'agy-exhausted.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro'],
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 10,
        },
      });

      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as any;

      await handleQuotaExhaustion('agy', 'exhausted@gmail.com', 10);

      process.stderr.write = originalWrite;

      const fullOutput = stderrWrites.join('');
      // Should contain exhaustion indicator
      expect(fullOutput).toContain('[X]');
    });

    it('should complete without throwing', async () => {
      writeRegistry({
        agy: {
          default: 'test@gmail.com',
          accounts: {
            'test@gmail.com': {
              email: 'test@gmail.com',
              tokenFile: 'agy-test.json',
            },
          },
        },
      });

      writeConfig({
        mode: 'auto',
        auto: {
          tier_priority: ['ultra', 'pro'],
          exhaustion_threshold: 5,
          cooldown_minutes: 5,
          preflight_check: true,
        },
        runtime_monitor: {
          enabled: true,
          normal_interval_seconds: 300,
          critical_interval_seconds: 60,
          warn_threshold: 20,
          exhaustion_threshold: 5,
          cooldown_minutes: 5,
        },
      });

      const result = await handleQuotaExhaustion('agy', 'test@gmail.com', 5);
      expect(result).toBeDefined();
      expect(result.switchedTo).toBeNull();
    });

    it('auto-resumes quota-paused accounts after cooldown expiry', async () => {
      writeRegistry({
        agy: {
          default: 'cooldown@gmail.com',
          accounts: {
            'cooldown@gmail.com': {
              email: 'cooldown@gmail.com',
              tokenFile: 'agy-cooldown.json',
            },
          },
        },
      });
      writeAuthToken('agy-cooldown.json', {
        type: 'agy',
        email: 'cooldown@gmail.com',
        access_token: 'token',
      });

      const now = Date.now();
      expect(pauseAccountForQuotaCooldown('agy', 'cooldown@gmail.com', 5, now)).toBe(true);

      const { getAccount } = await import('../account-manager');
      expect(getAccount('agy', 'cooldown@gmail.com')?.paused).toBe(true);

      const resumed = restoreExpiredQuotaPauses(now + 6 * 60 * 1000);

      expect(resumed).toBe(1);
      expect(getAccount('agy', 'cooldown@gmail.com')?.paused).not.toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
    });

    it('does not auto-resume quota-paused accounts when pausedAt metadata is missing', async () => {
      writeRegistry({
        agy: {
          default: 'cooldown@gmail.com',
          accounts: {
            'cooldown@gmail.com': {
              email: 'cooldown@gmail.com',
              tokenFile: 'agy-cooldown.json',
            },
          },
        },
      });
      writeAuthToken('agy-cooldown.json', {
        type: 'agy',
        email: 'cooldown@gmail.com',
        access_token: 'token',
      });

      const now = Date.now();
      expect(pauseAccountForQuotaCooldown('agy', 'cooldown@gmail.com', 5, now)).toBe(true);

      const registryPath = path.join(tmpDir, '.ccs', 'cliproxy', 'accounts.json');
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
        providers: {
          agy: {
            default: string;
            accounts: Record<string, { paused?: boolean; pausedAt?: string }>;
          };
        };
      };
      delete registry.providers.agy.accounts['cooldown@gmail.com']?.pausedAt;
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

      const resumed = restoreExpiredQuotaPauses(now + 6 * 60 * 1000);
      const { getAccount } = await import('../account-manager');

      expect(resumed).toBe(0);
      expect(getAccount('agy', 'cooldown@gmail.com')?.paused).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'agy-cooldown.json'))
      ).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json'))).toBe(false);
    });

    it('keeps quota-paused entries when auto-resume fails and retries later', async () => {
      writeRegistry({
        agy: {
          default: 'cooldown@gmail.com',
          accounts: {
            'cooldown@gmail.com': {
              email: 'cooldown@gmail.com',
              tokenFile: 'agy-cooldown.json',
            },
          },
        },
      });
      writeAuthToken('agy-cooldown.json', {
        type: 'agy',
        email: 'cooldown@gmail.com',
        access_token: 'token',
      });

      const now = Date.now();
      expect(pauseAccountForQuotaCooldown('agy', 'cooldown@gmail.com', 5, now)).toBe(true);

      fs.rmSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth'), {
        recursive: true,
        force: true,
      });

      const resumed = restoreExpiredQuotaPauses(now + 6 * 60 * 1000);
      const { getAccount } = await import('../account-manager');
      const quotaPausedPath = path.join(tmpDir, '.ccs', 'cliproxy', 'quota-paused.json');
      const quotaPaused = JSON.parse(fs.readFileSync(quotaPausedPath, 'utf8')) as {
        entries?: Array<{ accountId?: string }>;
      };

      expect(resumed).toBe(0);
      expect(getAccount('agy', 'cooldown@gmail.com')?.paused).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.ccs', 'cliproxy', 'auth-paused', 'agy-cooldown.json'))
      ).toBe(true);
      expect(quotaPaused.entries?.map((entry) => entry.accountId)).toContain('cooldown@gmail.com');
    });
  });
});
