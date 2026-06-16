/**
 * Tests: runtime output-limits schema and env mapping (issue #231).
 *
 * Verifies the opt-in contract:
 * - Absent/empty config injects NOTHING (downstream defaults preserved).
 * - Configured values map to the correct downstream env var names.
 * - All emitted values are strings.
 */

import { describe, it, expect } from 'bun:test';
import { buildOutputLimitsEnv, OUTPUT_LIMITS_ENV_KEYS, type OutputLimitsConfig } from '../runtime';

describe('buildOutputLimitsEnv', () => {
  it('injects nothing when config is undefined (defaults preserved)', () => {
    expect(buildOutputLimitsEnv(undefined)).toEqual({});
  });

  it('injects nothing when config is an empty object', () => {
    expect(buildOutputLimitsEnv({})).toEqual({});
  });

  it('maps maxMcpOutputTokens to MAX_MCP_OUTPUT_TOKENS as a string', () => {
    const env = buildOutputLimitsEnv({ maxMcpOutputTokens: 100000 });
    expect(env).toEqual({ MAX_MCP_OUTPUT_TOKENS: '100000' });
    expect(typeof env.MAX_MCP_OUTPUT_TOKENS).toBe('string');
  });

  it('maps bashMaxOutputLength to BASH_MAX_OUTPUT_LENGTH as a string', () => {
    const env = buildOutputLimitsEnv({ bashMaxOutputLength: 200000 });
    expect(env).toEqual({ BASH_MAX_OUTPUT_LENGTH: '200000' });
    expect(typeof env.BASH_MAX_OUTPUT_LENGTH).toBe('string');
  });

  it('maps both keys when both are configured, all values strings', () => {
    const cfg: OutputLimitsConfig = {
      maxMcpOutputTokens: 100000,
      bashMaxOutputLength: 200000,
    };
    const env = buildOutputLimitsEnv(cfg);
    expect(env).toEqual({
      MAX_MCP_OUTPUT_TOKENS: '100000',
      BASH_MAX_OUTPUT_LENGTH: '200000',
    });
    for (const value of Object.values(env)) {
      expect(typeof value).toBe('string');
    }
  });

  it('injects only the configured subset, leaving the other absent', () => {
    const env = buildOutputLimitsEnv({ maxMcpOutputTokens: 50000 });
    expect(env).toHaveProperty('MAX_MCP_OUTPUT_TOKENS', '50000');
    expect(env).not.toHaveProperty('BASH_MAX_OUTPUT_LENGTH');
  });

  it('emits "0" for an explicit zero limit (finite, non-negative)', () => {
    const env = buildOutputLimitsEnv({ maxMcpOutputTokens: 0 });
    expect(env).toEqual({ MAX_MCP_OUTPUT_TOKENS: '0' });
  });

  it('ignores invalid (NaN / Infinity / negative) values', () => {
    expect(buildOutputLimitsEnv({ maxMcpOutputTokens: Number.NaN })).toEqual({});
    expect(buildOutputLimitsEnv({ maxMcpOutputTokens: Number.POSITIVE_INFINITY })).toEqual({});
    expect(buildOutputLimitsEnv({ bashMaxOutputLength: -1 })).toEqual({});
  });

  it('exposes the downstream env var names via the managed-env allowlist', () => {
    expect(OUTPUT_LIMITS_ENV_KEYS.maxMcpOutputTokens).toBe('MAX_MCP_OUTPUT_TOKENS');
    expect(OUTPUT_LIMITS_ENV_KEYS.bashMaxOutputLength).toBe('BASH_MAX_OUTPUT_LENGTH');
  });
});
