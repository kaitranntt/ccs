import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildClaudeCoreUsageSummary,
  buildClaudeQuotaWindows,
} from '../quota-fetcher-claude-normalizer';
import {
  buildStaleClaudeResult,
  readClaudeProbeState,
  writeClaudeProbeState,
} from '../quota-fetcher-claude-probe-state';
import type { ClaudeQuotaResult } from '../quota-types';
import { createBarPoolAccountQuotaFetcher } from '../../../web-server/routes/bar-pool-account-quota-adapter';
import { getClaudeCoreUsageWindows } from '../../../commands/cliproxy/quota-subcommand/claude-window-helpers';

const now = Date.parse('2026-10-31T12:00:00Z');
function result(payload: Record<string, unknown>): ClaudeQuotaResult {
  const windows = buildClaudeQuotaWindows(payload);
  return {
    success: true,
    windows,
    coreUsage: buildClaudeCoreUsageSummary(windows),
    lastUpdated: now,
  };
}
function scoped(percent: unknown, name = 'Fable', resets_at?: unknown) {
  return { kind: 'weekly_scoped', percent, resets_at, scope: { model: { display_name: name } } };
}

describe('optional Claude quota windows', () => {
  for (let mask = 0; mask < 8; mask++) {
    for (const reset of [null, undefined]) {
      it(`preserves H/W/F subset ${mask} with reset ${String(reset)}`, async () => {
        const quota = result({
          ...(mask & 1 ? { five_hour: { utilization: 20, resets_at: reset } } : {}),
          ...(mask & 2 ? { seven_day: { utilization: 30, resets_at: reset } } : {}),
          ...(mask & 4 ? { limits: [scoped(100)] } : {}),
        });
        expect(quota.windows.length).toBe(
          Number(!!(mask & 1)) + Number(!!(mask & 2)) + Number(!!(mask & 4))
        );
        expect(quota.coreUsage?.fiveHour?.remainingPercent ?? null).toBe(mask & 1 ? 80 : null);
        expect(quota.coreUsage?.weekly?.remainingPercent ?? null).toBe(mask & 2 ? 70 : null);
        expect(quota.windows.every((window) => window.resetAt === null)).toBe(true);
        const cli = getClaudeCoreUsageWindows(quota);
        expect(cli.fiveHourWindow?.remainingPercent ?? null).toBe(mask & 1 ? 80 : null);
        expect(cli.weeklyWindow?.remainingPercent ?? null).toBe(mask & 2 ? 70 : null);
        const fetcher = createBarPoolAccountQuotaFetcher({
          fetchClaudeQuota: async () => quota,
          fetchCodexQuota: async () => {
            throw new Error('unexpected Codex fetch');
          },
          fetchLegacyAccountQuota: async () => {
            throw new Error('unexpected legacy fetch');
          },
        });
        const bar = await fetcher('claude', 'fixture');
        expect(bar.success).toBe(true);
        expect(bar.models[0]?.percentage ?? null).toBe(mask & 2 ? 70 : mask & 1 ? 80 : null);
      });
    }
  }
  for (const value of [0, 1, 100]) {
    it(`keeps percent boundary ${value} without a unit heuristic`, () => {
      expect(
        result({ five_hour: { utilization: value }, limits: [scoped(value)] }).windows.map(
          (w) => w.usedPercent
        )
      ).toEqual([value, value]);
    });
  }
  for (const invalid of [null, undefined, '', ' ', 'invalid', true, NaN, Infinity, -1, 101]) {
    it(`omits invalid OAuth metrics ${String(invalid)}`, () => {
      expect(
        result({ five_hour: { utilization: invalid }, limits: [scoped(invalid)] }).windows
      ).toEqual([]);
    });
  }
  it('omits metrics-free restrictions and retains explicit percent fields', () => {
    expect(
      result({ restrictions: [{ rateLimitType: 'five_hour', status: 'allowed' }] }).windows
    ).toEqual([]);
    expect(
      result({ restrictions: [{ rateLimitType: 'five_hour', utilization: 1 }] }).windows[0]
        .usedPercent
    ).toBe(100);
    expect(result({ seven_day_fable: { used_percentage: 1 } }).windows[0].usedPercent).toBe(1);
  });
  it('deduplicates modern models and legacy aliases by scope/cadence/model', () => {
    const quota = result({
      limits: [scoped(13, ' Fable ', 1793448000), scoped(99, 'fable'), scoped(41, 'Opus')],
      fable_weekly: { utilization: 100 },
      fable_seven_day: { utilization: 80 },
      seven_day_fable: { utilization: 70 },
      seven_day_opus: { utilization: 100 },
      seven_day: { utilization: 30 },
    });
    expect(quota.windows).toHaveLength(3);
    const fable = quota.windows.find((w) => w.modelLabel === 'Fable');
    expect(fable?.usedPercent).toBe(13);
    expect(fable?.resetAt).toBe(new Date(1793448000 * 1000).toISOString());
    expect(quota.windows.find((w) => w.modelLabel === 'Opus')?.usedPercent).toBe(41);
    expect(quota.coreUsage?.weekly?.remainingPercent).toBe(70);
  });
  for (const alias of ['fable_weekly', 'fable_seven_day', 'seven_day_fable']) {
    it(`falls back to ${alias} when the modern metric is invalid`, () => {
      const quota = result({ limits: [scoped(101)], [alias]: { utilization: 25 } });
      expect(quota.windows).toHaveLength(1);
      expect(quota.windows[0]).toMatchObject({
        scope: 'model',
        cadence: 'weekly',
        modelLabel: 'Fable',
        usedPercent: 25,
      });
      expect(quota.coreUsage).toEqual({ fiveHour: null, weekly: null });
    });
  }
  it('never promotes unknown codes or reset times into account slots', () => {
    const quota = result({
      limits: [{ kind: 'future', percent: 100 }],
      future_limit: { utilization: 100, resets_at: '2026-11-01T00:00:00Z' },
      seven_day_haiku: { utilization: 100 },
    });
    expect(quota.windows.every((w) => w.scope === 'unknown')).toBe(true);
    expect(quota.coreUsage).toEqual({ fiveHour: null, weekly: null });
  });
  it('ignores an older model-collapsed core summary in CLI and bar', async () => {
    const quota = result({ fable_weekly: { utilization: 100 } });
    quota.coreUsage = { fiveHour: null, weekly: { ...quota.windows[0] } };
    expect(getClaudeCoreUsageWindows(quota)).toEqual({ fiveHourWindow: null, weeklyWindow: null });
    const fetcher = createBarPoolAccountQuotaFetcher({
      fetchClaudeQuota: async () => quota,
      fetchCodexQuota: async () => {
        throw new Error('unexpected');
      },
      fetchLegacyAccountQuota: async () => {
        throw new Error('unexpected');
      },
    });
    expect((await fetcher('claude', 'fixture')).models).toEqual([]);
  });
});

