import { describe, expect, it } from 'bun:test';
import {
  buildClaudeCoreUsageSummary,
  buildClaudeQuotaWindows,
} from '../quota-fetcher-claude-normalizer';

const reset = '2026-11-07T12:00:00Z';
const credit = {
  utilization: 0,
  resets_at: reset,
  limit_dollars: 100,
  used_dollars: 0,
  remaining_dollars: 100,
  locked_reason: null,
};

describe('Claude modern general quota aliases', () => {
  for (let mask = 0; mask < 8; mask++) {
    it(`supports modern-only H/W/F subset ${mask}`, () => {
      const windows = buildClaudeQuotaWindows({
        limits: [
          ...(mask & 1 ? [{ kind: 'session', percent: 0, resets_at: null, scope: null }] : []),
          ...(mask & 2 ? [{ kind: 'weekly_all', percent: 18, resets_at: reset }] : []),
          ...(mask & 4
            ? [{ kind: 'weekly_scoped', percent: 100, scope: { model: { display_name: 'Fable' } } }]
            : []),
        ],
      });
      expect(windows).toHaveLength(
        Number(!!(mask & 1)) + Number(!!(mask & 2)) + Number(!!(mask & 4))
      );
      const core = buildClaudeCoreUsageSummary(windows);
      expect(core.fiveHour?.remainingPercent ?? null).toBe(mask & 1 ? 100 : null);
      expect(core.weekly?.remainingPercent ?? null).toBe(mask & 2 ? 82 : null);
      expect(windows.some((w) => w.modelLabel === 'Fable')).toBe(Boolean(mask & 4));
      expect(windows.every((w) => !['session', 'weekly_all'].includes(w.rateLimitType))).toBe(true);
    });
  }

  it('collapses actual mixed-format aliases and excludes a monetary codename', () => {
    const windows = buildClaudeQuotaWindows({
      five_hour: { utilization: 4, resets_at: reset },
      seven_day: { utilization: 18, resets_at: reset },
      iguana_necktie: credit,
      limits: [
        { kind: 'session', percent: 4, resets_at: reset, scope: null },
        { kind: 'weekly_all', percent: 18, resets_at: reset, scope: null },
      ],
    });
    expect(windows.map((w) => w.rateLimitType)).toEqual(['five_hour', 'seven_day']);
    expect(windows.map((w) => w.usedPercent)).toEqual([4, 18]);
  });

  it('prefers valid modern general entries including zero and null resets', () => {
    const windows = buildClaudeQuotaWindows({
      five_hour: { utilization: 99, resets_at: reset },
      seven_day: { utilization: 99, resets_at: reset },
      limits: [
        { kind: 'session', percent: 0, resets_at: null },
        { kind: 'weekly_all', percent: 0.5 },
      ],
    });
    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({
      rateLimitType: 'five_hour',
      scope: 'account',
      cadence: '5h',
      usedPercent: 0,
      resetAt: null,
    });
    expect(windows[1]).toMatchObject({
      rateLimitType: 'seven_day',
      scope: 'account',
      cadence: 'weekly',
      usedPercent: 0.5,
      resetAt: null,
    });
  });

  for (const invalid of [null, undefined, '', ' ', 'invalid', true, NaN, Infinity, -1, 101]) {
    it(`falls back to legacy general metrics for invalid modern ${String(invalid)}`, () => {
      const windows = buildClaudeQuotaWindows({
        five_hour: { utilization: 20 },
        seven_day: { utilization: 30 },
        limits: [
          { kind: 'session', percent: invalid },
          { kind: 'weekly_all', percent: invalid },
        ],
      });
      expect(windows.map((w) => [w.rateLimitType, w.usedPercent])).toEqual([
        ['five_hour', 20],
        ['seven_day', 30],
      ]);
    });
  }

  it('does not merge model limits merely because their percentages and resets match', () => {
    const windows = buildClaudeQuotaWindows({
      five_hour: { utilization: 100 },
      seven_day: { utilization: 100 },
      limits: [
        { kind: 'session', percent: 100 },
        { kind: 'weekly_all', percent: 100 },
        { kind: 'weekly_scoped', percent: 100, scope: { model: { display_name: 'Fable' } } },
        { kind: 'weekly_scoped', percent: 100, scope: { model: { display_name: 'Opus' } } },
      ],
    });
    expect(windows).toHaveLength(4);
    expect(windows.filter((w) => w.scope === 'account')).toHaveLength(2);
    expect(windows.filter((w) => w.scope === 'model')).toHaveLength(2);
  });

  for (const scope of [
    { model: { display_name: 'Fable' } },
    { surface: { display_name: 'Cloud' } },
    'future-scope',
  ]) {
    it(`never makes constrained modern general-looking kinds account-wide: ${JSON.stringify(scope)}`, () => {
      const windows = buildClaudeQuotaWindows({
        limits: [
          { kind: 'session', percent: 100, scope },
          { kind: 'weekly_all', percent: 100, scope },
        ],
      });
      expect(windows.every((w) => w.scope === 'unknown')).toBe(true);
      expect(buildClaudeCoreUsageSummary(windows)).toEqual({ fiveHour: null, weekly: null });
    });
  }

  it('accepts explicitly empty scope metadata for general windows', () => {
    const windows = buildClaudeQuotaWindows({
      limits: [
        { kind: 'session', percent: 10, scope: {} },
        { kind: 'weekly_all', percent: 20, scope: { model: null, surface: null } },
      ],
    });
    expect(buildClaudeCoreUsageSummary(windows).fiveHour?.remainingPercent).toBe(90);
    expect(buildClaudeCoreUsageSummary(windows).weekly?.remainingPercent).toBe(80);
  });
});

describe('monetary credit objects are not temporal Claude quotas', () => {
  for (const key of ['iguana_necktie', 'future_credit_grant']) {
    it(`ignores ${key} structurally even with a utilization and reset`, () => {
      expect(buildClaudeQuotaWindows({ [key]: credit })).toEqual([]);
      expect(
        buildClaudeQuotaWindows({ restrictions: [{ ...credit, rateLimitType: key }] })
      ).toEqual([]);
    });
  }
  it('keeps valid unknown nonmonetary limits as unknown without inventing their meaning', () => {
    const windows = buildClaudeQuotaWindows({
      future_limit: { utilization: 17, resets_at: reset },
    });
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ scope: 'unknown', usedPercent: 17 });
    expect(buildClaudeCoreUsageSummary(windows)).toEqual({ fiveHour: null, weekly: null });
  });
});
