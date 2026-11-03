import { describe, expect, it } from 'bun:test';
import * as yaml from 'js-yaml';
import { serializeFallbackChainSection } from '../fallback-chain-serializer';

describe('serializeFallbackChainSection', () => {
  it('returns empty string for undefined or empty config', () => {
    expect(serializeFallbackChainSection(undefined)).toBe('');
    expect(serializeFallbackChainSection({})).toBe('');
  });

  it('serializes ordered candidates with kebab-case fields and round-trips via js-yaml', () => {
    const original = {
      'codex:gpt-5.6-sol': {
        candidates: [
          { provider: 'codex', model: 'gpt-5.6-sol' },
          { provider: 'grok', model: 'grok-beta' },
          { provider: 'claude', model: 'claude-sonnet-4' },
        ],
        sticky_primary: true,
        exhaustion_cooldown: '15m',
      },
    };

    const serialized = serializeFallbackChainSection(original);
    expect(serialized).toContain('fallback-chain:');

    // Round-trip parse check
    const parsed = yaml.load(serialized) as Record<string, any>;
    expect(parsed['fallback-chain']).toBeDefined();
    const chain = parsed['fallback-chain']['codex:gpt-5.6-sol'];
    expect(chain.candidates).toHaveLength(3);
    expect(chain.candidates[0]).toEqual({ provider: 'codex', model: 'gpt-5.6-sol' });
    expect(chain.candidates[1]).toEqual({ provider: 'grok', model: 'grok-beta' });
    expect(chain.candidates[2]).toEqual({ provider: 'claude', model: 'claude-sonnet-4' });
    expect(chain['sticky-primary']).toBe(true);
    expect(chain['exhaustion-cooldown']).toBe('15m');
  });

  it('safely handles special characters (: , #, newlines, boolean strings) without corrupting YAML', () => {
    const maliciousOrTrickyConfig = {
      'custom:route # with comment and : ': {
        candidates: [
          { provider: 'custom-provider', model: 'model:with:colons' },
          { provider: 'provider', model: 'true' }, // boolean-like string
          { provider: 'provider', model: 'model\nwith\nnewlines' },
          { provider: 'provider', model: 'model # with hash' },
        ],
        sticky_primary: false,
        exhaustion_cooldown: '10s',
      },
    };

    const serialized = serializeFallbackChainSection(maliciousOrTrickyConfig);

    // Verify round-trip preserves exact values without corruption
    const parsed = yaml.load(serialized) as Record<string, any>;
    expect(parsed['fallback-chain']).toBeDefined();
    const chain = parsed['fallback-chain']['custom:route # with comment and : '];
    expect(chain).toBeDefined();
    expect(chain.candidates[0].model).toBe('model:with:colons');
    expect(chain.candidates[1].model).toBe('true');
    expect(typeof chain.candidates[1].model).toBe('string');
    expect(chain.candidates[2].model).toBe('model\nwith\nnewlines');
    expect(chain.candidates[3].model).toBe('model # with hash');
    expect(chain['sticky-primary']).toBe(false);
    expect(chain['exhaustion-cooldown']).toBe('10s');
  });
});
