import { describe, expect, it } from 'bun:test';

import { loadBaseConfig } from '../../config/base-config-loader';

describe('base-config-loader new providers', () => {
  it.each([
    ['cursor', '/api/provider/cursor', 'composer-2'],
    ['gitlab', '/api/provider/gitlab', 'gitlab-duo'],
    ['codebuddy', '/api/provider/codebuddy', 'auto'],
    ['kilo', '/api/provider/kilo', 'kilo/auto'],
    ['qoder', '/api/provider/qoder', 'qoder/auto'],
    ['xai', '/api/provider/xai', 'grok-build-0.1'],
  ] as const)('loads base settings for %s', (provider, baseUrlPath, defaultModel) => {
    const config = loadBaseConfig(provider);

    expect(config.env.ANTHROPIC_BASE_URL).toContain(baseUrlPath);
    expect(config.env.ANTHROPIC_AUTH_TOKEN).toBe('ccs-internal-managed');
    expect(config.env.ANTHROPIC_MODEL).toBe(defaultModel);
    expect(config.env?.ANTHROPIC_DEFAULT_OPUS_MODEL?.length).toBeGreaterThan(0);
    expect(config.env?.ANTHROPIC_DEFAULT_SONNET_MODEL?.length).toBeGreaterThan(0);
    expect(config.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL?.length).toBeGreaterThan(0);
  });
});
