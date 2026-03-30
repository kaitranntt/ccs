import { describe, expect, it } from 'vitest';

import {
  formatAccountDisplayName,
  formatAccountVariantLabel,
  getAccountIdentityPresentation,
} from '@/lib/account-identity';

describe('account identity presentation', () => {
  it('formats duplicate-email team accounts as business workspace labels', () => {
    const presentation = getAccountIdentityPresentation(
      'kaidu.kd@gmail.com#04a0f049-team',
      'kaidu.kd@gmail.com'
    );

    expect(presentation.audience).toBe('business');
    expect(presentation.audienceLabel).toBe('Business');
    expect(presentation.detailLabel).toBe('Workspace 04a0f049');
    expect(presentation.compactDetailLabel).toBe('04a0f049');
    expect(presentation.inlineLabel).toBe('Business · Workspace 04a0f049');
  });

  it('can derive business workspace labels from token file when account id is plain email', () => {
    const presentation = getAccountIdentityPresentation(
      'kaidu.kd@gmail.com',
      'kaidu.kd@gmail.com',
      'codex-04a0f049-kaidu.kd@gmail.com-team.json'
    );

    expect(presentation.audience).toBe('business');
    expect(presentation.audienceLabel).toBe('Business');
    expect(presentation.detailLabel).toBe('Workspace 04a0f049');
    expect(
      formatAccountVariantLabel(
        'kaidu.kd@gmail.com',
        'kaidu.kd@gmail.com',
        'codex-04a0f049-kaidu.kd@gmail.com-team.json'
      )
    ).toBe('Business · Workspace 04a0f049');
  });

  it('formats personal codex plans deliberately instead of leaking raw free suffixes', () => {
    expect(
      formatAccountDisplayName(
        'kaidu.kd@gmail.com',
        'kaidu.kd@gmail.com',
        'codex-kaidu.kd@gmail.com-free.json'
      )
    ).toBe('kaidu.kd@gmail.com (Personal · Free)');
  });

  it('leaves plain accounts without inferred state untouched', () => {
    const presentation = getAccountIdentityPresentation('user@example.com', 'user@example.com');

    expect(presentation.audience).toBe('unknown');
    expect(presentation.audienceLabel).toBeNull();
    expect(presentation.detailLabel).toBeNull();
    expect(formatAccountDisplayName('user@example.com', 'user@example.com')).toBe(
      'user@example.com'
    );
  });
});
