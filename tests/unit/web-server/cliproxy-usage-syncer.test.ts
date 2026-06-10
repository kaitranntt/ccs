import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  CliproxyUsageApiResponse,
  CliproxyManagementAuthFile,
} from '../../../src/cliproxy/services/stats-fetcher';
import { runWithScopedConfigDir } from '../../../src/utils/config-manager';
import {
  loadCachedCliproxyData,
  startCliproxySync,
  stopCliproxySync,
  syncCliproxyUsage,
} from '../../../src/web-server/usage/cliproxy-usage-syncer';

let ccsDir = '';
let rawResponse: CliproxyUsageApiResponse | null = null;
let fetchCalls = 0;

function fetchRawResponse(): Promise<CliproxyUsageApiResponse | null> {
  fetchCalls++;
  return Promise.resolve(rawResponse);
}

function buildResponse(
  inputTokens: number,
  timestamp = '2026-03-02T12:00:00.000Z'
): CliproxyUsageApiResponse {
  return {
    usage: {
      apis: {
        gemini: {
          models: {
            'gemini-2.5-pro': {
              details: [
                {
                  timestamp,
                  source: 'account-a',
                  auth_index: 0,
                  tokens: {
                    input_tokens: inputTokens,
                    output_tokens: 20,
                    reasoning_tokens: 0,
                    cached_tokens: 10,
                    total_tokens: inputTokens + 30,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    },
  };
}

function createDeferredFetch(response: CliproxyUsageApiResponse | null) {
  let resolveFetch: ((value: CliproxyUsageApiResponse | null) => void) | undefined;
  return {
    fetch: () =>
      new Promise<CliproxyUsageApiResponse | null>((resolve) => {
        fetchCalls++;
        resolveFetch = resolve;
      }),
    resolve: () => resolveFetch?.(response),
  };
}

beforeEach(() => {
  ccsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-syncer-'));
  fetchCalls = 0;
  rawResponse = {
    usage: {
      apis: {
        gemini: {
          models: {
            'gemini-2.5-pro': {
              details: [
                {
                  timestamp: '2026-03-02T12:00:00.000Z',
                  source: 'account-a',
                  auth_index: 0,
                  tokens: {
                    input_tokens: 100,
                    output_tokens: 20,
                    reasoning_tokens: 0,
                    cached_tokens: 10,
                    total_tokens: 130,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    },
  };
  stopCliproxySync();
});

afterEach(() => {
  stopCliproxySync();
  fs.rmSync(ccsDir, { recursive: true, force: true });
});

describe('cliproxy usage syncer', () => {
  it('writes and loads snapshot data', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      await syncCliproxyUsage(fetchRawResponse);
    });

    const snapshotPath = path.join(ccsDir, 'cache', 'cliproxy-usage', 'latest.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
      details: Array<Record<string, unknown>>;
    };
    expect(snapshot.details[0]).not.toHaveProperty('source');
    expect(snapshot.details[0]).not.toHaveProperty('authIndex');

    if (process.platform !== 'win32') {
      const cacheDir = path.join(ccsDir, 'cache');
      const cliproxyCacheDir = path.dirname(snapshotPath);
      expect(fs.statSync(ccsDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(cacheDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(cliproxyCacheDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(snapshotPath).mode & 0o777).toBe(0o600);
    }

    const cached = await runWithScopedConfigDir(ccsDir, async () => {
      return await loadCachedCliproxyData();
    });
    expect(cached.daily).toHaveLength(1);
    expect(cached.daily[0].source).toBe('cliproxy');
    expect(cached.daily[0].inputTokens).toBe(100);
    expect(cached.hourly).toHaveLength(1);
    expect(cached.monthly).toHaveLength(1);
  });

  it('startCliproxySync is idempotent and starts only one interval', async () => {
    const intervalSpy = spyOn(globalThis, 'setInterval');

    await runWithScopedConfigDir(ccsDir, async () => {
      const syncNow = () => syncCliproxyUsage(fetchRawResponse);
      startCliproxySync(syncNow);
      startCliproxySync(syncNow);
    });

    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toBeGreaterThan(0);

    stopCliproxySync();
    intervalSpy.mockRestore();
  });

  it('keeps stale cached snapshots available for historical analytics reads', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      await syncCliproxyUsage(fetchRawResponse);

      const snapshotPath = path.join(ccsDir, 'cache', 'cliproxy-usage', 'latest.json');
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
        timestamp: number;
      };

      snapshot.timestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf-8');

      const cached = await loadCachedCliproxyData();
      expect(cached.daily).toHaveLength(1);
      expect(cached.hourly).toHaveLength(1);
      expect(cached.monthly).toHaveLength(1);
    });
  });

  it('merges unique history from overlapping syncs even when the older sync finishes last', async () => {
    const olderSync = createDeferredFetch(buildResponse(100, '2026-03-01T10:00:00.000Z'));
    const newerSync = createDeferredFetch(buildResponse(200, '2026-03-02T11:00:00.000Z'));

    await runWithScopedConfigDir(ccsDir, async () => {
      const olderWrite = syncCliproxyUsage(olderSync.fetch);
      const newerWrite = syncCliproxyUsage(newerSync.fetch);

      newerSync.resolve();
      await Promise.resolve();
      olderSync.resolve();

      await Promise.all([olderWrite, newerWrite]);

      const cached = await loadCachedCliproxyData();
      expect(cached.daily).toHaveLength(2);
      expect(cached.daily.find((entry) => entry.date === '2026-03-01')?.inputTokens).toBe(100);
      expect(cached.daily[0].inputTokens).toBe(200);
    });
  });

  it('normalizes old v3 snapshot details before loading and merging history', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      const snapshotPath = path.join(ccsDir, 'cache', 'cliproxy-usage', 'latest.json');
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify({
          version: 3,
          timestamp: Date.now() - 60_000,
          details: [
            {
              model: 'gemini-2.5-pro',
              timestamp: '2026-03-02T12:00:00.000Z',
              source: 'account-a',
              authIndex: '0',
              inputTokens: 100,
              outputTokens: 20,
              cacheReadTokens: 10,
              failed: false,
            },
          ],
          daily: [
            {
              date: '2026-03-02',
              source: 'cliproxy',
              inputTokens: 100,
              outputTokens: 20,
              cacheCreationTokens: 0,
              cacheReadTokens: 10,
              cost: null,
              totalCost: null,
              modelsUsed: ['gemini-2.5-pro'],
              modelBreakdowns: [],
            },
          ],
          hourly: [],
          monthly: [],
        }),
        'utf-8'
      );

      const loaded = await loadCachedCliproxyData();
      expect(loaded.daily[0].inputTokens).toBe(100);
      expect(Number.isFinite(loaded.daily[0].totalCost)).toBe(true);
      expect(loaded.hourly[0].requestCount).toBe(1);

      await syncCliproxyUsage(fetchRawResponse);

      const cached = await loadCachedCliproxyData();
      expect(cached.daily).toHaveLength(1);
      expect(cached.daily[0].inputTokens).toBe(100);
      expect(cached.hourly[0].requestCount).toBe(1);

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
        details: Array<{ requestCount?: number; cost?: number; provider?: string }>;
      };
      expect(snapshot.details).toHaveLength(1);
      expect(snapshot.details[0].requestCount).toBe(1);
      expect(Number.isFinite(snapshot.details[0].cost)).toBe(true);
      expect(snapshot.details[0].provider).toBe('google');
    });
  });

  it('migrates legacy v1 and v2 snapshots forward before merging new history', async () => {
    for (const version of [1, 2]) {
      await runWithScopedConfigDir(ccsDir, async () => {
        const snapshotPath = path.join(ccsDir, 'cache', 'cliproxy-usage', 'latest.json');
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(
          snapshotPath,
          JSON.stringify({
            version,
            timestamp: Date.now() - 60_000,
            daily: [
              {
                date: '2026-03-01',
                source: 'cliproxy',
                inputTokens: 100,
                outputTokens: 20,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                cost: 0.2,
                totalCost: 0.2,
                modelsUsed: ['gemini-2.5-pro'],
                modelBreakdowns: [
                  {
                    modelName: 'gemini-2.5-pro',
                    inputTokens: 100,
                    outputTokens: 20,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 10,
                    cost: 0.2,
                  },
                ],
              },
            ],
            hourly: [
              {
                hour: '2026-03-01 12:00',
                source: 'cliproxy',
                requestCount: 7,
                inputTokens: 100,
                outputTokens: 20,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                cost: 0.2,
                totalCost: 0.2,
                modelsUsed: ['gemini-2.5-pro'],
                modelBreakdowns: [
                  {
                    modelName: 'gemini-2.5-pro',
                    inputTokens: 100,
                    outputTokens: 20,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 10,
                    cost: 0.2,
                  },
                ],
              },
            ],
            monthly: [
              {
                month: '2026-03',
                source: 'cliproxy',
                inputTokens: 100,
                outputTokens: 20,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                totalCost: 0.2,
                modelsUsed: ['gemini-2.5-pro'],
                modelBreakdowns: [
                  {
                    modelName: 'gemini-2.5-pro',
                    inputTokens: 100,
                    outputTokens: 20,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 10,
                    cost: 0.2,
                  },
                ],
              },
            ],
          }),
          'utf-8'
        );

        await syncCliproxyUsage(() =>
          Promise.resolve(buildResponse(200, '2026-03-02T12:00:00.000Z'))
        );

        const cached = await loadCachedCliproxyData();
        expect(cached.daily.map((entry) => entry.date)).toEqual(['2026-03-02', '2026-03-01']);
        expect(cached.hourly.find((entry) => entry.hour === '2026-03-01 12:00')?.requestCount).toBe(
          7
        );
      });
    }
  });

  it('prunes history details older than the configured retention window', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      await syncCliproxyUsage(() =>
        Promise.resolve(buildResponse(100, '2024-01-01T12:00:00.000Z'))
      );
      await syncCliproxyUsage(() => Promise.resolve(buildResponse(200, new Date().toISOString())));

      const cached = await loadCachedCliproxyData();
      expect(cached.daily.some((entry) => entry.date === '2024-01-01')).toBe(false);
    });
  });

  it('preserves prior-day history when a later sync only returns the current window', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      await syncCliproxyUsage(() =>
        Promise.resolve(buildResponse(100, '2026-03-01T12:00:00.000Z'))
      );
      await syncCliproxyUsage(() =>
        Promise.resolve(buildResponse(200, '2026-03-02T12:00:00.000Z'))
      );

      const cached = await loadCachedCliproxyData();
      expect(cached.daily).toHaveLength(2);
      expect(cached.daily.map((entry) => entry.date)).toEqual(['2026-03-02', '2026-03-01']);
      expect(cached.daily.find((entry) => entry.date === '2026-03-01')?.inputTokens).toBe(100);
      expect(cached.daily.find((entry) => entry.date === '2026-03-02')?.inputTokens).toBe(200);
    });
  });

  it('does not double count when the same snapshot window is synced twice', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      const repeatedResponse = buildResponse(250, '2026-03-02T12:00:00.000Z');
      await syncCliproxyUsage(() => Promise.resolve(repeatedResponse));
      await syncCliproxyUsage(() => Promise.resolve(repeatedResponse));

      const cached = await loadCachedCliproxyData();
      expect(cached.daily).toHaveLength(1);
      expect(cached.daily[0].inputTokens).toBe(250);
      expect(cached.hourly[0].requestCount).toBe(1);
    });
  });
});

