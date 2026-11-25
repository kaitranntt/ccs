/**
 * Tests for Profile Mapper
 * Verifies syncable profile detection and ClaudeKey mapping.
 */

import { describe, it } from 'bun:test';
import * as assert from 'assert';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

describe('Profile Mapper', () => {
  const profileMapper = require('../../../../dist/cliproxy/sync/profile-mapper');
  const profileReader = require('../../../../dist/api/services/profile-reader');

  describe('mapProfileToClaudeKey', () => {
    it('returns null when env is missing', () => {
      const profile = { name: 'test', settingsPath: '/path', isConfigured: true };
      const result = profileMapper.mapProfileToClaudeKey(profile);
      assert.strictEqual(result, null);
    });

    it('returns null when ANTHROPIC_AUTH_TOKEN is missing', () => {
      const profile = {
        name: 'test',
        settingsPath: '/path',
        isConfigured: true,
        env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);
      assert.strictEqual(result, null);
    });

    it('generates ClaudeKey with correct prefix', () => {
      const profile = {
        name: 'glm',
        settingsPath: '/path',
        isConfigured: true,
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-test-key',
          ANTHROPIC_BASE_URL: 'https://api.example.com',
          ANTHROPIC_MODEL: 'gpt-4',
        },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);

      assert.ok(result, 'Should return ClaudeKey');
      assert.strictEqual(result['api-key'], 'sk-test-key');
      assert.strictEqual(result.prefix, 'glm-');
      assert.strictEqual(result['base-url'], 'https://api.example.com');
      assert.ok(result.models, 'Should have models');
      assert.strictEqual(result.models[0].name, 'gpt-4');
    });

    it('handles special characters in profile name', () => {
      const profile = {
        name: 'my@profile!',
        settingsPath: '/path',
        isConfigured: true,
        env: { ANTHROPIC_AUTH_TOKEN: 'sk-key' },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);

      assert.ok(result);
      assert.strictEqual(result.prefix, 'my-profile--');
    });

    it('omits base-url when not provided', () => {
      const profile = {
        name: 'test',
        settingsPath: '/path',
        isConfigured: true,
        env: { ANTHROPIC_AUTH_TOKEN: 'sk-key' },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);

      assert.ok(result);
      assert.strictEqual(result['base-url'], undefined);
    });

    it('appends ANTHROPIC_EXTRA_MODELS as additional models, deduped against primary and each other', () => {
      const profile = {
        name: 'dashscope',
        settingsPath: '/path',
        isConfigured: true,
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-test',
          ANTHROPIC_BASE_URL: 'https://api.example.com',
          ANTHROPIC_MODEL: 'qwen3-coder-plus',
          // Includes whitespace, empty entries, a duplicate of the primary
          // model, and a repeated extra entry — all should be cleaned up.
          ANTHROPIC_EXTRA_MODELS: ' glm-4.6 , kimi-k2 , ,qwen3-coder-plus, kimi-k2 ',
        },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);

      assert.ok(result, 'Should return ClaudeKey');
      assert.deepStrictEqual(result.models, [
        { name: 'qwen3-coder-plus', alias: '' },
        { name: 'glm-4.6', alias: '' },
        { name: 'kimi-k2', alias: '' },
      ]);
    });

    it('ignores empty ANTHROPIC_EXTRA_MODELS', () => {
      const profile = {
        name: 'test',
        settingsPath: '/path',
        isConfigured: true,
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-test',
          ANTHROPIC_MODEL: 'gpt-4',
          ANTHROPIC_EXTRA_MODELS: '   ',
        },
      };
      const result = profileMapper.mapProfileToClaudeKey(profile);

      assert.ok(result);
      assert.strictEqual(result.models.length, 1);
      assert.strictEqual(result.models[0].name, 'gpt-4');
    });
  });

  describe('loadSyncableProfiles', () => {
    it('returns an array', () => {
      const result = profileMapper.loadSyncableProfiles();
      assert.ok(Array.isArray(result), 'Should return an array');
    });

    it('filters out profiles with placeholder tokens', () => {
      // loadSyncableProfiles reads from disk, just verify it doesn't throw
      // and returns array (actual filtering tested via integration)
      const result = profileMapper.loadSyncableProfiles();
      assert.ok(Array.isArray(result));
    });

    it('uses profile-provided settingsPath instead of reconstructing from profile name', () => {
      const originalListApiProfiles = profileReader.listApiProfiles;
      const originalExistsSync = fs.existsSync;
      const originalReadFileSync = fs.readFileSync;

      const customSettingsPath = '/tmp/custom-sync-path.settings.json';
      const readPaths: string[] = [];

      try {
        profileReader.listApiProfiles = () => ({
          profiles: [
            {
              name: 'glm',
              settingsPath: customSettingsPath,
              isConfigured: true,
              configSource: 'legacy',
              target: 'claude',
            },
          ],
          variants: [],
        });

        fs.existsSync = (filePath: string) => filePath === customSettingsPath;
        fs.readFileSync = (filePath: string) => {
          readPaths.push(filePath);
          return JSON.stringify({
            env: {
              ANTHROPIC_AUTH_TOKEN: 'sk-test-key',
            },
          });
        };

        const result = profileMapper.loadSyncableProfiles();
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].settingsPath, customSettingsPath);
        assert.deepStrictEqual(readPaths, [customSettingsPath]);
      } finally {
        profileReader.listApiProfiles = originalListApiProfiles;
        fs.existsSync = originalExistsSync;
        fs.readFileSync = originalReadFileSync;
      }
    });

    it('skips profiles pinned to non-claude targets during local sync mapping', () => {
      const originalListApiProfiles = profileReader.listApiProfiles;
      const originalExistsSync = fs.existsSync;
      const originalReadFileSync = fs.readFileSync;

      const claudePath = '/tmp/claude-target.settings.json';
      const droidPath = '/tmp/droid-target.settings.json';
      const readPaths: string[] = [];

      try {
        profileReader.listApiProfiles = () => ({
          profiles: [
            {
              name: 'claude-profile',
              settingsPath: claudePath,
              isConfigured: true,
              configSource: 'legacy',
              target: 'claude',
            },
            {
              name: 'droid-profile',
              settingsPath: droidPath,
              isConfigured: true,
              configSource: 'legacy',
              target: 'droid',
            },
          ],
          variants: [],
        });

        fs.existsSync = (filePath: string) => filePath === claudePath || filePath === droidPath;
        fs.readFileSync = (filePath: string) => {
          readPaths.push(filePath);
          return JSON.stringify({
            env: {
              ANTHROPIC_AUTH_TOKEN: 'sk-test-key',
            },
          });
        };

        const result = profileMapper.loadSyncableProfiles();
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'claude-profile');
        assert.deepStrictEqual(readPaths, [claudePath]);
      } finally {
        profileReader.listApiProfiles = originalListApiProfiles;
        fs.existsSync = originalExistsSync;
        fs.readFileSync = originalReadFileSync;
      }
    });
  });

  describe('generateSyncPayload', () => {
    it('returns an array of ClaudeKey objects', () => {
      const result = profileMapper.generateSyncPayload();
      assert.ok(Array.isArray(result));
      // Each item should have api-key if present
      for (const key of result) {
        assert.ok(key['api-key'], 'Each key should have api-key');
        assert.ok(key.prefix, 'Each key should have prefix');
      }
    });
  });

  describe('generateSyncPreview', () => {
    it('returns an array of preview items', () => {
      const result = profileMapper.generateSyncPreview();
      assert.ok(Array.isArray(result));
      for (const item of result) {
        assert.ok(typeof item.name === 'string', 'Each item should have name');
      }
    });
  });

  describe('getSyncableProfileCount', () => {
    it('returns a number', () => {
      const result = profileMapper.getSyncableProfileCount();
      assert.ok(typeof result === 'number');
      assert.ok(result >= 0);
    });
  });
});
