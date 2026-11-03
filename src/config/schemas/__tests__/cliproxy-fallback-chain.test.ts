import { describe, expect, it } from 'bun:test';
import * as yaml from 'js-yaml';
import { mergeWithDefaults } from '../../loader/defaults-merger';
import { generateYamlWithComments } from '../../loader/yaml-serializer';
import type { UnifiedConfig } from '../unified-config';

describe('CLIProxy fallback chain schema', () => {
  it('survives default merging and YAML serialization with special characters', () => {
    const configuredFallbackChain = {
      'codex:gpt-5.6-sol': {
        candidates: [
          { provider: 'codex', model: 'gpt-5.6-sol' },
          { provider: 'grok', model: 'grok-beta' },
          { provider: 'claude', model: 'claude-sonnet-4' },
        ],
        sticky_primary: true,
        exhaustion_cooldown: '15m',
      },
      'special:route # with:colon': {
        candidates: [
          { provider: 'custom', model: 'custom:model' },
          { provider: 'custom', model: 'true' },
        ],
        sticky_primary: false,
      },
    };

    const merged = mergeWithDefaults({
      version: 14,
      cliproxy: {
        fallback_chain: configuredFallbackChain,
      },
    } as Partial<UnifiedConfig>);

    const serialized = yaml.load(generateYamlWithComments(merged)) as UnifiedConfig;

    expect(serialized.cliproxy.fallback_chain).toEqual(configuredFallbackChain);
  });
});