describe('Claude normalization cache migration', () => {
  let home: string;
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.CCS_HOME;
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-scoped-cache-'));
    process.env.CCS_HOME = home;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  for (const normalizationVersion of [undefined, 1, 2, 3, 5]) {
    it(`discards lastGood version ${String(normalizationVersion)} without clearing cooldown`, () => {
      const dir = path.join(home, '.ccs/cache/claude-quota');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'fixture.json'),
        JSON.stringify({
          version: 1,
          normalizationVersion,
          lastGood: result({ five_hour: { utilization: 20 } }),
          consecutive429: 4,
          cooldownUntil: now + 120000,
        })
      );
      const state = readClaudeProbeState('fixture');
      expect(state).toMatchObject({
        version: 1,
        normalizationVersion: 4,
        lastGood: null,
        consecutive429: 4,
        cooldownUntil: now + 120000,
      });
      writeClaudeProbeState('fixture', { ...state, normalizationVersion: 1 });
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'))).toMatchObject({
        normalizationVersion: 4,
        consecutive429: 4,
        cooldownUntil: now + 120000,
      });
    });
  }
  it('roundtrips current state and preserves optional reset-less model rows when stale', () => {
    const quota = result({
      five_hour: { utilization: 10, resets_at: '2026-10-31T12:01:00Z' },
      limits: [scoped(100)],
    });
    writeClaudeProbeState('fixture', {
      version: 1,
      lastGood: quota,
      consecutive429: 2,
      cooldownUntil: now + 240000,
    });
    expect(readClaudeProbeState('fixture').lastGood).toEqual(quota);
    const stale = buildStaleClaudeResult(quota, now + 120000);
    expect(stale?.stale).toBe(true);
    expect(stale?.windows).toHaveLength(1);
    expect(stale?.coreUsage).toEqual({ fiveHour: null, weekly: null });
    expect(buildStaleClaudeResult(quota, now + 7 * 3600000)).toBeNull();
  });
  it('keeps organization variants of the same email in separate probe caches', () => {
    const first = result({ five_hour: { utilization: 10 } });
    const second = result({ five_hour: { utilization: 70 } });
    writeClaudeProbeState('fixture@example.com#a1b2c3d4', {
      version: 1,
      lastGood: first,
      consecutive429: 3,
      cooldownUntil: now + 120000,
    });
    writeClaudeProbeState('fixture@example.com#f0e1d2c3', {
      version: 1,
      lastGood: second,
      consecutive429: 0,
      cooldownUntil: 0,
    });
    expect(readClaudeProbeState('fixture@example.com#a1b2c3d4')).toMatchObject({
      lastGood: { windows: [{ remainingPercent: 90 }] },
      consecutive429: 3,
      cooldownUntil: now + 120000,
    });
    expect(readClaudeProbeState('fixture@example.com#f0e1d2c3')).toMatchObject({
      lastGood: { windows: [{ remainingPercent: 30 }] },
      consecutive429: 0,
      cooldownUntil: 0,
    });
  });
});
