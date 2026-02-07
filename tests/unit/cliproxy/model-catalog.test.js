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

  describe('AGY models', () => {
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.agy.defaultModel, 'gemini-claude-opus-4-6-thinking');
    });

    it('includes Claude Opus 4.5 Thinking', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus = MODEL_CATALOG.agy.models.find(
        (m) => m.id === 'gemini-claude-opus-4-5-thinking'
      );
      assert(opus, 'Should include Claude Opus 4.5 Thinking');
      assert.strictEqual(opus.name, 'Claude Opus 4.5 Thinking');
    });

    it('includes Claude Sonnet 4.5 Thinking', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnetThinking = MODEL_CATALOG.agy.models.find(
        (m) => m.id === 'gemini-claude-sonnet-4-5-thinking'
      );
      assert(sonnetThinking, 'Should include Claude Sonnet 4.5 Thinking');
      assert.strictEqual(sonnetThinking.name, 'Claude Sonnet 4.5 Thinking');
    });

    it('includes Claude Sonnet 4.5', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnet = MODEL_CATALOG.agy.models.find((m) => m.id === 'gemini-claude-sonnet-4-5');
      assert(sonnet, 'Should include Claude Sonnet 4.5');
      assert.strictEqual(sonnet.name, 'Claude Sonnet 4.5');
    });

    it('includes Gemini 3 Pro (free via Antigravity)', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem3 = MODEL_CATALOG.agy.models.find((m) => m.id === 'gemini-3-pro-preview');
      assert(gem3, 'Should include Gemini 3 Pro');
      assert.strictEqual(gem3.name, 'Gemini 3 Pro');
      // AGY models are all free - no paid tier
      assert.strictEqual(gem3.tier, undefined, 'AGY models should not have paid tier');
    });

    it('has 5 models total', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.agy.models.length, 5);
    });
  });

  describe('Gemini models', () => {
    it('has correct default model', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.gemini.defaultModel, 'gemini-2.5-pro');
    });

    it('includes Gemini 3 Pro with pro tier', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem3 = MODEL_CATALOG.gemini.models.find((m) => m.id === 'gemini-3-pro-preview');
      assert(gem3, 'Should include Gemini 3 Pro');
      assert.strictEqual(gem3.name, 'Gemini 3 Pro');
      assert.strictEqual(gem3.tier, 'pro');
    });

    it('includes Gemini 2.5 Pro without tier (free)', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const gem25 = MODEL_CATALOG.gemini.models.find((m) => m.id === 'gemini-2.5-pro');
      assert(gem25, 'Should include Gemini 2.5 Pro');
      assert.strictEqual(gem25.name, 'Gemini 2.5 Pro');
      assert.strictEqual(gem25.tier, undefined);
    });

    it('has 2 models total', () => {
      const { MODEL_CATALOG } = modelCatalog;
      assert.strictEqual(MODEL_CATALOG.gemini.models.length, 2);
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
  });

  describe('findModel', () => {
    it('finds Claude Opus 4.5 Thinking in agy', () => {
      const { findModel } = modelCatalog;
      const model = findModel('agy', 'gemini-claude-opus-4-5-thinking');
      assert(model, 'Should find model');
      assert.strictEqual(model.name, 'Claude Opus 4.5 Thinking');
    });

    it('finds Gemini 2.5 Pro in gemini', () => {
      const { findModel } = modelCatalog;
      const model = findModel('gemini', 'gemini-2.5-pro');
      assert(model, 'Should find model');
      assert.strictEqual(model.name, 'Gemini 2.5 Pro');
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
    it('Claude Opus 4.5 Thinking is not deprecated', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const opus = MODEL_CATALOG.agy.models.find(
        (m) => m.id === 'gemini-claude-opus-4-5-thinking'
      );
      assert(opus, 'Should include Claude Opus 4.5 Thinking');
      assert.strictEqual(opus.deprecated, undefined, 'Should not be marked as deprecated');
    });

    it('Claude Sonnet 4.5 Thinking is not deprecated', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const sonnetThinking = MODEL_CATALOG.agy.models.find(
        (m) => m.id === 'gemini-claude-sonnet-4-5-thinking'
      );
      assert(sonnetThinking, 'Should include Claude Sonnet 4.5 Thinking');
      assert.strictEqual(sonnetThinking.deprecated, undefined, 'Should not be marked as deprecated');
    });

    it('thinking models are at the top of the list', () => {
      const { MODEL_CATALOG } = modelCatalog;
      const models = MODEL_CATALOG.agy.models;

      // Find indices of thinking models
      const opusIdx = models.findIndex((m) => m.id === 'gemini-claude-opus-4-5-thinking');
      const sonnetThinkingIdx = models.findIndex(
        (m) => m.id === 'gemini-claude-sonnet-4-5-thinking'
      );

      // Find indices of non-thinking models
      const sonnetIdx = models.findIndex((m) => m.id === 'gemini-claude-sonnet-4-5');
      const geminiIdx = models.findIndex((m) => m.id === 'gemini-3-pro-preview');

      // Thinking models should come before non-thinking models
      assert(opusIdx < sonnetIdx, 'Opus Thinking should be above non-thinking Sonnet');
      assert(opusIdx < geminiIdx, 'Opus Thinking should be above non-thinking Gemini');
      assert(
        sonnetThinkingIdx < sonnetIdx,
        'Sonnet Thinking should be above non-thinking Sonnet'
      );
      assert(
        sonnetThinkingIdx < geminiIdx,
        'Sonnet Thinking should be above non-thinking Gemini'
      );
    });
  });

  describe('isModelDeprecated', () => {
    it('returns false for thinking models (no longer deprecated)', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'gemini-claude-opus-4-5-thinking'), false);
      assert.strictEqual(isModelDeprecated('agy', 'gemini-claude-sonnet-4-5-thinking'), false);
    });

    it('returns false for non-deprecated models', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'gemini-claude-sonnet-4-5'), false);
      assert.strictEqual(isModelDeprecated('agy', 'gemini-3-pro-preview'), false);
    });

    it('returns false for unknown models', () => {
      const { isModelDeprecated } = modelCatalog;
      assert.strictEqual(isModelDeprecated('agy', 'unknown-model'), false);
    });
  });

  describe('getModelDeprecationReason', () => {
    it('returns undefined for thinking models (no longer deprecated)', () => {
      const { getModelDeprecationReason } = modelCatalog;
      assert.strictEqual(getModelDeprecationReason('agy', 'gemini-claude-opus-4-5-thinking'), undefined);
      assert.strictEqual(getModelDeprecationReason('agy', 'gemini-claude-sonnet-4-5-thinking'), undefined);
    });

    it('returns undefined for non-deprecated models', () => {
      const { getModelDeprecationReason } = modelCatalog;
      assert.strictEqual(getModelDeprecationReason('agy', 'gemini-claude-sonnet-4-5'), undefined);
    });
  });
});
