import { describe, expect, it } from 'vitest';
import {
  applyCodexEffortSuffix,
  applyCodexServiceTierSuffix,
  getCodexEffortDisplay,
  getCodexEffortVariants,
  getSelectableCodexEfforts,
  parseCodexEffort,
  parseCodexServiceTier,
  stripCodexEffortSuffix,
} from '@/lib/codex-effort';

describe('parseCodexEffort', () => {
  it('parses lowercase suffixes', () => {
    expect(parseCodexEffort('gpt-5.3-codex-high')).toBe('high');
    expect(parseCodexEffort('gpt-5.4-high-fast')).toBe('high');
    expect(parseCodexEffort('gpt-5.4-fast-high')).toBe('high');
    expect(parseCodexEffort('gpt-5.3-codex-xhigh')).toBe('xhigh');
    expect(parseCodexEffort('gpt-5-mini-medium')).toBe('medium');
    expect(parseCodexEffort('gpt-5.5-low')).toBe('low');
    expect(parseCodexEffort('gpt-5.5-minimal')).toBe('minimal');
  });

  it('parses mixed-case suffixes', () => {
    expect(parseCodexEffort('gpt-5.3-codex-XHIGH')).toBe('xhigh');
  });

  it('returns undefined for unsuffixed or unsupported values', () => {
    expect(parseCodexEffort('gpt-5.3-codex')).toBeUndefined();
    expect(parseCodexEffort('gpt-5.4-fast')).toBeUndefined();
    expect(parseCodexEffort(undefined)).toBeUndefined();
  });
});

describe('parseCodexServiceTier', () => {
  it('parses fast service-tier suffixes', () => {
    expect(parseCodexServiceTier('gpt-5.4-fast')).toBe('fast');
    expect(parseCodexServiceTier('gpt-5.4-high-fast')).toBe('fast');
    expect(parseCodexServiceTier('gpt-5.4-fast-high')).toBe('fast');
  });
});

describe('getCodexEffortDisplay', () => {
  it('returns pinned label for suffixed models', () => {
    expect(getCodexEffortDisplay('gpt-5.3-codex-high')).toEqual({
      label: 'Pinned high',
      explicit: true,
    });
  });

  it('returns auto label for unsuffixed models', () => {
    expect(getCodexEffortDisplay('gpt-5.3-codex')).toEqual({
      label: 'Auto effort',
      explicit: false,
    });
  });

  it('returns null for empty input', () => {
    expect(getCodexEffortDisplay(undefined)).toBeNull();
  });
});

describe('codex effort helpers', () => {
  it('strips and reapplies codex effort suffixes', () => {
    expect(stripCodexEffortSuffix('gpt-5.3-codex-high')).toBe('gpt-5.3-codex');
    expect(stripCodexEffortSuffix('gpt-5.4-fast-high')).toBe('gpt-5.4');
    expect(applyCodexEffortSuffix('gpt-5.3-codex-high', 'xhigh')).toBe('gpt-5.3-codex-xhigh');
    expect(applyCodexEffortSuffix('gpt-5.4-fast', 'high')).toBe('gpt-5.4-high-fast');
    expect(applyCodexEffortSuffix('gpt-5.3-codex', undefined)).toBe('gpt-5.3-codex');
  });

  it('builds ordered codex effort variants up to the supported max level', () => {
    expect(getCodexEffortVariants('gpt-5.3-codex', 'xhigh')).toEqual([
      'gpt-5.3-codex',
      'gpt-5.3-codex-minimal',
      'gpt-5.3-codex-low',
      'gpt-5.3-codex-medium',
      'gpt-5.3-codex-high',
      'gpt-5.3-codex-xhigh',
    ]);
    expect(getCodexEffortVariants('gpt-5.4-mini', 'high')).toEqual([
      'gpt-5.4-mini',
      'gpt-5.4-mini-minimal',
      'gpt-5.4-mini-low',
      'gpt-5.4-mini-medium',
      'gpt-5.4-mini-high',
    ]);
  });

  it('replaces effort while preserving the fast service tier', () => {
    expect(applyCodexEffortSuffix('gpt-5.4-high-fast', 'low')).toBe('gpt-5.4-low-fast');
    expect(applyCodexEffortSuffix('gpt-5.4-high-fast', undefined)).toBe('gpt-5.4-fast');
  });

  it('applies effort suffixes to routing-prefixed model ids', () => {
    expect(applyCodexEffortSuffix('codex/gpt-5.6-sol', 'high')).toBe('codex/gpt-5.6-sol-high');
  });

  it('builds fast variants for models with a fast service tier', () => {
    expect(getCodexEffortVariants('gpt-5.4', 'high', ['fast'])).toEqual([
      'gpt-5.4',
      'gpt-5.4-fast',
      'gpt-5.4-minimal',
      'gpt-5.4-minimal-fast',
      'gpt-5.4-low',
      'gpt-5.4-low-fast',
      'gpt-5.4-medium',
      'gpt-5.4-medium-fast',
      'gpt-5.4-high',
      'gpt-5.4-high-fast',
    ]);
  });
});

describe('applyCodexServiceTierSuffix', () => {
  it('adds the fast tier while preserving the effort suffix', () => {
    expect(applyCodexServiceTierSuffix('gpt-5.4-high', true)).toBe('gpt-5.4-high-fast');
  });

  it('removes only the fast tier', () => {
    expect(applyCodexServiceTierSuffix('gpt-5.4-high-fast', false)).toBe('gpt-5.4-high');
    expect(applyCodexServiceTierSuffix('gpt-5.4-fast', false)).toBe('gpt-5.4');
  });

  it('preserves routing prefixes', () => {
    expect(applyCodexServiceTierSuffix('codex/gpt-5.6-sol', true)).toBe('codex/gpt-5.6-sol-fast');
  });

  it('is idempotent and safe on empty input', () => {
    expect(applyCodexServiceTierSuffix('gpt-5.4-fast', true)).toBe('gpt-5.4-fast');
    expect(applyCodexServiceTierSuffix('gpt-5.4', false)).toBe('gpt-5.4');
    expect(applyCodexServiceTierSuffix(undefined, true)).toBe('');
    expect(applyCodexServiceTierSuffix('', true)).toBe('');
  });

  it('composes with applyCodexEffortSuffix in both orders', () => {
    expect(applyCodexEffortSuffix(applyCodexServiceTierSuffix('gpt-5.4', true), 'high')).toBe(
      'gpt-5.4-high-fast'
    );
    expect(applyCodexServiceTierSuffix(applyCodexEffortSuffix('gpt-5.4', 'high'), true)).toBe(
      'gpt-5.4-high-fast'
    );
    expect(
      applyCodexEffortSuffix(applyCodexServiceTierSuffix('gpt-5.4-high-fast', false), 'low')
    ).toBe('gpt-5.4-low');
  });
});

describe('getSelectableCodexEfforts', () => {
  it('returns the explicit efforts list when provided', () => {
    expect(getSelectableCodexEfforts('xhigh', ['low', 'medium', 'high', 'xhigh'])).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('returns efforts up to and including the max effort', () => {
    expect(getSelectableCodexEfforts('xhigh')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getSelectableCodexEfforts('medium')).toEqual(['minimal', 'low', 'medium']);
  });

  it('returns all efforts for custom models without catalog metadata', () => {
    expect(getSelectableCodexEfforts(undefined)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });
});
