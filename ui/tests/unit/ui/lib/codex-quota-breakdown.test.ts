/**
 * Tests for Codex quota breakdown logic.
 *
 * Covers the dashboard-side mirror of the server's CodexQuotaWindow handling:
 * additional rate-limit windows (e.g. GPT-5.3 Codex Spark) must NOT pollute
 * the core 5h/weekly buckets, and category metadata takes precedence over
 * label sniffing when present.
 */

import { describe, it, expect } from 'vitest';
import {
  getCodexQuotaBreakdown,
  getCodexWindowKind,
  getCodexWindowDisplayLabel,
  prettifyCodexFeatureLabel,
} from '@/lib/utils';
import type { CodexQuotaWindow } from '@/lib/api-client';

describe('prettifyCodexFeatureLabel', () => {
  it('strips "GPT-X.Y-Codex-" prefix and prepends "Codex"', () => {
    expect(prettifyCodexFeatureLabel('GPT-5.3-Codex-Spark')).toBe('Codex Spark');
  });

  it('is case-insensitive when stripping the GPT prefix', () => {
    expect(prettifyCodexFeatureLabel('gpt-5.3-codex-spark')).toBe('Codex spark');
  });

  it('returns labels without the GPT prefix verbatim', () => {
    expect(prettifyCodexFeatureLabel('OmniReview')).toBe('OmniReview');
  });

  it('returns empty string for empty input', () => {
    expect(prettifyCodexFeatureLabel('')).toBe('');
  });

  it('trims whitespace and handles whitespace-only input', () => {
    expect(prettifyCodexFeatureLabel('   ')).toBe('');
    expect(prettifyCodexFeatureLabel('  GPT-5.3-Codex-Spark  ')).toBe('Codex Spark');
  });

  it('returns empty string for non-string input', () => {
    expect(prettifyCodexFeatureLabel({ label: 'Spark' })).toBe('');
    expect(prettifyCodexFeatureLabel(123)).toBe('');
  });
});

describe('getCodexWindowKind', () => {
  it('uses category metadata when present (additional weekly)', () => {
    const window: CodexQuotaWindow = {
      label: 'GPT-5.3-Codex-Spark (Secondary)',
      usedPercent: 10,
      remainingPercent: 90,
      resetAfterSeconds: 600000,
      resetAt: '2026-05-04T00:00:00Z',
      category: 'additional',
      cadence: 'weekly',
      featureLabel: 'GPT-5.3-Codex-Spark',
    };
    expect(getCodexWindowKind(window)).toBe('additional-weekly');
  });

  it('uses category metadata when present (additional 5h)', () => {
    const window: CodexQuotaWindow = {
      label: 'GPT-5.3-Codex-Spark (Primary)',
      usedPercent: 5,
      remainingPercent: 95,
      resetAfterSeconds: 18000,
      resetAt: '2026-04-28T00:00:00Z',
      category: 'additional',
      cadence: '5h',
      featureLabel: 'GPT-5.3-Codex-Spark',
    };
    expect(getCodexWindowKind(window)).toBe('additional-5h');
  });

  it('uses category metadata when present (usage 5h)', () => {
    const window: CodexQuotaWindow = {
      label: 'Primary',
      usedPercent: 25,
      remainingPercent: 75,
      resetAfterSeconds: 18000,
      resetAt: '2026-04-28T00:00:00Z',
      category: 'usage',
      cadence: '5h',
    };
    expect(getCodexWindowKind(window)).toBe('usage-5h');
  });

  it('uses category metadata when present (code-review weekly)', () => {
    const window: CodexQuotaWindow = {
      label: 'Code Review (Secondary)',
      usedPercent: 50,
      remainingPercent: 50,
      resetAfterSeconds: 604800,
      resetAt: '2026-05-04T00:00:00Z',
      category: 'code-review',
      cadence: 'weekly',
      featureLabel: 'Code Review',
    };
    expect(getCodexWindowKind(window)).toBe('code-review-weekly');
  });

  it('falls back to label sniffing for legacy windows without category', () => {
    expect(getCodexWindowKind('Primary')).toBe('usage-5h');
    expect(getCodexWindowKind('Secondary')).toBe('usage-weekly');
    expect(getCodexWindowKind('Code Review (Primary)')).toBe('code-review-5h');
    expect(getCodexWindowKind('Code Review (Secondary)')).toBe('code-review-weekly');
    expect(getCodexWindowKind('Code Review')).toBe('code-review');
    expect(getCodexWindowKind('Random Label')).toBe('unknown');
  });

  it('falls back to label sniffing when window has no category set', () => {
    const window: CodexQuotaWindow = {
      label: 'Primary',
      usedPercent: 25,
      remainingPercent: 75,
      resetAfterSeconds: 18000,
      resetAt: '2026-04-28T00:00:00Z',
    };
    expect(getCodexWindowKind(window)).toBe('usage-5h');
  });
});

