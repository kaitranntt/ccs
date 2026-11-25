/**
 * GitHub Copilot (GHCP) Quota Fetcher Unit Tests
 *
 * Covers normalization and token extraction edge cases.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  normalizeGhcpSnapshot,
  extractGhcpAccessToken,
  fetchGhcpQuota,
} from '../quota-fetcher-ghcp';

let tmpDir: string;
let originalCcsHome: string | undefined;
let originalFetch: typeof fetch;

function createGhcpAccount(
  accountId: string,
  tokenPayload: Record<string, unknown>,
  tokenFile = `${accountId}.json`
): void {
  const cliproxyDir = path.join(tmpDir, '.ccs', 'cliproxy');
  const authDir = path.join(cliproxyDir, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  fs.writeFileSync(path.join(authDir, tokenFile), JSON.stringify(tokenPayload));
  fs.writeFileSync(
    path.join(cliproxyDir, 'accounts.json'),
    JSON.stringify(
      {
        version: 1,
        providers: {
          ghcp: {
            default: accountId,
            accounts: {
              [accountId]: {
                nickname: accountId,
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-ghcp-quota-test-'));
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

describe('GHCP Quota Fetcher', () => {
  describe('normalizeGhcpSnapshot', () => {
    it('handles missing/undefined raw data', () => {
      const snapshot = normalizeGhcpSnapshot();

      expect(snapshot).toEqual({
        reported: false,
        entitlement: 0,
        remaining: 0,
        used: 0,
        percentRemaining: 0,
        percentUsed: 100,
        unlimited: false,
        overageCount: 0,
        overagePermitted: false,
        quotaId: null,
      });
    });

    it('marks upstream-provided snapshots as reported', () => {
      const snapshot = normalizeGhcpSnapshot({
        entitlement: 100,
        remaining: 80,
      });

      expect(snapshot.reported).toBe(true);
    });

    it('treats unknown upstream snapshot objects as unreported', () => {
      const empty = normalizeGhcpSnapshot({});
      const quotaIdOnly = normalizeGhcpSnapshot({ quota_id: 'chat' });
      const remainingOnly = normalizeGhcpSnapshot({ remaining: 80 });

      for (const snapshot of [empty, quotaIdOnly, remainingOnly]) {
        expect(snapshot.reported).toBe(false);
        expect(snapshot.percentRemaining).toBe(0);
        expect(snapshot.percentUsed).toBe(100);
      }
    });

    it('marks percent-only snapshots as reported', () => {
      const snapshot = normalizeGhcpSnapshot({
        percent_remaining: 70,
      });

      expect(snapshot.reported).toBe(true);
      expect(snapshot.percentRemaining).toBe(70);
      expect(snapshot.percentUsed).toBe(30);
    });

    it('treats unlimited snapshots as 100% remaining', () => {
      const snapshot = normalizeGhcpSnapshot({
        unlimited: true,
        entitlement: 0,
        remaining: 0,
      });

      expect(snapshot.reported).toBe(true);
      expect(snapshot.percentRemaining).toBe(100);
      expect(snapshot.percentUsed).toBe(0);
      expect(snapshot.unlimited).toBe(true);
    });

    it('clamps percent_remaining to 0-100 range', () => {
      const above = normalizeGhcpSnapshot({
        entitlement: 100,
        remaining: 80,
        percent_remaining: 140,
      });
      const below = normalizeGhcpSnapshot({
        entitlement: 100,
        remaining: 80,
        percent_remaining: -15,
      });

      expect(above.percentRemaining).toBe(100);
      expect(above.percentUsed).toBe(0);
      expect(below.percentRemaining).toBe(0);
      expect(below.percentUsed).toBe(100);
    });

    it('calculates percentRemaining when API does not provide it', () => {
      const snapshot = normalizeGhcpSnapshot({
        entitlement: 80,
        remaining: 20,
      });

      expect(snapshot.entitlement).toBe(80);
      expect(snapshot.remaining).toBe(20);
      expect(snapshot.used).toBe(60);
      expect(snapshot.percentRemaining).toBe(25);
      expect(snapshot.percentUsed).toBe(75);
    });

    it('handles non-finite entitlement values safely', () => {
      const snapshot = normalizeGhcpSnapshot({
        entitlement: Number.POSITIVE_INFINITY,
        remaining: 25,
      });

      expect(snapshot.entitlement).toBe(0);
      expect(snapshot.remaining).toBe(25);
      expect(snapshot.used).toBe(0);
      expect(snapshot.percentRemaining).toBe(0);
      expect(snapshot.percentUsed).toBe(100);
    });
  });

  describe('extractGhcpAccessToken', () => {
    it('extracts from top-level access_token', () => {
      const token = extractGhcpAccessToken({
        access_token: '  top-level-token  ',
      });
      expect(token).toBe('top-level-token');
    });

    it('extracts from nested token.access_token', () => {
      const token = extractGhcpAccessToken({
        token: {
          access_token: 'nested-token',
        },
      });
      expect(token).toBe('nested-token');
    });

    it('returns null for empty/whitespace tokens', () => {
      const emptyTopLevel = extractGhcpAccessToken({ access_token: '   ' });
      const emptyNested = extractGhcpAccessToken({
        token: { access_token: '   ' },
      });

      expect(emptyTopLevel).toBeNull();
      expect(emptyNested).toBeNull();
    });
  });

  describe('fetchGhcpQuota', () => {
    it('fetches and normalizes quota for a valid account token', async () => {
      createGhcpAccount('ghcp-main', { access_token: 'top-level-token' });

      global.fetch = mock((url: string, options?: RequestInit) => {
        expect(url).toBe('https://api.github.com/copilot_internal/user');
        expect(options?.method).toBe('GET');
        expect(options?.headers).toEqual({
          Accept: 'application/json',
          Authorization: 'token top-level-token',
          'User-Agent': 'GitHubCopilotChat/0.26.7',
          'x-github-api-version': '2025-04-01',
        });

        return Promise.resolve(
          new Response(
            JSON.stringify({
              copilot_plan: 'business',
              quota_reset_date: '2026-02-28T00:00:00Z',
              quota_snapshots: {
                premium_interactions: { entitlement: 1000, remaining: 900 },
                chat: { entitlement: 500, remaining: 100, percent_remaining: 20 },
                completions: { entitlement: 250, remaining: 125 },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }) as unknown as typeof fetch;

      const result = await fetchGhcpQuota('ghcp-main');

      expect(result.success).toBe(true);
      expect(result.accountId).toBe('ghcp-main');
      expect(result.planType).toBe('business');
      expect(result.quotaResetDate).toBe('2026-02-28T00:00:00Z');
      expect(result.snapshots.premiumInteractions.percentRemaining).toBe(90);
      expect(result.snapshots.chat.percentRemaining).toBe(20);
      expect(result.snapshots.completions.percentRemaining).toBe(50);
    });

    it('returns needsReauth on 401/403 responses', async () => {
      createGhcpAccount('ghcp-auth', { access_token: 'token-auth' });

      global.fetch = mock(() =>
        Promise.resolve(new Response('', { status: 401 }))
      ) as unknown as typeof fetch;

      const result = await fetchGhcpQuota('ghcp-auth');

      expect(result.success).toBe(false);
      expect(result.needsReauth).toBe(true);
      expect(result.error).toBe('Authentication expired or invalid');
    });

    it('fails fast when token file has no valid access token', async () => {
      createGhcpAccount('ghcp-missing-token', { access_token: '   ' });
      const fetchMock = mock(() => Promise.resolve(new Response('', { status: 200 })));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchGhcpQuota('ghcp-missing-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No access token in auth file');
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });
  });
});
