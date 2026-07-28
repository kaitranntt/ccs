import { describe, expect, it } from 'bun:test';

import {
  ANTHROPIC_MODEL_ENV_KEYS,
  isAnthropicModelEnvKey,
} from '../../../src/shared/extended-context-utils';

describe('Anthropic model env keys', () => {
  it('includes all five tier mapping keys', () => {
    expect([...ANTHROPIC_MODEL_ENV_KEYS]).toEqual([
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_DEFAULT_FABLE_MODEL',
    ]);
  });

  it('recognizes the fable tier key like the other tiers', () => {
    expect(isAnthropicModelEnvKey('ANTHROPIC_DEFAULT_FABLE_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('ANTHROPIC_DEFAULT_HAIKU_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('ANTHROPIC_BASE_URL')).toBe(false);
  });
});