// ============================================================================
// Finding #3/#5: account attribution wired into syncer (accountMap passed to extractor)
// ============================================================================

describe('syncCliproxyUsage — account attribution (finding #3/#5)', () => {
  let ccsDir2 = '';

  beforeEach(() => {
    ccsDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-attr-'));
    stopCliproxySync();
  });

  afterEach(() => {
    stopCliproxySync();
    fs.rmSync(ccsDir2, { recursive: true, force: true });
  });

  const TODAY = new Date().toISOString().slice(0, 10);

  function buildResponseWithAuthIndex(authIndex: number): CliproxyUsageApiResponse {
    return {
      usage: {
        apis: {
          anthropic: {
            models: {
              'claude-sonnet-4-5': {
                details: [
                  {
                    timestamp: `${TODAY}T10:00:00.000Z`,
                    source: 'raw-source',
                    auth_index: authIndex,
                    tokens: {
                      input_tokens: 1000,
                      output_tokens: 500,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 1500,
                    },
                    failed: false,
                  },
                ],
              },
            },
          },
        },
      },
    };
  }

  it('persists accountId into snapshot when auth files are provided', async () => {
    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 0, provider: 'anthropic', email: 'alice@example.com' },
    ];

    await runWithScopedConfigDir(ccsDir2, async () => {
      await syncCliproxyUsage(
        () => Promise.resolve(buildResponseWithAuthIndex(0)),
        () => Promise.resolve(authFiles)
      );
    });

    const snapshotPath = path.join(ccsDir2, 'cache', 'cliproxy-usage', 'latest.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
      details: Array<{ accountId?: string }>;
    };

    expect(snapshot.details[0].accountId).toBe('alice@example.com');
  });

  it('falls back gracefully when auth-files fetch returns null (no throw, no accountId)', async () => {
    await runWithScopedConfigDir(ccsDir2, async () => {
      await syncCliproxyUsage(
        () => Promise.resolve(buildResponseWithAuthIndex(0)),
        () => Promise.resolve(null)
      );
    });

    const snapshotPath = path.join(ccsDir2, 'cache', 'cliproxy-usage', 'latest.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
      details: Array<{ accountId?: string }>;
    };
    // accountId must be absent (not populated) when auth files unavailable
    expect(snapshot.details[0].accountId).toBeUndefined();
  });

  it('falls back gracefully when auth-files fetch throws (no throw, no accountId)', async () => {
    await runWithScopedConfigDir(ccsDir2, async () => {
      await syncCliproxyUsage(
        () => Promise.resolve(buildResponseWithAuthIndex(0)),
        () => Promise.reject(new Error('network error'))
      );
    });

    const snapshotPath = path.join(ccsDir2, 'cache', 'cliproxy-usage', 'latest.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
      details: Array<{ accountId?: string }>;
    };
    expect(snapshot.details[0].accountId).toBeUndefined();
  });
});
