/**
 * Unit tests for proxy-chain-builder.ts (Phase 07)
 *
 * Mocking strategy: proxy constructors are injected via the _ToolSanitizationProxy
 * and _CodexReasoningProxy fields on ProxyChainContext (dependency-injection escape
 * hatch added for testability).  This avoids Bun module-cache limitations with
 * mock.module / jest.mock and never spins up real HTTP servers.
 *
 * Tests cover:
 * - Tool sanitization proxy started when ANTHROPIC_BASE_URL is set
 * - Tool sanitization proxy skipped when ANTHROPIC_BASE_URL is absent
 * - Tool sanitization proxy start failure swallowed (null returned, verbose warn)
 * - Codex reasoning proxy started for single-provider codex
 * - Codex reasoning proxy skipped for composite codex (cfg.isComposite true)
 * - Codex reasoning proxy skipped for non-codex provider
 * - Codex reasoning proxy uses post-sanitization URL when tool-san is active
 * - Codex reasoning proxy start failure swallowed (null returned)
 * - All results null when ANTHROPIC_BASE_URL absent
 */

import { describe, expect, it, jest, beforeEach } from 'bun:test';
import { buildProxyChain } from '../proxy-chain-builder';
import type { ProxyChainContext } from '../proxy-chain-builder';
import type { ToolSanitizationProxy } from '../../proxy/tool-sanitization-proxy';
import type { CodexReasoningProxy } from '../../ai-providers/codex-reasoning-proxy';

// ── Stub factory ──────────────────────────────────────────────────────────────

type ProxyStub = { start: jest.Mock; stop: jest.Mock; _port?: number };

function makeStubCtor(resolvePort: number | (() => Promise<number> | number)): {
  ctor: jest.Mock;
  instance: ProxyStub;
} {
  const instance: ProxyStub = {
    start: jest
      .fn()
      .mockImplementation(
        typeof resolvePort === 'function' ? resolvePort : () => Promise.resolve(resolvePort)
      ),
    stop: jest.fn(),
  };
  const ctor = jest.fn().mockReturnValue(instance);
  return { ctor, instance };
}

function makeFailCtor(message: string): { ctor: jest.Mock; instance: ProxyStub } {
  const instance: ProxyStub = {
    start: jest.fn().mockRejectedValue(new Error(message)),
    stop: jest.fn(),
  };
  const ctor = jest.fn().mockReturnValue(instance);
  return { ctor, instance };
}

// ── Context helpers ───────────────────────────────────────────────────────────

function makeThinkingCfg() {
  return { mode: 'auto' as const, override: undefined };
}

function makeProxyConfig() {
  return {
    mode: 'local' as const,
    port: 8317,
    protocol: 'http' as const,
    fallbackEnabled: false,
    autoStartLocal: true,
    remoteOnly: false,
    forceLocal: false,
  };
}

function makeCfg(overrides: Partial<{ isComposite: boolean }> = {}) {
  return { port: 8317, timeout: 5000, verbose: false, pollInterval: 100, ...overrides };
}

// Stub ctors shared across tests, reset in beforeEach
let defaultToolSan: ReturnType<typeof makeStubCtor>;
let defaultCodex: ReturnType<typeof makeStubCtor>;

beforeEach(() => {
  defaultToolSan = makeStubCtor(19001);
  defaultCodex = makeStubCtor(19002);
});

function baseCtx(overrides: Partial<ProxyChainContext> = {}): ProxyChainContext {
  return {
    provider: 'gemini',
    useRemoteProxy: false,
    proxyConfig: makeProxyConfig(),
    cfg: makeCfg(),
    initialEnvVars: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317' },
    thinkingOverride: undefined,
    thinkingCfg: makeThinkingCfg(),
    verbose: false,
    log: () => {},
    _ToolSanitizationProxy: defaultToolSan.ctor as unknown as new (
      cfg: object
    ) => ToolSanitizationProxy,
    _CodexReasoningProxy: defaultCodex.ctor as unknown as new (cfg: object) => CodexReasoningProxy,
    ...overrides,
  };
}

// ── Tool sanitization: started when ANTHROPIC_BASE_URL set ───────────────────

describe('buildProxyChain — tool sanitization: started when ANTHROPIC_BASE_URL set', () => {
  it('starts proxy and returns instance + port', async () => {
    const { ctor, instance } = makeStubCtor(13001);

    const result = await buildProxyChain(baseCtx({ _ToolSanitizationProxy: ctor as never }));

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(result.toolSanitizationProxy).toBe(instance);
    expect(result.toolSanitizationPort).toBe(13001);
  });
});

// ── Tool sanitization: skipped when ANTHROPIC_BASE_URL absent ────────────────

describe('buildProxyChain — tool sanitization: skipped when no ANTHROPIC_BASE_URL', () => {
  it('returns null proxy and port without constructing', async () => {
    const { ctor } = makeStubCtor(13001);

    const result = await buildProxyChain(
      baseCtx({ initialEnvVars: {}, _ToolSanitizationProxy: ctor as never })
    );

    expect(ctor).not.toHaveBeenCalled();
    expect(result.toolSanitizationProxy).toBeNull();
    expect(result.toolSanitizationPort).toBeNull();
  });
});

// ── Tool sanitization: start failure swallowed ────────────────────────────────

describe('buildProxyChain — tool sanitization: start failure swallowed', () => {
  it('returns null and emits verbose warn without throwing', async () => {
    const { ctor } = makeFailCtor('port in use');
    const warnSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await buildProxyChain(
      baseCtx({ verbose: true, _ToolSanitizationProxy: ctor as never })
    );

    expect(result.toolSanitizationProxy).toBeNull();
    expect(result.toolSanitizationPort).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('port in use'));
    warnSpy.mockRestore();
  });
});

