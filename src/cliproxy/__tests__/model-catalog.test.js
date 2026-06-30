/**
 * Tests for CLIProxy Model Catalog
 * Verifies model database structure and lookup functions
 */

const assert = require('assert');

describe('Model Catalog', () => {
  const modelCatalog = require('../../../dist/cliproxy/model-catalog');

  describe('MODEL_CATALOG structure', () => {
    it('contains AGY provider catalog', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert(MODEL_CATALOG.agy, 'Should have agy provider');
      assert.strictEqual(MODEL_CATALOG.agy.provider, 'agy');
      assert.strictEqual(MODEL_CATALOG.agy.displayName, 'Antigravity');
    });

    it('contains Gemini provider catalog', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert(MODEL_CATALOG.gemini, 'Should have gemini provider');
      assert.strictEqual(MODEL_CATALOG.gemini.provider, 'gemini');
      assert.strictEqual(MODEL_CATALOG.gemini.displayName, 'Gemini');
    });

    it('contains Codex provider catalog', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert(MODEL_CATALOG.codex, 'Should have codex provider');
      assert.strictEqual(MODEL_CATALOG.codex.provider, 'codex');
      assert.strictEqual(MODEL_CATALOG.codex.displayName, 'Copilot Codex');
    });

    it('does not contain qwen (not configurable)', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.qwen, undefined);
    });
  });

  describe('Kimi models', () => {
    it('contains Kimi provider catalog', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert(MODEL_CATALOG.kimi, 'Should have kimi provider');
      assert.strictEqual(MODEL_CATALOG.kimi.provider, 'kimi');
      assert.strictEqual(MODEL_CATALOG.kimi.displayName, 'Kimi (Moonshot)');
    });

    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.kimi.defaultModel, 'kimi-k2.5');
    });

    it('includes K2.5, K2 Thinking, K2', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const ids = MODEL_CATALOG.kimi.models.map((m) => m.id);
      assert(ids.includes('kimi-k2.5'), 'Should include kimi-k2.5');
      assert(ids.includes('kimi-k2-thinking'), 'Should include kimi-k2-thinking');
      assert(ids.includes('kimi-k2'), 'Should include kimi-k2');
    });

    it('has 3 models total', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.kimi.models.length, 3);
    });
  });

  describe('AGY models', () => {
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.agy.defaultModel, 'claude-opus-4-6-thinking');
    });

    it('includes Claude Opus 4.6 Thinking', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus = MODEL_CATALOG.agy.models.find((m) => m.id === 'claude-opus-4-6-thinking');
      assert(opus, 'Should include Claude Opus 4.6 Thinking');
      assert.strictEqual(opus.name, 'Claude Opus 4.6 Thinking');
    });

    it('includes Claude Sonnet 4.6', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnet = MODEL_CATALOG.agy.models.find((m) => m.id === 'claude-sonnet-4-6');
      assert(sonnet, 'Should include Claude Sonnet 4.6');
      assert.strictEqual(sonnet.name, 'Claude Sonnet 4.6');
    });

    it('does not include deprecated Claude 4.5 AGY models', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const ids = MODEL_CATALOG.agy.models.map((m) => m.id);
      assert.strictEqual(ids.includes('claude-opus-4-5-thinking'), false);
      assert.strictEqual(ids.includes('claude-sonnet-4-5-thinking'), false);
      assert.strictEqual(ids.includes('claude-sonnet-4-5'), false);
    });

    it('includes Gemini 3.1 Pro High via Antigravity', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem3 = MODEL_CATALOG.agy.models.find((m) => m.id === 'gemini-3.1-pro-high');
      assert(gem3, 'Should include Gemini 3.1 Pro High');
      assert.strictEqual(gem3.name, 'Gemini 3.1 Pro High');
      // AGY models are all free - no paid tier
      assert.strictEqual(gem3.tier, undefined, 'AGY models should not have paid tier');
    });

    it('includes Gemini 3.1 Pro Low via Antigravity', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem3 = MODEL_CATALOG.agy.models.find((m) => m.id === 'gemini-3.1-pro-low');
      assert(gem3, 'Should include Gemini 3.1 Pro Low');
      assert.strictEqual(gem3.name, 'Gemini 3.1 Pro Low');
      // AGY models are all free - no paid tier
      assert.strictEqual(gem3.tier, undefined, 'AGY models should not have paid tier');
    });

    it('includes Gemini Flash via Antigravity', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const flash = MODEL_CATALOG.agy.models.find((m) => m.id === 'gemini-3-1-flash-preview');
      assert(flash, 'Should include Gemini Flash');
      assert.strictEqual(flash.name, 'Gemini Flash');
      assert.strictEqual(flash.tier, undefined, 'AGY models should not have paid tier');
    });

    it('has 5 models total', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.agy.models.length, 5);
    });
  });

  describe('Claude models', () => {
    it('contains Claude provider catalog', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert(MODEL_CATALOG.claude, 'Should have Claude provider');
      assert.strictEqual(MODEL_CATALOG.claude.provider, 'claude');
      assert.strictEqual(MODEL_CATALOG.claude.displayName, 'Claude (Anthropic)');
    });
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.claude.defaultModel, 'claude-sonnet-4-6');
    });

    it('includes Claude Sonnet 4.6', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnet = MODEL_CATALOG.claude.models.find((m) => m.id === 'claude-sonnet-4-6');
      assert(sonnet, 'Should include Claude Sonnet 4.6');
      assert.strictEqual(sonnet.name, 'Claude Sonnet 4.6');
    });

    it('includes Claude Opus 4.7 with provider-specific settings', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus47 = MODEL_CATALOG.claude.models.find((m) => m.id === 'claude-opus-4-7');
      assert(opus47, 'Should include Claude Opus 4.7');
      assert.strictEqual(opus47.name, 'Claude Opus 4.7');
      // Opus 4.7 requires adaptive thinking (type: 'levels'); manual budget_tokens
      // is rejected by the Anthropic API with 400. Extended (1M) context is available.
      assert.strictEqual(opus47.thinking.type, 'levels');
      assert.deepStrictEqual(opus47.thinking.levels, ['low', 'medium', 'high', 'xhigh', 'max']);
      assert.strictEqual(opus47.thinking.maxLevel, 'max');
      assert.strictEqual(opus47.extendedContext, true);
    });

    it('includes Claude Opus 4.8 with adaptive levels and extended context', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus48 = MODEL_CATALOG.claude.models.find((m) => m.id === 'claude-opus-4-8');
      assert(opus48, 'Should include Claude Opus 4.8');
      assert.strictEqual(opus48.name, 'Claude Opus 4.8');
      // Mirrors 4.7: Anthropic only accepts adaptive thinking levels on the
      // current Opus generation; budget_tokens is rejected with 400.
      assert.strictEqual(opus48.thinking.type, 'levels');
      assert.deepStrictEqual(opus48.thinking.levels, ['low', 'medium', 'high', 'xhigh', 'max']);
      assert.strictEqual(opus48.thinking.maxLevel, 'max');
      assert.strictEqual(opus48.extendedContext, true);
    });

    it('includes Claude Fable 5 with adaptive levels and extended context', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const fable5 = MODEL_CATALOG.claude.models.find((m) => m.id === 'claude-fable-5');
      assert(fable5, 'Should include Claude Fable 5');
      assert.strictEqual(fable5.name, 'Claude Fable 5');
      // New top tier above Opus; same adaptive thinking surface as Opus 4.8:
      // Anthropic only accepts effort levels, budget_tokens is rejected with 400.
      assert.strictEqual(fable5.thinking.type, 'levels');
      assert.deepStrictEqual(fable5.thinking.levels, ['low', 'medium', 'high', 'xhigh', 'max']);
      assert.strictEqual(fable5.thinking.maxLevel, 'max');
      assert.strictEqual(fable5.extendedContext, true);
    });

    it('retains previous 4.5 snapshot models for explicit selection', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const ids = MODEL_CATALOG.claude.models.map((m) => m.id);
      assert(ids.includes('claude-opus-4-5-20251101'));
      assert(ids.includes('claude-sonnet-4-5-20250929'));
    });
  });

  describe('Gemini models', () => {
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.gemini.defaultModel, 'gemini-2.5-pro');
    });

    it('includes Gemini 3.1 Pro with pro tier', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem3 = MODEL_CATALOG.gemini.models.find((m) => m.id === 'gemini-3.1-pro-preview');
      assert(gem3, 'Should include Gemini 3.1 Pro');
      assert.strictEqual(gem3.name, 'Gemini 3.1 Pro');
      assert.strictEqual(gem3.tier, 'pro');
    });

    it('includes Gemini 2.5 Pro without tier (free)', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem25 = MODEL_CATALOG.gemini.models.find((m) => m.id === 'gemini-2.5-pro');
      assert(gem25, 'Should include Gemini 2.5 Pro');
      assert.strictEqual(gem25.name, 'Gemini 2.5 Pro');
      assert.strictEqual(gem25.tier, undefined);
    });

    it('includes Gemini Flash with pro tier', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const flash = MODEL_CATALOG.gemini.models.find((m) => m.id === 'gemini-3-flash-preview');
      assert(flash, 'Should include Gemini Flash');
      assert.strictEqual(flash.name, 'Gemini Flash');
      assert.strictEqual(flash.tier, 'pro');
    });

    it('has 3 models total', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.gemini.models.length, 3);
    });
  });

  describe('Codex models', () => {
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.codex.defaultModel, 'gpt-5.4');
    });

    it('advertises the current official Codex model set', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const ids = MODEL_CATALOG.codex.models.map((m) => m.id);
      assert.deepStrictEqual(ids, [
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.3-codex',
        'gpt-5.3-codex-spark',
        'gpt-5.2',
      ]);
    });
  });

  describe('supportsModelConfig', () => {
    it('returns true for agy', () => {
      const { supportsModelConfig } = modelCatalog;
      assert.strictEqual(supportsModelConfig('agy'), true);
    });

    it('returns true for gemini', () => {
      const { supportsModelConfig } = modelCatalog;
      assert.strictEqual(supportsModelConfig('gemini'), true);
    });

    it('returns true for codex', () => {
      const { supportsModelConfig } = modelCatalog;
      assert.strictEqual(supportsModelConfig('codex'), true);
    });

    it('returns true for kimi', () => {
      const { supportsModelConfig } = modelCatalog;
      assert.strictEqual(supportsModelConfig('kimi'), true);
    });

    it('returns false for qwen', () => {
      const { supportsModelConfig } = modelCatalog;
      assert.strictEqual(supportsModelConfig('qwen'), false);
    });
  });

  describe('getProviderCatalog', () => {
    it('returns catalog for agy', () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('agy');
      assert(catalog, 'Should return catalog');
      assert.strictEqual(catalog.provider, 'agy');
      assert(Array.isArray(catalog.models));
    });

    it('returns catalog for gemini', () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('gemini');
      assert(catalog, 'Should return catalog');
      assert.strictEqual(catalog.provider, 'gemini');
    });

    it('returns catalog for codex', () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('codex');
      assert(catalog, 'Should return catalog');
      assert.strictEqual(catalog.provider, 'codex');
      assert(Array.isArray(catalog.models));
    });

    it('returns catalog for kimi', () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('kimi');
      assert(catalog, 'Should return catalog');
      assert.strictEqual(catalog.provider, 'kimi');
      assert(Array.isArray(catalog.models));
    });
  });

  describe('findModel', () => {
    it('finds Claude Opus 4.7 in claude', () => {
      const { findModel } = modelCatalog;
      const model = findModel('claude', 'claude-opus-4-7');
      assert(model, 'Should find model');
      assert.strictEqual(model.name, 'Claude Opus 4.7');
    });

    it('finds Claude Opus 4.6 Thinking in agy', () => {
      const { findModel } = modelCatalog;
      const model = findModel('agy', 'claude-opus-4-6-thinking');
      assert(model, 'Should find model');
      assert.strictEqual(model.name, 'Claude Opus 4.6 Thinking');
    });

    it('finds Gemini 2.5 Pro in gemini', () => {
      const { findModel } = modelCatalog;
      const model = findModel('gemini', 'gemini-2.5-pro');
      assert(model, 'Should find model');
      assert.strictEqual(model.name, 'Gemini 2.5 Pro');
    });

    it('maps legacy AGY 4.5 IDs to supported 4.6 models', () => {
      const { findModel } = modelCatalog;
      const legacyOpus = findModel('agy', 'claude-opus-4-5-thinking');
      const legacySonnetThinking = findModel('agy', 'claude-sonnet-4-5-thinking');
      const legacySonnet = findModel('agy', 'claude-sonnet-4-5');
      assert.strictEqual(legacyOpus?.id, 'claude-opus-4-6-thinking');
      assert.strictEqual(legacySonnetThinking?.id, 'claude-sonnet-4-6');
      assert.strictEqual(legacySonnet?.id, 'claude-sonnet-4-6');
    });

    it('maps legacy Antigravity Gemini Pro aliases onto the current 3.1 high/low models', () => {
      const { findModel, getSuggestedReplacementModel } = modelCatalog;
      const legacyAgyGemini = findModel('agy', 'gemini-3-pro-preview');
      const legacyAgyGeminiLow = findModel('agy', 'gemini-3-pro-low');
      const legacyGemini = findModel('gemini', 'gemini-3-pro-preview');
      const currentGemini = findModel('gemini', 'gemini-3.1-pro-preview');

      assert.strictEqual(legacyAgyGemini?.id, 'gemini-3.1-pro-high');
      assert.strictEqual(legacyAgyGeminiLow?.id, 'gemini-3.1-pro-low');
      assert.strictEqual(legacyGemini?.id, 'gemini-3.1-pro-preview');
      assert.strictEqual(currentGemini?.id, 'gemini-3.1-pro-preview');
      assert.strictEqual(
        getSuggestedReplacementModel('gemini', 'gemini-3.1-pro-preview'),
        'gemini-2.5-pro'
      );
    });

    it('falls back to the next supported model when the default is excluded', () => {
      const { getSuggestedReplacementModel } = modelCatalog;

      expect(getSuggestedReplacementModel('agy', 'claude-opus-4-6-thinking')).toBe(
        'claude-sonnet-4-6'
      );
      expect(getSuggestedReplacementModel('agy')).toBe('claude-opus-4-6-thinking');
    });

    it('returns undefined when no provider catalog exists', () => {
      const { getSuggestedReplacementModel } = modelCatalog;

      expect(getSuggestedReplacementModel('qwen')).toBeUndefined();
    });

    it('returns undefined for unknown model', () => {
      const { findModel } = modelCatalog;
      const model = findModel('agy', 'unknown-model');
      assert.strictEqual(model, undefined);
    });

    it('returns undefined for unsupported provider', () => {
      const { findModel } = modelCatalog;
      const model = findModel('codex', 'any-model');
      assert.strictEqual(model, undefined);
    });
  });

  describe('Model entry structure', () => {
    it('all models have required fields', () => {
      const { MODEL_CATALOG } = modelCatalog;

      for (const [provider, catalog] of Object.entries(MODEL_CATALOG)) {
        for (const model of catalog.models) {
          assert(model.id, `Model in ${provider} should have id`);
          assert(typeof model.id === 'string', `Model id should be string`);
          assert(model.name, `Model ${model.id} should have name`);
          assert(typeof model.name === 'string', `Model name should be string`);
          // tier is optional
          if (model.tier !== undefined) {
            assert(['free', 'pro', 'ultra'].includes(model.tier), `Invalid tier: ${model.tier}`);
          }
        }
      }
    });

    it('all model IDs are unique within provider', () => {
      const { MODEL_CATALOG } = modelCatalog;

      for (const [provider, catalog] of Object.entries(MODEL_CATALOG)) {
        const ids = catalog.models.map((m) => m.id);
        const uniqueIds = new Set(ids);
        assert.strictEqual(ids.length, uniqueIds.size, `Duplicate model IDs in ${provider}`);
      }
    });

    it('default model exists in models array', () => {
      const { MODEL_CATALOG } = modelCatalog;

      for (const [provider, catalog] of Object.entries(MODEL_CATALOG)) {
        const defaultExists = catalog.models.some((m) => m.id === catalog.defaultModel);
        assert(defaultExists, `Default model ${catalog.defaultModel} not found in ${provider}`);
      }
    });
  });

  describe('Thinking models ordering', () => {
    it('Claude Opus 4.6 Thinking is not deprecated', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus = MODEL_CATALOG.agy.models.find((m) => m.id === 'claude-opus-4-6-thinking');
      assert(opus, 'Should include Claude Opus 4.6 Thinking');
      assert.strictEqual(opus.deprecated, undefined, 'Should not be marked as deprecated');
    });

    it('Claude Sonnet 4.6 is not deprecated', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnetThinking = MODEL_CATALOG.agy.models.find((m) => m.id === 'claude-sonnet-4-6');
      assert(sonnetThinking, 'Should include Claude Sonnet 4.6');
      assert.strictEqual(
        sonnetThinking.deprecated,
        undefined,
        'Should not be marked as deprecated'
      );
    });

    it('thinking models are at the top of the list', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const models = MODEL_CATALOG.agy.models;

      // Find indices of thinking models
      const opusIdx = models.findIndex((m) => m.id === 'claude-opus-4-6-thinking');
      const sonnetThinkingIdx = models.findIndex((m) => m.id === 'claude-sonnet-4-6');

      // Find indices of the remaining non-Claude model
      const geminiIdx = models.findIndex((m) => m.id === 'gemini-3.1-pro-high');

      // Primary Claude choices should appear ahead of Gemini fallback.
      assert(opusIdx < geminiIdx, 'Opus should be above Gemini');
      assert(sonnetThinkingIdx < geminiIdx, 'Sonnet should be above Gemini');
    });
  });

  describe('isModelDeprecated', () => {
    it('returns false for active AGY Claude models', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'claude-opus-4-6-thinking'), false);
      assert.strictEqual(isModelDeprecated('agy', 'claude-sonnet-4-6'), false);
    });

    it('returns false for non-deprecated models', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'gemini-3-pro-preview'), false);
    });

    it('returns false for unknown models', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'unknown-model'), false);
    });
  });

  describe('getModelDeprecationReason', () => {
    it('returns undefined for active AGY Claude models', () => {
      const { getModelDeprecationReason } = modelCatalog;
      assert.strictEqual(getModelDeprecationReason('agy', 'claude-opus-4-6-thinking'), undefined);
      assert.strictEqual(getModelDeprecationReason('agy', 'claude-sonnet-4-6'), undefined);
    });

    it('returns undefined for non-deprecated models', () => {
      const { getModelDeprecationReason } = modelCatalog;
      assert.strictEqual(getModelDeprecationReason('agy', 'gemini-3-pro-preview'), undefined);
    });
  });
});
