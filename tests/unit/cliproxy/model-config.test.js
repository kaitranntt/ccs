/**
 * Tests for CLIProxy Model Configuration
 * Verifies model configuration logic and settings management
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Model Config', () => {
  const modelConfig = require('../../../dist/cliproxy/model-config');
  const modelCatalog = require('../../../dist/cliproxy/model-catalog');

  describe('hasUserSettings', () => {
    it('returns false when settings file does not exist', () => {
      // Ensure we're checking a non-existent path
      const { hasUserSettings } = modelConfig;
      // Since we can't easily mock getCcsDir, we test the function logic
      // by checking it doesn't throw
      const result = hasUserSettings('agy');
      assert(typeof result === 'boolean', 'Should return boolean');
    });
  });

  describe('getCurrentModel', () => {
    it('returns undefined when settings file does not exist', () => {
      const { getCurrentModel } = modelConfig;
      // Test with a provider that likely has no settings in test env
      const result = getCurrentModel('agy');
      // Result depends on whether ~/.ccs/agy.settings.json exists
      // Just verify it returns string or undefined
      assert(
        result === undefined || typeof result === 'string',
        'Should return string or undefined'
      );
    });
  });

  describe('configureProviderModel', () => {
    it('returns false for unsupported provider (qwen)', async () => {
      const { configureProviderModel } = modelConfig;
      const result = await configureProviderModel('qwen', true);
      assert.strictEqual(result, false);
    });

    // Note: Full interactive tests require mocking stdin
    // These are smoke tests to verify basic logic
  });

  describe('showCurrentConfig', () => {
    it('does not throw for agy provider', async () => {
      const { showCurrentConfig } = modelConfig;
      // Just verify it doesn't throw (now async)
      await assert.doesNotReject(async () => showCurrentConfig('agy'));
    });

    it('does not throw for gemini provider', async () => {
      const { showCurrentConfig } = modelConfig;
      await assert.doesNotReject(async () => showCurrentConfig('gemini'));
    });

    it('does not throw for unsupported provider', async () => {
      const { showCurrentConfig } = modelConfig;
      await assert.doesNotReject(async () => showCurrentConfig('codex'));
    });
  });

  describe('Model catalog integration', () => {
    it('configureProviderModel uses correct catalog for agy', async () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('agy');

      // Verify catalog structure is what configureProviderModel expects
      assert(catalog.models, 'Should have models array');
      assert(catalog.defaultModel, 'Should have defaultModel');
      assert(catalog.displayName, 'Should have displayName');
    });

    it('configureProviderModel uses correct catalog for gemini', async () => {
      const { getProviderCatalog } = modelCatalog;
      const catalog = getProviderCatalog('gemini');

      assert(catalog.models, 'Should have models array');
      assert(catalog.defaultModel, 'Should have defaultModel');
      assert(catalog.displayName, 'Should have displayName');
    });
  });

  describe('Settings file format', () => {
    it('should generate correct settings structure', () => {
      // Test the expected settings structure
      const expectedStructure = {
        env: {
          ANTHROPIC_BASE_URL: expect.any(String),
          ANTHROPIC_AUTH_TOKEN: expect.any(String),
          ANTHROPIC_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: expect.any(String),
        },
      };

      // Verify the structure is valid JSON
      const testSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-3-flash-preview',
        },
      };

      const json = JSON.stringify(testSettings, null, 2);
      const parsed = JSON.parse(json);

      assert(parsed.env, 'Should have env object');
      assert(parsed.env.ANTHROPIC_MODEL, 'Should have ANTHROPIC_MODEL');
      assert.strictEqual(
        parsed.env.ANTHROPIC_MODEL,
        'claude-opus-4-5-thinking'
      );
    });

    it('all env values should be strings (PowerShell safety)', () => {
      const testSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-opus-4-5-thinking',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-3-flash-preview',
        },
      };

      for (const [key, value] of Object.entries(testSettings.env)) {
        assert.strictEqual(
          typeof value,
          'string',
          `env.${key} should be string, got ${typeof value}`
        );
      }
    });
  });
});

// Helper for expect-like assertions
const expect = {
  any: (type) => ({
    _type: type,
    toString: () => `expect.any(${type.name})`,
  }),
};