// ── Tool sanitization: schema sanitization only for non-Anthropic targets ────

describe('buildProxyChain — tool sanitization: schema sanitization by provider', () => {
  const sanitizeSchemasFor = async (overrides: Partial<ProxyChainContext>) => {
    const { ctor } = makeStubCtor(13001);
    await buildProxyChain(baseCtx({ ...overrides, _ToolSanitizationProxy: ctor as never }));
    return (ctor.mock.calls[0][0] as { sanitizeSchemas?: boolean }).sanitizeSchemas;
  };

  it('disables Gemini schema sanitization for single-provider claude', async () => {
    expect(await sanitizeSchemasFor({ provider: 'claude' })).toBe(false);
  });

  it('keeps schema sanitization for composite claude (tiers may route to Gemini)', async () => {
    expect(
      await sanitizeSchemasFor({ provider: 'claude', cfg: makeCfg({ isComposite: true }) })
    ).toBe(true);
  });

  it('keeps schema sanitization for gemini', async () => {
    expect(await sanitizeSchemasFor({ provider: 'gemini' })).toBe(true);
  });
});

// ── Codex reasoning: started for single-provider codex ───────────────────────

describe('buildProxyChain — codex reasoning: started for single-provider codex', () => {
  it('starts codex proxy and returns instance + port', async () => {
    const sanCtorPair = makeStubCtor(13010);
    const codexCtorPair = makeStubCtor(13011);

    const result = await buildProxyChain(
      baseCtx({
        provider: 'codex',
        cfg: makeCfg({ isComposite: false }),
        _ToolSanitizationProxy: sanCtorPair.ctor as never,
        _CodexReasoningProxy: codexCtorPair.ctor as never,
      })
    );

    expect(codexCtorPair.ctor).toHaveBeenCalledTimes(1);
    expect(result.codexReasoningProxy).toBe(codexCtorPair.instance);
    expect(result.codexReasoningPort).toBe(13011);
  });
});

// ── Codex reasoning: skipped for composite codex ─────────────────────────────

describe('buildProxyChain — codex reasoning: skipped for composite codex', () => {
  it('does not construct CodexReasoningProxy when cfg.isComposite is true', async () => {
    const { ctor } = makeStubCtor(13020);

    const result = await buildProxyChain(
      baseCtx({
        provider: 'codex',
        cfg: makeCfg({ isComposite: true }),
        _CodexReasoningProxy: ctor as never,
      })
    );

    expect(ctor).not.toHaveBeenCalled();
    expect(result.codexReasoningProxy).toBeNull();
    expect(result.codexReasoningPort).toBeNull();
  });
});

// ── Codex reasoning: skipped for non-codex provider ──────────────────────────

describe('buildProxyChain — codex reasoning: skipped for non-codex provider', () => {
  it('does not construct CodexReasoningProxy for gemini', async () => {
    const { ctor } = makeStubCtor(13030);

    await buildProxyChain(baseCtx({ provider: 'gemini', _CodexReasoningProxy: ctor as never }));

    expect(ctor).not.toHaveBeenCalled();
  });
});

// ── Codex reasoning: uses post-sanitization URL ───────────────────────────────

describe('buildProxyChain — codex reasoning: uses post-sanitization base URL', () => {
  it('passes http://127.0.0.1:<sanPort> as upstreamBaseUrl', async () => {
    const sanCtorPair = makeStubCtor(13040);
    const codexCtorPair = makeStubCtor(13041);

    await buildProxyChain(
      baseCtx({
        provider: 'codex',
        cfg: makeCfg({ isComposite: false }),
        _ToolSanitizationProxy: sanCtorPair.ctor as never,
        _CodexReasoningProxy: codexCtorPair.ctor as never,
      })
    );

    expect(codexCtorPair.ctor).toHaveBeenCalledWith(
      expect.objectContaining({ upstreamBaseUrl: 'http://127.0.0.1:13040' })
    );
  });
});

// ── Codex reasoning: start failure swallowed ─────────────────────────────────

describe('buildProxyChain — codex reasoning: start failure swallowed', () => {
  it('returns null codex proxy/port without throwing', async () => {
    const sanCtorPair = makeStubCtor(13050);
    const { ctor: codexFailCtor } = makeFailCtor('bind failed');

    const result = await buildProxyChain(
      baseCtx({
        provider: 'codex',
        cfg: makeCfg({ isComposite: false }),
        _ToolSanitizationProxy: sanCtorPair.ctor as never,
        _CodexReasoningProxy: codexFailCtor as never,
      })
    );

    expect(result.codexReasoningProxy).toBeNull();
    expect(result.codexReasoningPort).toBeNull();
  });
});

// ── All results null when no ANTHROPIC_BASE_URL ───────────────────────────────

describe('buildProxyChain — all results null when no ANTHROPIC_BASE_URL', () => {
  it('returns four nulls for gemini without base URL', async () => {
    const sanCtor = jest.fn();
    const codexCtor = jest.fn();

    const result = await buildProxyChain(
      baseCtx({
        initialEnvVars: {},
        _ToolSanitizationProxy: sanCtor as never,
        _CodexReasoningProxy: codexCtor as never,
      })
    );

    expect(sanCtor).not.toHaveBeenCalled();
    expect(codexCtor).not.toHaveBeenCalled();
    expect(result.toolSanitizationProxy).toBeNull();
    expect(result.toolSanitizationPort).toBeNull();
    expect(result.codexReasoningProxy).toBeNull();
    expect(result.codexReasoningPort).toBeNull();
  });
});
