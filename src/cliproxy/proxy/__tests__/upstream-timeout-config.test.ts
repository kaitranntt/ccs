/**
 * CCS_CLIPROXY_UPSTREAM_TIMEOUT_MS sets how long the CLIProxy session proxies
 * (tool sanitization, Codex reasoning) wait on an upstream request before
 * giving up. The default stays 120 s.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  UPSTREAM_TIMEOUT_ENV,
  resolveUpstreamTimeoutMs,
} from '../upstream-response-timeout';
import { ToolSanitizationProxy } from '../tool-sanitization-proxy';
import { CodexReasoningProxy } from '../../ai-providers/codex-reasoning-proxy';

const originalEnv = process.env[UPSTREAM_TIMEOUT_ENV];

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[UPSTREAM_TIMEOUT_ENV];
  } else {
    process.env[UPSTREAM_TIMEOUT_ENV] = originalEnv;
  }
});

describe('resolveUpstreamTimeoutMs', () => {
  it('defaults to 120 s when unset or blank', () => {
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBe(120_000);
    expect(resolveUpstreamTimeoutMs({})).toBe(120_000);
    expect(resolveUpstreamTimeoutMs({ [UPSTREAM_TIMEOUT_ENV]: '  ' })).toBe(120_000);
  });

  it('uses a positive integer override', () => {
    expect(resolveUpstreamTimeoutMs({ [UPSTREAM_TIMEOUT_ENV]: '600000' })).toBe(600_000);
  });

  it('falls back to the default for invalid values', () => {
    for (const value of ['0', '-5', 'abc', '1.5', '10s']) {
      expect(resolveUpstreamTimeoutMs({ [UPSTREAM_TIMEOUT_ENV]: value })).toBe(120_000);
    }
  });
});

// Bun keeps sockets attached differently from Node (see
// upstream-response-timeout.test.ts), so a real stalled-upstream round trip is
// not observable under bun test; assert the timeout each proxy resolves instead.
const resolvedTimeout = (proxy: object): number =>
  (proxy as unknown as { config: { timeoutMs: number } }).config.timeoutMs;

describe('CLIProxy session proxies resolve the upstream timeout', () => {
  const upstreamBaseUrl = 'http://127.0.0.1:1';
  const modelMap = { defaultModel: 'gpt-5.5-high' };

  it('use the env override when no explicit timeoutMs is passed', () => {
    process.env[UPSTREAM_TIMEOUT_ENV] = '600000';
    expect(resolvedTimeout(new ToolSanitizationProxy({ upstreamBaseUrl }))).toBe(600_000);
    expect(resolvedTimeout(new CodexReasoningProxy({ upstreamBaseUrl, modelMap }))).toBe(600_000);
  });

  it('keep 120 s without an override', () => {
    delete process.env[UPSTREAM_TIMEOUT_ENV];
    expect(resolvedTimeout(new ToolSanitizationProxy({ upstreamBaseUrl }))).toBe(120_000);
    expect(resolvedTimeout(new CodexReasoningProxy({ upstreamBaseUrl, modelMap }))).toBe(120_000);
  });

  it('let an explicit timeoutMs win over the env', () => {
    process.env[UPSTREAM_TIMEOUT_ENV] = '600000';
    expect(resolvedTimeout(new ToolSanitizationProxy({ upstreamBaseUrl, timeoutMs: 5_000 }))).toBe(
      5_000
    );
  });
});
