import { describe, expect, it } from 'bun:test';

import { parseTarget as parseProfileTarget } from '../../../src/web-server/routes/profile-routes';
import { parseTarget as parseVariantTarget } from '../../../src/web-server/routes/variant-routes';

describe('route target parsing', () => {
  it('accepts valid target values', () => {
    expect(parseProfileTarget('claude')).toBe('claude');
    expect(parseProfileTarget('DROID')).toBe('droid');
    expect(parseVariantTarget(' claude ')).toBe('claude');
    expect(parseVariantTarget('droid')).toBe('droid');
  });

  it('returns null for invalid target values', () => {
    expect(parseProfileTarget('glm')).toBeNull();
    expect(parseProfileTarget('codex')).toBeNull();
    expect(parseProfileTarget('')).toBeNull();
    expect(parseVariantTarget('factory')).toBeNull();
    expect(parseVariantTarget('codex')).toBeNull();
    expect(parseVariantTarget('  ')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(parseProfileTarget(undefined)).toBeNull();
    expect(parseProfileTarget(null)).toBeNull();
    expect(parseVariantTarget(123)).toBeNull();
    expect(parseVariantTarget({ target: 'claude' })).toBeNull();
  });
});
