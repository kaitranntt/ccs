/**
 * Claude Quota Fetcher Unit Tests
 *
 * Covers Claude quota parsing and auth/token edge cases.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildClaudeQuotaWindows,
  buildClaudeCoreUsageSummary,
  fetchClaudeQuota,
  fetchAllClaudeQuotas,
} from '../quota-fetcher-claude';
import { sanitizeEmail } from '../../auth/auth-utils';

let tmpDir: string;
let originalCcsHome: string | undefined;
let originalFetch: typeof fetch;

function createClaudeAccount(
  accountId: string,
  tokenPayload: Record<string, unknown>,
  tokenPrefix: 'claude' | 'anthropic' = 'claude'
): void {
  const cliproxyDir = path.join(tmpDir, '.ccs', 'cliproxy');
  const authDir = path.join(cliproxyDir, 'auth');
  const sanitized = sanitizeEmail(accountId);
  const tokenFile = `${tokenPrefix}-${sanitized}.json`;

  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, tokenFile), JSON.stringify(tokenPayload, null, 2));
  fs.writeFileSync(
    path.join(cliproxyDir, 'accounts.json'),
    JSON.stringify(
      {
        version: 1,
        providers: {
          claude: {
            default: accountId,
            accounts: {
              [accountId]: {
                email: accountId,
                tokenFile,
                createdAt: '2026-02-20T00:00:00.000Z',
                lastUsedAt: '2026-02-20T00:00:00.000Z',
              },
            },
          },
        },
      },
      null,
      2
    )
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-claude-quota-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Claude Quota Fetcher', () => {
  describe('buildClaudeQuotaWindows', () => {
    it('parses restrictions array payload', () => {
      const windows = buildClaudeQuotaWindows({
        restrictions: [
          {
            rateLimitType: 'five_hour',
            utilization: 0.4,
            resetsAt: '2026-02-28T10:00:00Z',
            status: 'allowed',
          },
          {
            rateLimitType: 'seven_day',
            utilization: 0.8,
            resetsAt: '2026-03-06T10:00:00Z',
            status: 'allowed_warning',
          },
        ],
      });

      expect(windows).toHaveLength(2);
      expect(windows[0].rateLimitType).toBe('five_hour');
      expect(windows[0].remainingPercent).toBe(60);
      expect(windows[1].rateLimitType).toBe('seven_day');
      expect(windows[1].remainingPercent).toBe(20);
    });

    it('parses object-map restrictions payload', () => {
      const windows = buildClaudeQuotaWindows({
        restrictions: {
          five_hour: {
            utilization: 0.25,
            resetsAt: '2026-02-28T10:00:00Z',
            status: 'allowed',
          },
          seven_day_opus: {
            utilization: 0.9,
            resetsAt: '2026-03-06T10:00:00Z',
            status: 'allowed_warning',
          },
        },
      });

      expect(windows.map((window) => window.rateLimitType)).toEqual(
        expect.arrayContaining(['five_hour', 'seven_day_opus'])
      );
    });

    it('clamps utilization ratio into 0..1', () => {
      const windows = buildClaudeQuotaWindows({
        restrictions: [
          {
            rateLimitType: 'five_hour',
            utilization: 150,
            status: 'allowed',
          },
          {
            rateLimitType: 'seven_day',
            utilization: -25,
            status: 'allowed',
          },
        ],
      });

      expect(windows).toHaveLength(2);
      expect(windows[0].utilization).toBe(1);
      expect(windows[0].remainingPercent).toBe(0);
      expect(windows[1].utilization).toBe(0);
      expect(windows[1].remainingPercent).toBe(100);
    });

    it('parses direct single restriction payload shape', () => {
      const windows = buildClaudeQuotaWindows({
        rateLimitType: 'five_hour',
        utilization: 0.6,
        status: 'allowed',
        resetsAt: '2026-02-28T10:00:00Z',
      });

      expect(windows).toHaveLength(1);
      expect(windows[0].rateLimitType).toBe('five_hour');
      expect(windows[0].remainingPercent).toBe(40);
    });

    it('parses OAuth usage payload keyed by window name', () => {
      const windows = buildClaudeQuotaWindows({
        five_hour: {
          utilization: 39,
          resets_at: '2026-02-28T10:00:00Z',
        },
        seven_day_sonnet: {
          utilization: 9,
          resets_at: '2026-03-06T10:00:00Z',
        },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 5000,
          used_credits: 1200,
          utilization: 0.24,
        },
      });

      expect(windows).toHaveLength(2);
      expect(windows[0].rateLimitType).toBe('five_hour');
      expect(windows[0].remainingPercent).toBe(61);
      expect(windows[1].rateLimitType).toBe('seven_day_sonnet');
      expect(windows[1].remainingPercent).toBe(91);
    });

    it('parses future OAuth usage windows without hardcoded keys', () => {
      const windows = buildClaudeQuotaWindows({
        seven_day_haiku: {
          utilization: 16,
          resets_at: '2026-03-06T10:00:00Z',
        },
      });

      expect(windows).toHaveLength(1);
      expect(windows[0].rateLimitType).toBe('seven_day_haiku');
      expect(windows[0].label).toBe('Seven Day Haiku');
      expect(windows[0].remainingPercent).toBe(84);
    });

    it('treats OAuth usage utilization as percent (regression for issue: Sonnet weekly shown as 0% when 1% used)', () => {
      const windows = buildClaudeQuotaWindows({
        five_hour: { utilization: 34.0, resets_at: '2026-04-27T06:50:01Z' },
        seven_day: { utilization: 8.0, resets_at: '2026-04-27T18:00:00Z' },
        seven_day_sonnet: { utilization: 1.0, resets_at: '2026-04-27T18:00:00Z' },
      });
      const sonnet = windows.find((w) => w.rateLimitType === 'seven_day_sonnet');
      expect(sonnet?.usedPercent).toBe(1);
      expect(sonnet?.remainingPercent).toBe(99);
    });
  });

  describe('buildClaudeCoreUsageSummary', () => {
    it('selects most restrictive weekly window', () => {
      const summary = buildClaudeCoreUsageSummary([
        {
          rateLimitType: 'five_hour',
          label: 'Session limit',
          status: 'allowed',
          utilization: 0.35,
          usedPercent: 35,
          remainingPercent: 65,
          resetAt: '2026-02-28T10:00:00Z',
        },
        {
          rateLimitType: 'seven_day',
          label: 'Weekly limit',
          status: 'allowed',
          utilization: 0.45,
          usedPercent: 45,
          remainingPercent: 55,
          resetAt: '2026-03-06T10:00:00Z',
        },
        {
          rateLimitType: 'seven_day_opus',
          label: 'Opus limit',
          status: 'allowed_warning',
          utilization: 0.85,
          usedPercent: 85,
          remainingPercent: 15,
          resetAt: '2026-03-06T12:00:00Z',
        },
      ]);

      expect(summary.fiveHour?.rateLimitType).toBe('five_hour');
      expect(summary.weekly?.rateLimitType).toBe('seven_day_opus');
      expect(summary.weekly?.remainingPercent).toBe(15);
    });

    it('considers oauth/cowork weekly windows in core summary', () => {
      const summary = buildClaudeCoreUsageSummary([
        {
          rateLimitType: 'five_hour',
          label: 'Session limit',
          status: 'allowed',
          utilization: 0.35,
          usedPercent: 35,
          remainingPercent: 65,
          resetAt: '2026-02-28T10:00:00Z',
        },
        {
          rateLimitType: 'seven_day_oauth_apps',
          label: 'OAuth apps limit',
          status: 'allowed_warning',
          utilization: 0.92,
          usedPercent: 92,
          remainingPercent: 8,
          resetAt: '2026-03-06T10:00:00Z',
        },
        {
          rateLimitType: 'seven_day_cowork',
          label: 'Cowork limit',
          status: 'allowed',
          utilization: 0.4,
          usedPercent: 40,
          remainingPercent: 60,
          resetAt: '2026-03-06T12:00:00Z',
        },
      ]);

      expect(summary.fiveHour?.rateLimitType).toBe('five_hour');
      expect(summary.weekly?.rateLimitType).toBe('seven_day_oauth_apps');
      expect(summary.weekly?.remainingPercent).toBe(8);
    });

    it('does not duplicate weekly window into fiveHour when only weekly exists', () => {
      const summary = buildClaudeCoreUsageSummary([
        {
          rateLimitType: 'seven_day',
          label: 'Weekly limit',
          status: 'allowed',
          utilization: 0.45,
          usedPercent: 45,
          remainingPercent: 55,
          resetAt: '2026-03-06T10:00:00Z',
        },
      ]);

      expect(summary.fiveHour).toBeNull();
      expect(summary.weekly?.rateLimitType).toBe('seven_day');
    });

    it('uses earliest reset as tie-breaker for equal weekly remaining quota', () => {
      const summary = buildClaudeCoreUsageSummary([
        {
          rateLimitType: 'five_hour',
          label: 'Session limit',
          status: 'allowed',
          utilization: 0.2,
          usedPercent: 20,
          remainingPercent: 80,
          resetAt: '2026-02-28T10:00:00Z',
        },
        {
          rateLimitType: 'seven_day_opus',
          label: 'Opus limit',
          status: 'allowed',
          utilization: 0.6,
          usedPercent: 60,
          remainingPercent: 40,
          resetAt: '2026-03-06T12:00:00Z',
        },
        {
          rateLimitType: 'seven_day_sonnet',
          label: 'Sonnet limit',
          status: 'allowed',
          utilization: 0.6,
          usedPercent: 60,
          remainingPercent: 40,
          resetAt: '2026-03-06T10:00:00Z',
        },
      ]);

      expect(summary.weekly?.rateLimitType).toBe('seven_day_sonnet');
    });
  });

  describe('fetchClaudeQuota', () => {
    it('fetches and normalizes Claude OAuth usage response', async () => {
      createClaudeAccount('claude-main@example.com', {
        access_token: 'claude-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock((url: string, options?: RequestInit) => {
        expect(url).toBe('https://api.anthropic.com/api/oauth/usage');
        expect(options?.method).toBe('GET');
        expect(options?.headers).toMatchObject({
          Authorization: 'Bearer claude-token',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'anthropic-beta': 'oauth-2025-04-20',
        });

        return Promise.resolve(
          new Response(
            JSON.stringify({
              five_hour: {
                utilization: 39,
                resets_at: '2026-03-01T01:00:00Z',
              },
              seven_day: {
                utilization: 75,
                resets_at: '2026-03-07T01:00:00Z',
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }) as typeof fetch;

      const result = await fetchClaudeQuota('claude-main@example.com');

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('claude-main@example.com');
      expect(result.windows).toHaveLength(2);
      expect(result.coreUsage?.fiveHour?.remainingPercent).toBe(61);
      expect(result.coreUsage?.weekly?.remainingPercent).toBe(25);

      const all = await fetchAllClaudeQuotas();
      expect(all).toHaveLength(1);
      expect(all[0].account).toBe('claude-main@example.com');
      expect(all[0].quota.success).toBe(true);
    });

    it('returns needsReauth on empty 401 OAuth usage responses', async () => {
      createClaudeAccount(
        'claude-auth@example.com',
        {
          access_token: 'expired-token',
          expired: '2099-01-01T00:00:00.000Z',
          type: 'anthropic',
        },
        'anthropic'
      );

      global.fetch = mock(() => Promise.resolve(new Response('', { status: 401 }))) as typeof fetch;

      const result = await fetchClaudeQuota('claude-auth@example.com');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toContain('Authentication');
    });

    it('surfaces nested OAuth usage 401 messages', async () => {
      createClaudeAccount(
        'claude-oauth-nested-message@example.com',
        {
          access_token: 'oauth-token',
          expired: '2099-01-01T00:00:00.000Z',
          type: 'claude',
        },
        'claude'
      );

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'authentication_error',
                message: 'OAuth session expired.',
              },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-oauth-nested-message@example.com');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toContain('OAuth session expired.');
    });

    it('surfaces root-level OAuth usage 401 messages', async () => {
      createClaudeAccount('claude-oauth-root-message@example.com', {
        access_token: 'oauth-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: 'OAuth session expired.',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-oauth-root-message@example.com');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toContain('OAuth session expired.');
    });

    it('surfaces plain-text OAuth usage 401 messages', async () => {
      createClaudeAccount('claude-oauth-plaintext@example.com', {
        access_token: 'oauth-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock(() =>
        Promise.resolve(new Response('OAuth session expired.', { status: 401 }))
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-oauth-plaintext@example.com');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toContain('OAuth session expired.');
    });

    it('keeps non-matching 401 payloads in the reauth path', async () => {
      createClaudeAccount('claude-auth-other-401@example.com', {
        access_token: 'oauth-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                type: 'authentication_error',
                message: 'Token revoked.',
              },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-auth-other-401@example.com');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toContain('Token revoked.');
    });

    it('treats 404 OAuth usage responses as failures', async () => {
      createClaudeAccount('claude-usage-404@example.com', {
        access_token: 'oauth-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock(() => Promise.resolve(new Response('', { status: 404 }))) as typeof fetch;

      const result = await fetchClaudeQuota('claude-usage-404@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('fails fast when auth file has no token', async () => {
      createClaudeAccount('claude-missing@example.com', {
        access_token: '   ',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      const fetchMock = mock(() => Promise.resolve(new Response('', { status: 200 })));
      global.fetch = fetchMock as typeof fetch;

      const result = await fetchClaudeQuota('claude-missing@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Auth file not found');
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });

    it('treats missing expiry as not expired', async () => {
      createClaudeAccount('claude-no-expiry@example.com', {
        access_token: 'no-expiry-token',
        type: 'claude',
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-no-expiry@example.com');

      expect(result.success).toBe(true);
      expect(result.windows).toHaveLength(0);
    });

    it('falls back to status-only message when error payload is too large', async () => {
      createClaudeAccount('claude-large-error@example.com', {
        access_token: 'oauth-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response('x'.repeat(9000), {
            status: 400,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Length': '9000',
            },
          })
        )
      ) as typeof fetch;

      const result = await fetchClaudeQuota('claude-large-error@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude OAuth usage API error: 400');
    });

    it('retries once on transient 500 then succeeds', async () => {
      createClaudeAccount('claude-retry@example.com', {
        access_token: 'retry-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      let attempt = 0;
      global.fetch = mock(() => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve(new Response('', { status: 500 }));
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              five_hour: {
                utilization: 40,
                resets_at: '2026-03-01T01:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as typeof fetch;

      const result = await fetchClaudeQuota('claude-retry@example.com');

      expect(result.success).toBe(true);
      expect(attempt).toBe(2);
      expect(result.coreUsage?.fiveHour?.remainingPercent).toBe(60);
    });

    it('clears the request timeout before retrying a retryable HTTP error', async () => {
      createClaudeAccount('claude-retry-timeout@example.com', {
        access_token: 'retry-timeout-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      const activeTimers = new Set<number>();
      let nextTimerId = 0;

      globalThis.setTimeout = mock(((handler: TimerHandler, timeout?: number) => {
        void handler;
        void timeout;
        const timerId = ++nextTimerId;
        activeTimers.add(timerId);
        return timerId as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      globalThis.clearTimeout = mock(((timerId?: ReturnType<typeof setTimeout>) => {
        activeTimers.delete(timerId as unknown as number);
      }) as typeof clearTimeout);

      let attempt = 0;
      global.fetch = mock(() => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve(new Response('', { status: 500 }));
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              five_hour: {
                utilization: 25,
                resets_at: '2026-03-01T01:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as typeof fetch;

      try {
        const result = await fetchClaudeQuota('claude-retry-timeout@example.com');

        expect(result.success).toBe(true);
        expect(attempt).toBe(2);
        expect(globalThis.setTimeout).toHaveBeenCalledTimes(2);
        expect(globalThis.clearTimeout).toHaveBeenCalledTimes(2);
        expect(activeTimers.size).toBe(0);
      } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
      }
    });

    it('retries once after AbortError and succeeds', async () => {
      createClaudeAccount('claude-timeout@example.com', {
        access_token: 'timeout-token',
        expired: '2099-01-01T00:00:00.000Z',
        type: 'claude',
      });

      let attempt = 0;
      global.fetch = mock(() => {
        attempt += 1;
        if (attempt === 1) {
          const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
          return Promise.reject(abortError);
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              seven_day: {
                utilization: 30,
                resets_at: '2026-03-07T01:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as typeof fetch;

      const result = await fetchClaudeQuota('claude-timeout@example.com');

      expect(result.success).toBe(true);
      expect(attempt).toBe(2);
      expect(result.coreUsage?.weekly?.remainingPercent).toBe(70);
    });

    it('falls back to alternate auth file when preferred file is invalid JSON', async () => {
      const accountId = 'claude-fallback@example.com';
      const cliproxyDir = path.join(tmpDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const sanitized = sanitizeEmail(accountId);

      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(path.join(authDir, `claude-${sanitized}.json`), '{invalid');
      fs.writeFileSync(
        path.join(authDir, `anthropic-${sanitized}.json`),
        JSON.stringify(
          {
            access_token: 'valid-anthropic-token',
            expired: '2099-01-01T00:00:00.000Z',
            type: 'anthropic',
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(cliproxyDir, 'accounts.json'),
        JSON.stringify(
          {
            version: 1,
            providers: {
              claude: {
                default: accountId,
                accounts: {
                  [accountId]: {
                    email: accountId,
                    tokenFile: `anthropic-${sanitized}.json`,
                    createdAt: '2026-02-20T00:00:00.000Z',
                    lastUsedAt: '2026-02-20T00:00:00.000Z',
                  },
                },
              },
            },
          },
          null,
          2
        )
      );

      global.fetch = mock((_url: string, options?: RequestInit) => {
        expect(options?.headers).toMatchObject({
          Authorization: 'Bearer valid-anthropic-token',
        });
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }) as typeof fetch;

      const result = await fetchClaudeQuota(accountId);
      expect(result.success).toBe(true);
    });
  });
});
