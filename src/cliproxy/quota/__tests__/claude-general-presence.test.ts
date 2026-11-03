import { describe, expect, it } from 'bun:test';
import {
  buildClaudeGeneralWindowPresence,
  buildClaudeQuotaWindows,
} from '../quota-fetcher-claude-normalizer';
import { buildStaleClaudeResult } from '../quota-fetcher-claude-probe-state';
import type { ClaudeQuotaResult } from '../quota-types';

const general = { utilization: 0, resets_at: null };
const fable = { kind: 'weekly_scoped', percent: 100, scope: { model: { display_name: 'Fable' } } };

describe('Claude general window presence', () => {
  for (let mask = 0; mask < 8; mask++) {
    const expected = {
      fiveHour: mask & 1 ? 'present' : 'absent',
      weekly: mask & 2 ? 'present' : 'absent',
    };
    it(`recognizes complete modern 5h/weekly/Fable subset ${mask}`, () => {
      expect(
        buildClaudeGeneralWindowPresence({
          limits: [
            ...(mask & 1 ? [{ kind: 'session', percent: 0, resets_at: null }] : []),
            ...(mask & 2 ? [{ kind: 'weekly_all', percent: 100 }] : []),
            ...(mask & 4 ? [fable] : []),
          ],
        })
      ).toEqual(expected);
    });
    it(`recognizes complete legacy 5h/weekly/Fable subset ${mask}`, () => {
      expect(
        buildClaudeGeneralWindowPresence({
          five_hour: mask & 1 ? general : null,
          seven_day: mask & 2 ? general : null,
          ...(mask & 4 ? { fable_weekly: { utilization: 100 } } : {}),
        })
      ).toEqual(expected);
    });
    for (const shape of ['array', 'map']) {
      it(`recognizes complete restrictions ${shape} subset ${mask}`, () => {
        const rows = {
          ...(mask & 1 ? { five_hour: { utilization: 0 } } : {}),
          ...(mask & 2 ? { seven_day: { utilization: 1 } } : {}),
          ...(mask & 4 ? { fable_weekly: { utilization: 1 } } : {}),
        };
        const restrictions =
          shape === 'array'
            ? Object.entries(rows).map(([rateLimitType, row]) => ({ rateLimitType, ...row }))
            : rows;
        expect(buildClaudeGeneralWindowPresence({ restrictions })).toEqual(expected);
      });
    }
  }

  it('does not infer a missing counterpart absent from a partial keyed response', () => {
    expect(buildClaudeGeneralWindowPresence({ five_hour: general })).toEqual({
      fiveHour: 'present',
      weekly: 'unknown',
    });
    expect(buildClaudeGeneralWindowPresence({ seven_day: general })).toEqual({
      fiveHour: 'unknown',
      weekly: 'present',
    });
    expect(buildClaudeGeneralWindowPresence({ five_hour: null })).toEqual({
      fiveHour: 'absent',
      weekly: 'unknown',
    });
  });

  for (const payload of [
    {},
    { limits: null },
    { limits: {} },
    { unknown: general },
    { fable_weekly: general },
  ]) {
    it(`keeps unsupported or incomplete payload unknown: ${JSON.stringify(payload)}`, () => {
      expect(buildClaudeGeneralWindowPresence(payload)).toEqual({
        fiveHour: 'unknown',
        weekly: 'unknown',
      });
    });
  }

  for (const invalid of [undefined, null, '', ' ', 'bad', true, NaN, Infinity, -1, 101]) {
    it(`does not turn invalid general metrics ${String(invalid)} into absent`, () => {
      expect(
        buildClaudeGeneralWindowPresence({
          limits: [{ kind: 'session', percent: invalid }],
        })
      ).toEqual({ fiveHour: 'unknown', weekly: 'absent' });
      expect(
        buildClaudeGeneralWindowPresence({
          five_hour: { utilization: invalid },
          seven_day: general,
        })
      ).toEqual({ fiveHour: 'unknown', weekly: 'present' });
      expect(
        buildClaudeGeneralWindowPresence({
          limits: [{ kind: 'session', percent: invalid }],
          five_hour: general,
          seven_day: null,
        })
      ).toEqual({ fiveHour: 'present', weekly: 'absent' });
    });
  }

  it('does not let a null legacy alias hide an invalid modern general row', () => {
    expect(
      buildClaudeGeneralWindowPresence({
        limits: [{ kind: 'weekly_all', percent: 'bad' }],
        five_hour: general,
        seven_day: null,
      })
    ).toEqual({ fiveHour: 'present', weekly: 'unknown' });
  });

  it('accepts valid modern aliases when legacy numeric rows are invalid', () => {
    expect(
      buildClaudeGeneralWindowPresence({
        limits: [
          { kind: 'session', percent: 0 },
          { kind: 'weekly_all', percent: 100 },
        ],
        five_hour: { utilization: 'bad' },
        seven_day: { utilization: -1 },
      })
    ).toEqual({ fiveHour: 'present', weekly: 'present' });
  });

  for (const utilization of [0, 0.5, 50, 100]) {
    for (const resets_at of [undefined, null, '2026-11-04T12:00:00Z']) {
      it(`keeps presence independent of percent ${utilization} and reset ${String(resets_at)}`, () => {
        expect(
          buildClaudeGeneralWindowPresence({
            five_hour: { utilization, resets_at },
            seven_day: { utilization, resets_at },
          })
        ).toEqual({ fiveHour: 'present', weekly: 'present' });
      });
    }
  }

  for (const malformed of [null, {}, 'bad', []]) {
    it(`does not infer absence from a malformed list row ${JSON.stringify(malformed)}`, () => {
      expect(
        buildClaudeGeneralWindowPresence({
          limits: [{ kind: 'session', percent: 10 }, malformed],
        })
      ).toEqual({ fiveHour: 'present', weekly: 'unknown' });
      expect(
        buildClaudeGeneralWindowPresence({
          restrictions: [{ rateLimitType: 'five_hour', utilization: 0.1 }, malformed],
        })
      ).toEqual({ fiveHour: 'present', weekly: 'unknown' });
    });
  }

  it('keeps model quotas and dollar credit grants out of general presence', () => {
    expect(
      buildClaudeGeneralWindowPresence({
        limits: [
          fable,
          { kind: 'session', percent: 10, scope: { model: { display_name: 'Opus' } } },
          { kind: 'weekly_all', percent: 10, scope: { surface: 'future' } },
        ],
        iguana_necktie: { utilization: 0, remaining_dollars: 100 },
      })
    ).toEqual({ fiveHour: 'absent', weekly: 'absent' });
    expect(
      buildClaudeGeneralWindowPresence({
        five_hour: { utilization: 10, remaining_dollars: 100 },
        seven_day: null,
      })
    ).toEqual({ fiveHour: 'unknown', weekly: 'absent' });
  });

  it('does not treat a general-looking kind with malformed scope as absence', () => {
    expect(
      buildClaudeGeneralWindowPresence({ limits: [{ kind: 'session', percent: 10, scope: 'bad' }] })
    ).toEqual({ fiveHour: 'unknown', weekly: 'unknown' });
  });

  it('preserves source presence and confirmation time when stale windows expire', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    const payload = {
      five_hour: { utilization: 100, resets_at: new Date(now + 1000).toISOString() },
      seven_day: { utilization: 20, resets_at: null },
    };
    const quota: ClaudeQuotaResult = {
      success: true,
      windows: buildClaudeQuotaWindows(payload),
      generalWindowPresence: buildClaudeGeneralWindowPresence(payload),
      lastUpdated: now,
    };
    const stale = buildStaleClaudeResult(quota, now + 2000);
    expect(stale?.windows.map((row) => row.rateLimitType)).toEqual(['seven_day']);
    expect(stale?.generalWindowPresence).toEqual({ fiveHour: 'present', weekly: 'present' });
    expect(stale?.lastUpdated).toBe(now);
    expect(stale?.stale).toBe(true);
    expect(buildStaleClaudeResult(quota, now + 6 * 3600000 + 1)).toBeNull();
  });
});
