import { describe, expect, it } from 'vitest';

import {
  formatAccountDisplayName,
  formatAccountVariantLabel,
  getAccountIdentityPresentation,
  getAccountDisplayLabels,
} from '@/lib/account-identity';

describe('account identity presentation', () => {
  it('uses nicknames as primary labels and keeps identity secondary', () => {
    expect(getAccountDisplayLabels('opaque-id', 'user@example.com', undefined, '  Work  ')).toEqual(
      {
        primary: 'Work',
        secondary: 'user@example.com · opaque-id',
      }
    );
    expect(
      formatAccountDisplayName('user@example.com#free', 'user@example.com', undefined, 'Personal')
    ).toBe('Personal (user@example.com (Free))');
  });

  it.each([undefined, '', '   '])(
    'falls back from an empty nickname (%s) to email or ID',
    (nickname) => {
      expect(getAccountDisplayLabels('opaque-id', 'user@example.com', undefined, nickname)).toEqual(
        { primary: 'user@example.com' }
      );
      expect(getAccountDisplayLabels('opaque-id', undefined, undefined, nickname)).toEqual({
        primary: 'opaque-id',
      });
    }
  );

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

  it('classifies free codex accounts as a standalone audience', () => {
    const presentation = getAccountIdentityPresentation(
      'kaidu.kd@gmail.com',
      'kaidu.kd@gmail.com',
      'codex-kaidu.kd@gmail.com-free.json'
    );

    expect(presentation.audience).toBe('free');
    expect(presentation.audienceLabel).toBe('Free');
    expect(presentation.detailLabel).toBeNull();
    expect(
      formatAccountDisplayName(
        'kaidu.kd@gmail.com',
        'kaidu.kd@gmail.com',
        'codex-kaidu.kd@gmail.com-free.json'
      )
    ).toBe('kaidu.kd@gmail.com (Free)');
  });

  it('keeps plus and pro codex personal plans distinct', () => {
    expect(
      formatAccountDisplayName(
        'kaidu.kd@gmail.com',
        'kaidu.kd@gmail.com',
        'codex-kaidu.kd@gmail.com-plus.json'
      )
    ).toBe('kaidu.kd@gmail.com (Personal · Plus)');
    expect(
      formatAccountDisplayName(
        'kaidu.kd@gmail.com',
        'kaidu.kd@gmail.com',
        'codex-kaidu.kd@gmail.com-pro.json'
      )
    ).toBe('kaidu.kd@gmail.com (Personal · Pro)');
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
