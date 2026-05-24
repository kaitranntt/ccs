import { describe, expect, it } from 'bun:test';
import {
  buildGlmtCompatibilityWarnings,
  isDeprecatedGlmtProfileName,
  isLegacyGlmtBaseUrl,
  normalizeDeprecatedGlmtEnv,
} from '../../../src/utils/glmt-deprecation';

describe('glmt deprecation helpers', () => {
  it('detects the deprecated glmt profile name case-insensitively', () => {
    expect(isDeprecatedGlmtProfileName('glmt')).toBe(true);
    expect(isDeprecatedGlmtProfileName('GLMT')).toBe(true);
    expect(isDeprecatedGlmtProfileName('glm')).toBe(false);
  });

  it('detects legacy GLMT proxy base URLs', () => {
    expect(isLegacyGlmtBaseUrl('https://api.z.ai/api/coding/paas/v4/chat/completions')).toBe(
      true
    );
    expect(isLegacyGlmtBaseUrl('https://api.z.ai/api/coding/paas/v4/chat/completions/')).toBe(
      true
    );
    expect(isLegacyGlmtBaseUrl('https://private.example.internal/v1/chat/completions')).toBe(
      false
    );
    expect(isLegacyGlmtBaseUrl('https://api.z.ai/api/anthropic')).toBe(false);
  });

  it('normalizes legacy GLMT proxy settings to the direct GLM endpoint', () => {
    const result = normalizeDeprecatedGlmtEnv({
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
      ANTHROPIC_AUTH_TOKEN: 'ghp_test',
      ANTHROPIC_MODEL: 'glm-5',
      ENABLE_STREAMING: 'true',
      MAX_THINKING_TOKENS: '32768',
      API_TIMEOUT_MS: '3000000',
    });

    expect(result.migrated).toBe(true);
    expect(result.env['ANTHROPIC_BASE_URL']).toBe('https://api.z.ai/api/anthropic');
    expect(result.env['ENABLE_STREAMING']).toBeUndefined();
    expect(result.env['MAX_THINKING_TOKENS']).toBeUndefined();
    expect(result.env['API_TIMEOUT_MS']).toBeUndefined();
    expect(result.warnings).toContain(
      'CCS normalized legacy GLMT proxy settings to the direct GLM endpoint for this run.'
    );
  });

  it('keeps already-direct GLM settings intact apart from deprecation messaging', () => {
    const result = normalizeDeprecatedGlmtEnv({
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'ghp_test',
      ANTHROPIC_MODEL: 'glm-5',
    });

    expect(result.migrated).toBe(false);
    expect(result.env['ANTHROPIC_BASE_URL']).toBe('https://api.z.ai/api/anthropic');
    expect(result.warnings).toEqual(buildGlmtCompatibilityWarnings(false));
  });
});
