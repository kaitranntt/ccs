/**
 * Codex Quota Fetcher Unit Tests
 *
 * Tests for Codex quota window parsing and transformation logic
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let tmpDir: string;
let originalCcsHome: string | undefined;
let originalFetch: typeof fetch;
let moduleVersion = 0;
let buildCodexQuotaWindows: typeof import('../../../src/cliproxy/quota-fetcher-codex').buildCodexQuotaWindows;
let buildCodexCoreUsageSummary: typeof import('../../../src/cliproxy/quota-fetcher-codex').buildCodexCoreUsageSummary;
let fetchCodexQuota: typeof import('../../../src/cliproxy/quota-fetcher-codex').fetchCodexQuota;
let getUnknownCodexWindowLabels: typeof import('../../../src/cliproxy/quota-fetcher-codex').getUnknownCodexWindowLabels;
let registerAccount: typeof import('../../../src/cliproxy/account-manager').registerAccount;

function createCodexAccount(
  accountId: string,
  tokenPayload: Record<string, unknown>,
  tokenFile = `codex-${accountId.replace(/[@.]/g, '_')}.json`
): void {
  const authDir = path.join(tmpDir, '.ccs', 'cliproxy', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, tokenFile), JSON.stringify(tokenPayload));
}

beforeEach(async () => {
  moduleVersion += 1;
  mock.restore();

  const configGenerator = await import(
    `../../../src/cliproxy/config-generator?codex-config-generator=${moduleVersion}`
  );
  const accountManager = await import(
    `../../../src/cliproxy/account-manager?codex-account-manager=${moduleVersion}`
  );
  mock.module('../../../src/cliproxy/config-generator', () => configGenerator);
  mock.module('../../../src/cliproxy/account-manager', () => accountManager);
  ({ registerAccount } = accountManager);

  ({
    buildCodexQuotaWindows,
    buildCodexCoreUsageSummary,
    fetchCodexQuota,
    getUnknownCodexWindowLabels,
  } = await import(`../../../src/cliproxy/quota-fetcher-codex?codex-fetcher=${moduleVersion}`));

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-quota-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  originalFetch = global.fetch;
});

afterEach(() => {
  mock.restore();
  global.fetch = originalFetch;
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Codex Quota Fetcher', () => {
  describe('buildCodexQuotaWindows', () => {
    it('should parse snake_case API response', () => {
      const response = {
        rate_limit: {
          primary_window: {
            used_percent: 25,
            reset_after_seconds: 3600,
          },
          secondary_window: {
            used_percent: 50,
            reset_after_seconds: 86400,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows).toHaveLength(2);
      expect(windows[0].label).toBe('Primary');
      expect(windows[0].usedPercent).toBe(25);
      expect(windows[0].remainingPercent).toBe(75);
      expect(windows[0].resetAfterSeconds).toBe(3600);
      expect(windows[1].label).toBe('Secondary');
      expect(windows[1].usedPercent).toBe(50);
    });

    it('should parse camelCase API response', () => {
      const response = {
        rateLimit: {
          primaryWindow: {
            usedPercent: 30,
            resetAfterSeconds: 7200,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows).toHaveLength(1);
      expect(windows[0].usedPercent).toBe(30);
      expect(windows[0].resetAfterSeconds).toBe(7200);
    });

    it('should handle code review rate limits', () => {
      const response = {
        code_review_rate_limit: {
          primary_window: {
            used_percent: 80,
            reset_after_seconds: 1800,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows).toHaveLength(1);
      expect(windows[0].label).toBe('Code Review (Primary)');
      expect(windows[0].usedPercent).toBe(80);
    });

    it('should clamp usedPercent to 0-100 range', () => {
      const response = {
        rate_limit: {
          primary_window: {
            used_percent: 150, // Over 100
            reset_after_seconds: null,
          },
          secondary_window: {
            used_percent: -20, // Negative
            reset_after_seconds: null,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows[0].usedPercent).toBe(100);
      expect(windows[0].remainingPercent).toBe(0);
      expect(windows[1].usedPercent).toBe(0);
      expect(windows[1].remainingPercent).toBe(100);
    });

    it('should handle null reset_after_seconds', () => {
      const response = {
        rate_limit: {
          primary_window: {
            used_percent: 10,
            reset_after_seconds: null,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows[0].resetAfterSeconds).toBeNull();
      expect(windows[0].resetAt).toBeNull();
    });

    it('should calculate resetAt from positive seconds', () => {
      const response = {
        rate_limit: {
          primary_window: {
            used_percent: 10,
            reset_after_seconds: 3600, // 1 hour
          },
        },
      };

      const before = Date.now();
      const windows = buildCodexQuotaWindows(response);
      const after = Date.now();

      expect(windows[0].resetAt).not.toBeNull();
      const resetTime = new Date(windows[0].resetAt!).getTime();
      expect(resetTime).toBeGreaterThanOrEqual(before + 3600000);
      expect(resetTime).toBeLessThanOrEqual(after + 3600000);
    });

    it('should not calculate resetAt for zero or negative seconds', () => {
      const response = {
        rate_limit: {
          primary_window: {
            used_percent: 10,
            reset_after_seconds: 0,
          },
          secondary_window: {
            used_percent: 20,
            reset_after_seconds: -100,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows[0].resetAt).toBeNull();
      expect(windows[1].resetAt).toBeNull();
    });

    it('should return empty array for empty response', () => {
      const windows = buildCodexQuotaWindows({});
      expect(windows).toHaveLength(0);
    });

    it('should return empty array for missing rate limit', () => {
      const response = {
        plan_type: 'plus',
      };

      const windows = buildCodexQuotaWindows(response);
      expect(windows).toHaveLength(0);
    });

    it('should handle missing window data gracefully', () => {
      const response = {
        rate_limit: {
          primary_window: undefined,
          secondary_window: null,
        },
      };

      const windows = buildCodexQuotaWindows(response as never);
      expect(windows).toHaveLength(0);
    });

    it('should default usedPercent to 0 when missing', () => {
      const response = {
        rate_limit: {
          primary_window: {
            reset_after_seconds: 3600,
          },
        },
      };

      const windows = buildCodexQuotaWindows(response);

      expect(windows[0].usedPercent).toBe(0);
      expect(windows[0].remainingPercent).toBe(100);
    });
  });

  describe('buildCodexCoreUsageSummary', () => {
    it('extracts 5h and weekly windows from labeled usage windows', () => {
      const windows = buildCodexQuotaWindows({
        rate_limit: {
          primary_window: {
            used_percent: 35,
            reset_after_seconds: 18000,
          },
          secondary_window: {
            used_percent: 60,
            reset_after_seconds: 604800,
          },
        },
      });

      const summary = buildCodexCoreUsageSummary(windows);

      expect(summary.fiveHour?.label).toBe('Primary');
      expect(summary.fiveHour?.remainingPercent).toBe(65);
      expect(summary.fiveHour?.resetAfterSeconds).toBe(18000);
      expect(summary.weekly?.label).toBe('Secondary');
      expect(summary.weekly?.remainingPercent).toBe(40);
      expect(summary.weekly?.resetAfterSeconds).toBe(604800);
    });

    it('falls back to shortest and longest reset windows when labels are unknown', () => {
      const windows = [
        {
          label: 'Window A',
          usedPercent: 20,
          remainingPercent: 80,
          resetAfterSeconds: 18000,
          resetAt: '2026-02-15T15:00:00Z',
        },
        {
          label: 'Window B',
          usedPercent: 45,
          remainingPercent: 55,
          resetAfterSeconds: 604800,
          resetAt: '2026-02-21T10:00:00Z',
        },
        {
          label: 'Code Review (Primary)',
          usedPercent: 10,
          remainingPercent: 90,
          resetAfterSeconds: 3600,
          resetAt: '2026-02-15T11:00:00Z',
        },
      ];

      const summary = buildCodexCoreUsageSummary(windows);

      expect(summary.fiveHour?.label).toBe('Window A');
      expect(summary.fiveHour?.resetAfterSeconds).toBe(18000);
      expect(summary.weekly?.label).toBe('Window B');
      expect(summary.weekly?.resetAfterSeconds).toBe(604800);
    });

    it('returns null summaries when no windows are available', () => {
      const summary = buildCodexCoreUsageSummary([]);
      expect(summary.fiveHour).toBeNull();
      expect(summary.weekly).toBeNull();
    });
  });

  describe('getUnknownCodexWindowLabels', () => {
    it('returns unknown labels and de-duplicates them', () => {
      const labels = getUnknownCodexWindowLabels([
        {
          label: 'Window A',
          usedPercent: 1,
          remainingPercent: 99,
          resetAfterSeconds: 10,
          resetAt: null,
        },
        {
          label: 'Window A',
          usedPercent: 2,
          remainingPercent: 98,
          resetAfterSeconds: 20,
          resetAt: null,
        },
        {
          label: 'Primary',
          usedPercent: 3,
          remainingPercent: 97,
          resetAfterSeconds: 30,
          resetAt: null,
        },
      ]);

      expect(labels).toEqual(['Window A']);
    });

    it('returns empty array when all labels are recognized', () => {
      const labels = getUnknownCodexWindowLabels([
        {
          label: 'Primary',
          usedPercent: 10,
          remainingPercent: 90,
          resetAfterSeconds: 100,
          resetAt: null,
        },
        {
          label: 'Code Review (Secondary)',
          usedPercent: 20,
          remainingPercent: 80,
          resetAfterSeconds: 200,
          resetAt: null,
        },
      ]);

      expect(labels).toEqual([]);
    });
  });

  describe('fetchCodexQuota failure mapping', () => {
    function createValidCodexAccount(email: string, accountId = `workspace-${email}`): void {
      createCodexAccount(email, {
        access_token: 'test-token',
        account_id: accountId,
        expired: '2099-01-01T00:00:00.000Z',
        email,
        type: 'codex',
      });
    }

    it('maps deactivated workspace 402 responses to structured metadata', async () => {
      createValidCodexAccount('workspace@example.com', 'workspace-123');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: { code: 'deactivated_workspace' } }), {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('workspace@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(402);
      expect(result.errorCode).toBe('deactivated_workspace');
      expect(result.error).toContain('Workspace deactivated');
      expect(result.actionHint).toContain('active ChatGPT workspace');
      expect(result.retryable).toBe(false);
    });

    it('maps 401 responses to reauth-required metadata', async () => {
      createValidCodexAccount('reauth@example.com', 'workspace-reauth');

      global.fetch = mock(() => Promise.resolve(new Response('', { status: 401 }))) as typeof fetch;

      const result = await fetchCodexQuota('reauth@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.errorCode).toBe('reauth_required');
      expect(result.needsReauth).toBe(true);
      expect(result.actionHint).toContain('ccs cliproxy auth codex');
    });

    it('uses the registry token file for duplicate-email Codex accounts', async () => {
      createValidCodexAccount(
        'kaidu.kd@gmail.com',
        'workspace-team',
        'codex-04a0f049-kaidu.kd@gmail.com-team.json'
      );
      createValidCodexAccount(
        'kaidu.kd@gmail.com',
        'workspace-free',
        'codex-kaidu.kd@gmail.com-free.json'
      );

      registerAccount(
        'codex',
        'codex-04a0f049-kaidu.kd@gmail.com-team.json',
        'kaidu.kd@gmail.com'
      );
      const freeAccount = registerAccount(
        'codex',
        'codex-kaidu.kd@gmail.com-free.json',
        'kaidu.kd@gmail.com'
      );

      const fetchSpy = mock((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              plan_type: 'free',
              rate_limit: {
                primary_window: { used_percent: 10, reset_after_seconds: 3600 },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      ) as typeof fetch;
      global.fetch = fetchSpy;

      const result = await fetchCodexQuota(freeAccount.id);
      const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      const headers = new Headers(requestInit?.headers);

      expect(result.success).toBe(true);
      expect(headers.get('ChatGPT-Account-Id')).toBe('workspace-free');
    });

    it('maps 403 responses to forbidden metadata', async () => {
      createValidCodexAccount('forbidden@example.com', 'workspace-forbidden');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: { code: 'quota_api_forbidden' } }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('forbidden@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(403);
      expect(result.errorCode).toBe('quota_api_forbidden');
      expect(result.isForbidden).toBe(true);
      expect(result.retryable).toBe(false);
    });

    it('maps 429 responses to retryable rate-limit metadata', async () => {
      createValidCodexAccount('rate-limit@example.com', 'workspace-rate-limit');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: { code: 'rate_limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('rate-limit@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(429);
      expect(result.errorCode).toBe('rate_limited');
      expect(result.retryable).toBe(true);
      expect(result.actionHint).toContain('Retry');
    });

    it('maps 5xx responses to retryable provider-unavailable metadata', async () => {
      createValidCodexAccount('outage@example.com', 'workspace-outage');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: { code: 'upstream_failure' } }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('outage@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(503);
      expect(result.errorCode).toBe('upstream_failure');
      expect(result.retryable).toBe(true);
      expect(result.error).toContain('service unavailable');
    });

    it('maps unknown upstream statuses to a non-retryable structured error', async () => {
      createValidCodexAccount('teapot@example.com', 'workspace-teapot');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response('{"message":"Strange upstream response"}', {
            status: 418,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('teapot@example.com');

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(418);
      expect(result.errorCode).toBe('unknown_upstream_error');
      expect(result.retryable).toBe(false);
      expect(result.error).toBe('Strange upstream response');
    });

    it('sanitizes and truncates raw upstream error detail before returning it', async () => {
      createValidCodexAccount('sanitized@example.com', 'workspace-sanitized');
      const leakedToken = 'secret-token-value-123';
      const oversizedMessage = 'x'.repeat(400);

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: 'Upstream failure',
              access_token: leakedToken,
              extra: oversizedMessage,
            }),
            {
              status: 418,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('sanitized@example.com');

      expect(result.success).toBe(false);
      expect(result.errorDetail).toBeDefined();
      expect(result.errorDetail).not.toContain(leakedToken);
      expect(result.errorDetail).toContain('[redacted]');
      expect(result.errorDetail?.endsWith('...[truncated]')).toBe(true);
    });

    it('omits raw HTML upstream bodies from the returned error detail', async () => {
      createValidCodexAccount('html@example.com', 'workspace-html');

      global.fetch = mock(() =>
        Promise.resolve(
          new Response('<html><body>bad gateway</body></html>', {
            status: 503,
            headers: { 'Content-Type': 'text/html' },
          })
        )
      ) as typeof fetch;

      const result = await fetchCodexQuota('html@example.com');

      expect(result.success).toBe(false);
      expect(result.errorDetail).toBe('[HTML error response omitted]');
    });
  });
});
