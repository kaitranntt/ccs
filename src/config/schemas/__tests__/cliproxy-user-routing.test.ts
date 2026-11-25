import { describe, expect, it } from 'bun:test';
import * as yaml from 'js-yaml';
import { mergeWithDefaults } from '../../loader/defaults-merger';
import { generateYamlWithComments } from '../../loader/yaml-serializer';
import type { UnifiedConfig } from '../unified-config';

describe('CLIProxy user routing schema', () => {
  it('survives default merging and YAML serialization', () => {
    const configuredRouting = {
      oauth_model_alias: {
        codex: [
          {
            name: 'gpt-5.6-sol',
            alias: 'gpt-5.6-sol-fast',
            fork: true,
          },
        ],
      },
      payload: {
        override: [
          {
            models: [{ name: 'gpt-5.6-sol-fast', protocol: 'codex' }],
            params: { service_tier: 'priority' },
          },
        ],
      },
    };
    const merged = mergeWithDefaults({
      version: 14,
      cliproxy: configuredRouting,
    } as unknown as Partial<UnifiedConfig>);
    const serialized = yaml.load(generateYamlWithComments(merged)) as UnifiedConfig;

    expect(serialized.cliproxy.oauth_model_alias).toEqual(configuredRouting.oauth_model_alias);
    expect(serialized.cliproxy.payload).toEqual(configuredRouting.payload);
  });
});