describe('getCodexQuotaBreakdown', () => {
  it('returns empty buckets for empty windows', () => {
    const result = getCodexQuotaBreakdown([]);
    expect(result.fiveHourWindow).toBeNull();
    expect(result.weeklyWindow).toBeNull();
    expect(result.codeReviewWindows).toEqual([]);
    expect(result.additionalWindows).toEqual([]);
    expect(result.unknownWindows).toEqual([]);
  });

  it('routes Pro-account windows by category metadata (Spark stays out of core)', () => {
    const windows: CodexQuotaWindow[] = [
      {
        label: 'Primary',
        usedPercent: 0,
        remainingPercent: 100,
        resetAfterSeconds: 18000,
        resetAt: '2026-04-28T05:00:00Z',
        category: 'usage',
        cadence: '5h',
      },
      {
        label: 'Secondary',
        usedPercent: 0,
        remainingPercent: 100,
        resetAfterSeconds: 604800,
        resetAt: '2026-05-04T00:00:00Z',
        category: 'usage',
        cadence: 'weekly',
      },
      {
        label: 'GPT-5.3-Codex-Spark (Primary)',
        usedPercent: 12,
        remainingPercent: 88,
        // Intentionally short reset to verify Spark cannot displace core 5h via reset-horizon fallback.
        resetAfterSeconds: 60,
        resetAt: '2026-04-27T00:01:00Z',
        category: 'additional',
        cadence: '5h',
        featureLabel: 'GPT-5.3-Codex-Spark',
      },
      {
        label: 'GPT-5.3-Codex-Spark (Secondary)',
        usedPercent: 30,
        remainingPercent: 70,
        resetAfterSeconds: 600000,
        resetAt: '2026-05-04T00:00:00Z',
        category: 'additional',
        cadence: 'weekly',
        featureLabel: 'GPT-5.3-Codex-Spark',
      },
      {
        label: 'Code Review (Primary)',
        usedPercent: 25,
        remainingPercent: 75,
        resetAfterSeconds: 17000,
        resetAt: '2026-04-28T05:00:00Z',
        category: 'code-review',
        cadence: '5h',
        featureLabel: 'Code Review',
      },
    ];

    const result = getCodexQuotaBreakdown(windows);

    expect(result.fiveHourWindow?.label).toBe('Primary');
    expect(result.fiveHourWindow?.category).toBe('usage');
    expect(result.weeklyWindow?.label).toBe('Secondary');
    expect(result.weeklyWindow?.category).toBe('usage');

    expect(result.additionalWindows).toHaveLength(2);
    expect(result.additionalWindows.map((w) => w.featureLabel)).toEqual([
      'GPT-5.3-Codex-Spark',
      'GPT-5.3-Codex-Spark',
    ]);
    expect(result.additionalWindows.map((w) => w.cadence)).toEqual(['5h', 'weekly']);

    expect(result.codeReviewWindows).toHaveLength(1);
    expect(result.codeReviewWindows[0]?.featureLabel).toBe('Code Review');

    expect(result.unknownWindows).toEqual([]);
  });

  it('returns empty additionalWindows for Plus-shape data without additional categories', () => {
    const windows: CodexQuotaWindow[] = [
      {
        label: 'Primary',
        usedPercent: 30,
        remainingPercent: 70,
        resetAfterSeconds: 18000,
        resetAt: '2026-04-28T05:00:00Z',
        category: 'usage',
        cadence: '5h',
      },
      {
        label: 'Secondary',
        usedPercent: 60,
        remainingPercent: 40,
        resetAfterSeconds: 604800,
        resetAt: '2026-05-04T00:00:00Z',
        category: 'usage',
        cadence: 'weekly',
      },
    ];

    const result = getCodexQuotaBreakdown(windows);

    expect(result.fiveHourWindow?.label).toBe('Primary');
    expect(result.weeklyWindow?.label).toBe('Secondary');
    expect(result.additionalWindows).toEqual([]);
    expect(result.codeReviewWindows).toEqual([]);
    expect(result.unknownWindows).toEqual([]);
  });

  it('falls back to label sniffing for legacy cached windows without metadata', () => {
    const windows: CodexQuotaWindow[] = [
      {
        label: 'Primary',
        usedPercent: 25,
        remainingPercent: 75,
        resetAfterSeconds: 18000,
        resetAt: '2026-04-28T05:00:00Z',
      },
      {
        label: 'Secondary',
        usedPercent: 65,
        remainingPercent: 35,
        resetAfterSeconds: 604800,
        resetAt: '2026-05-04T00:00:00Z',
      },
      {
        label: 'Code Review (Primary)',
        usedPercent: 10,
        remainingPercent: 90,
        resetAfterSeconds: 17000,
        resetAt: '2026-04-28T05:00:00Z',
      },
      {
        label: 'Code Review (Secondary)',
        usedPercent: 5,
        remainingPercent: 95,
        resetAfterSeconds: 600000,
        resetAt: '2026-05-04T00:00:00Z',
      },
    ];

    const result = getCodexQuotaBreakdown(windows);

    expect(result.fiveHourWindow?.label).toBe('Primary');
    expect(result.weeklyWindow?.label).toBe('Secondary');
    expect(result.codeReviewWindows).toHaveLength(2);
    expect(result.additionalWindows).toEqual([]);
    expect(result.unknownWindows).toEqual([]);
  });
});

