import { expect, it } from 'bun:test';
import express from 'express';
import type { Server } from 'node:http';
import type { QuotaResult } from '../../../src/cliproxy/quota/quota-fetcher';
import type { ClaudeQuotaResult } from '../../../src/cliproxy/quota/quota-types';
import { clearQuotaCache, getCachedQuota } from '../../../src/cliproxy/quota/quota-response-cache';
import {
  createBarPoolAccountQuotaFetcher,
  getCachedBarPoolAccountQuota,
  invalidateCachedBarPoolAccountQuota,
  setCachedBarPoolAccountQuota,
} from '../../../src/web-server/routes/bar-pool-account-quota-adapter';
import {
  createBarRouter,
  resetForceFreshDebounce,
} from '../../../src/web-server/routes/bar-routes';

it('stores normalized Claude quota in the existing Bar cache', async () => {
  clearQuotaCache();
  let fetchCount = 0;
  const fetchQuota = createBarPoolAccountQuotaFetcher({
    fetchLegacyAccountQuota: async () => {
      throw new Error('Legacy fetcher should not be called');
    },
    fetchClaudeQuota: async () => {
      fetchCount += 1;
      return {
        success: true,
        windows: [
          {
            rateLimitType: 'five_hour',
            label: '5h usage limit',
            status: 'allowed',
            utilization: 0.28,
            usedPercent: 28,
            remainingPercent: 72,
            resetAt: '2026-07-18T16:00:00.000Z',
          },
          {
            rateLimitType: 'seven_day',
            label: 'Weekly usage limit',
            status: 'allowed_warning',
            utilization: 0.55,
            usedPercent: 55,
            remainingPercent: 45,
            resetAt: '2026-07-21T12:00:00.000Z',
          },
        ],
        coreUsage: {
          fiveHour: {
            rateLimitType: 'five_hour',
            label: '5h usage limit',
            remainingPercent: 72,
            resetAt: '2026-07-18T16:00:00.000Z',
            status: 'allowed',
          },
          weekly: {
            rateLimitType: 'seven_day',
            label: 'Weekly usage limit',
            remainingPercent: 45,
            resetAt: '2026-07-21T12:00:00.000Z',
            status: 'allowed_warning',
          },
        },
        lastUpdated: 2,
        accountId: 'claude@example.com',
      };
    },
    fetchCodexQuota: async () => {
      throw new Error('Codex fetcher should not be called');
    },
  });
  const app = express();
  app.use(
    '/api/bar',
    createBarRouter({
      getAllAccountsSummary: () =>
        ({
          claude: [
            {
              id: 'claude@example.com',
              provider: 'claude',
              nickname: 'Claude pool',
              paused: false,
              isDefault: true,
              tokenFile: 'claude-claude_example_com.json',
              createdAt: '2026-07-18T00:00:00.000Z',
            },
          ],
        }) as never,
      getCachedQuota: getCachedBarPoolAccountQuota,
      setCachedQuota: setCachedBarPoolAccountQuota,
      invalidateQuotaCache: invalidateCachedBarPoolAccountQuota,
      fetchAccountQuota: fetchQuota,
      getTodayCostByAccount: () => ({}),
      loadCliproxyDetails: async () => [],
      loadDailyUsage: async () => [],
      loadHourlyUsage: async () => [],
    })
  );

  resetForceFreshDebounce();
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1');
    instance.once('error', reject);
    instance.once('listening', () => resolve(instance));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    const url = `http://127.0.0.1:${address.port}/api/bar/summary`;
    const first = (await (await fetch(url)).json()) as Array<Record<string, unknown>>;
    const second = (await (await fetch(url)).json()) as Array<Record<string, unknown>>;

    expect(fetchCount).toBe(1);
    expect(first[0]).toMatchObject({
      quota_percentage: 45,
      next_reset: '2026-07-18T16:00:00.000Z',
      quotaStatus: 'ok',
      cached: false,
    });
    expect(second[0]).toMatchObject({
      quota_percentage: 45,
      next_reset: '2026-07-18T16:00:00.000Z',
      quotaStatus: 'ok',
      cached: true,
    });
    const sharedCache = getCachedQuota<ClaudeQuotaResult>('claude', 'claude@example.com');
    expect(sharedCache?.windows.map((window) => window.rateLimitType)).toEqual([
      'five_hour',
      'seven_day',
    ]);
    expect((sharedCache as ClaudeQuotaResult & Partial<QuotaResult>)?.models).toBeUndefined();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    clearQuotaCache();
  }
});
