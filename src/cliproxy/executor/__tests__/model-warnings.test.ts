/**
 * Tests for model-warnings.ts — Phase 08
 *
 * Verifies that warnBrokenModels emits warnings for broken models and is
 * silent for healthy ones, covering both simple and composite providers.
 */

import { afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

// ── Stubs ─────────────────────────────────────────────────────────────────────

// getCurrentModel: return whatever the test configures
const mockGetCurrentModel = jest.fn<string | undefined, [string, string | undefined]>();
// isModelBroken: return false by default
const mockIsModelBroken = jest.fn<boolean, [string, string]>().mockReturnValue(false);
const mockGetModelIssueUrl = jest
  .fn<string | undefined, [string, string]>()
  .mockReturnValue(undefined);
const mockFindModel = jest
  .fn<{ name: string } | undefined, [string, string]>()
  .mockReturnValue(undefined);
const mockGetSuggestedReplacementModel = jest
  .fn<string | undefined, [string, string]>()
  .mockReturnValue(undefined);

mock.module('../../config/model-config', () => ({
  getCurrentModel: mockGetCurrentModel,
}));

mock.module('../../model-catalog', () => ({
  isModelBroken: mockIsModelBroken,
  getModelIssueUrl: mockGetModelIssueUrl,
  findModel: mockFindModel,
  getSuggestedReplacementModel: mockGetSuggestedReplacementModel,
}));

import type { ExecutorConfig } from '../../types';

const { warnBrokenModels } = await import('../model-warnings');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSimpleCfg(overrides: Partial<ExecutorConfig> = {}): ExecutorConfig {
  return {
    port: 8317,
    timeout: 5000,
    verbose: false,
    pollInterval: 100,
    isComposite: false,
    ...overrides,
  } as ExecutorConfig;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('warnBrokenModels', () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockGetCurrentModel.mockReset();
    mockIsModelBroken.mockReturnValue(false);
    mockGetModelIssueUrl.mockReturnValue(undefined);
    mockFindModel.mockReturnValue(undefined);
    mockGetSuggestedReplacementModel.mockReturnValue(undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not warn when no model is configured', () => {
    mockGetCurrentModel.mockReturnValue(undefined);

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not warn when model is healthy', () => {
    mockGetCurrentModel.mockReturnValue('gemini-2.5-pro');
    mockIsModelBroken.mockReturnValue(false);

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('warns when model is broken (no replacement, no issue url)', () => {
    mockGetCurrentModel.mockReturnValue('gemini-old');
    mockIsModelBroken.mockReturnValue(true);
    mockFindModel.mockReturnValue({ name: 'Gemini Old' } as { name: string });

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('has known issues with Claude Code'))).toBe(true);
    expect(calls.some((m) => m.includes('Tool calls will fail'))).toBe(true);
  });

  it('includes replacement model suggestion when available', () => {
    mockGetCurrentModel.mockReturnValue('gemini-old');
    mockIsModelBroken.mockReturnValue(true);
    mockGetSuggestedReplacementModel.mockReturnValue('gemini-2.5-pro');

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('gemini-2.5-pro'))).toBe(true);
  });

  it('includes tracking URL when issue url is available', () => {
    mockGetCurrentModel.mockReturnValue('gemini-old');
    mockIsModelBroken.mockReturnValue(true);
    mockGetModelIssueUrl.mockReturnValue('https://github.com/issues/123');

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('https://github.com/issues/123'))).toBe(true);
  });

  it('includes remote proxy note when skipLocalAuth=true', () => {
    mockGetCurrentModel.mockReturnValue('gemini-old');
    mockIsModelBroken.mockReturnValue(true);

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: true,
    });

    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('remote proxy'))).toBe(true);
  });

  it('includes --config suggestion when skipLocalAuth=false', () => {
    mockGetCurrentModel.mockReturnValue('gemini-old');
    mockIsModelBroken.mockReturnValue(true);

    warnBrokenModels({
      provider: 'gemini',
      cfg: makeSimpleCfg(),
      compositeProviders: [],
      skipLocalAuth: false,
    });

    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('--config'))).toBe(true);
  });

  describe('composite variants', () => {
    function makeCompositeCfg(): ExecutorConfig {
      return {
        port: 8317,
        timeout: 5000,
        verbose: false,
        pollInterval: 100,
        isComposite: true,
        compositeTiers: {
          opus: { provider: 'gemini', model: 'gemini-opus-old' },
          sonnet: { provider: 'gemini', model: 'gemini-sonnet-ok' },
          haiku: { provider: 'gemini', model: 'gemini-haiku-ok' },
        },
      } as unknown as ExecutorConfig;
    }

    it('warns for broken composite tier', () => {
      mockIsModelBroken.mockImplementation((_p, m) => m === 'gemini-opus-old');
      mockFindModel.mockReturnValue({ name: 'Gemini Opus Old' } as { name: string });

      warnBrokenModels({
        provider: 'gemini',
        cfg: makeCompositeCfg(),
        compositeProviders: ['gemini'],
        skipLocalAuth: false,
      });

      const calls = errorSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((m) => m.includes('opus tier'))).toBe(true);
    });

    it('does not warn for healthy composite tiers', () => {
      mockIsModelBroken.mockReturnValue(false);

      warnBrokenModels({
        provider: 'gemini',
        cfg: makeCompositeCfg(),
        compositeProviders: ['gemini'],
        skipLocalAuth: false,
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