describe('getCodexWindowDisplayLabel for additional windows', () => {
  it('renders additional 5h windows with prettified Codex feature name', () => {
    const window: CodexQuotaWindow = {
      label: 'GPT-5.3-Codex-Spark (Primary)',
      usedPercent: 12,
      remainingPercent: 88,
      resetAfterSeconds: 18000,
      resetAt: '2026-04-28T05:00:00Z',
      category: 'additional',
      cadence: '5h',
      featureLabel: 'GPT-5.3-Codex-Spark',
    };
    expect(getCodexWindowDisplayLabel(window)).toBe('Codex Spark (5h)');
  });

  it('renders additional weekly windows with prettified Codex feature name', () => {
    const window: CodexQuotaWindow = {
      label: 'GPT-5.3-Codex-Spark (Secondary)',
      usedPercent: 30,
      remainingPercent: 70,
      resetAfterSeconds: 600000,
      resetAt: '2026-05-04T00:00:00Z',
      category: 'additional',
      cadence: 'weekly',
      featureLabel: 'GPT-5.3-Codex-Spark',
    };
    expect(getCodexWindowDisplayLabel(window)).toBe('Codex Spark (weekly)');
  });

  it('falls back to raw label when featureLabel is missing', () => {
    const window: CodexQuotaWindow = {
      label: 'OmniReview (Primary)',
      usedPercent: 0,
      remainingPercent: 100,
      resetAfterSeconds: 18000,
      resetAt: '2026-04-28T05:00:00Z',
      category: 'additional',
      cadence: '5h',
    };
    expect(getCodexWindowDisplayLabel(window)).toBe('OmniReview (Primary) (5h)');
  });
});
