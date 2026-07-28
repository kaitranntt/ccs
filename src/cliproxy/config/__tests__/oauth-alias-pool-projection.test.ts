import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'bun:test';
import type { CompositeTierConfig } from '../../../config/schemas/cliproxy';
import {
  DuplicateOAuthAliasPoolHopError,
  OrderedOAuthAliasPoolUnsupportedError,
  buildOrderedOAuthAliasPool,
  generateOrderedOAuthAliasPoolYaml,
  regenerateConfig,
} from '../generator';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('ordered OAuth alias-pool projection', () => {
  it('builds a two-channel chain in primary-first order', () => {
    // Given
    const tier: CompositeTierConfig = {
      provider: 'claude',
      model: 'claude-opus-4-8',
      fallback_chain: [{ provider: 'codex', model: 'gpt-5.5' }],
    };

    // When
    const pool = buildOrderedOAuthAliasPool('ccs-opus', tier);

    // Then
    expect(pool.hops).toEqual([
      { channel: 'claude', model: 'claude-opus-4-8' },
      { channel: 'codex', model: 'gpt-5.5' },
    ]);
  });

  it('emits channel entries in exact quality-and-cost order', () => {
    // Given
    const pool = buildOrderedOAuthAliasPool('ccs-plan', {
      provider: 'claude',
      model: 'claude-opus-4-8',
      fallback_chain: [
        { provider: 'codex', model: 'gpt-5.5' },
        { provider: 'kimi', model: 'kimi-k2.7-code' },
      ],
    });

    // When
    const yaml = generateOrderedOAuthAliasPoolYaml(pool, { kind: 'ordered' });

    // Then
    expect(yaml.indexOf('  claude:')).toBeLessThan(yaml.indexOf('  codex:'));
    expect(yaml.indexOf('  codex:')).toBeLessThan(yaml.indexOf('  kimi:'));
  });

  it('rejects duplicate provider and model hops', () => {
    // Given
    const tier: CompositeTierConfig = {
      provider: 'claude',
      model: 'claude-opus-4-8',
      fallback_chain: [{ provider: 'claude', model: 'claude-opus-4-8' }],
    };

    // When / Then
    expect(() => buildOrderedOAuthAliasPool('ccs-opus', tier)).toThrow(
      DuplicateOAuthAliasPoolHopError
    );
  });

  it('fails closed when runtime behavior cannot preserve ordered OAuth pools', () => {
    // Given
    const pool = buildOrderedOAuthAliasPool('ccs-opus', {
      provider: 'claude',
      model: 'claude-opus-4-8',
      fallback_chain: [{ provider: 'codex', model: 'gpt-5.5' }],
    });

    // When / Then
    expect(() =>
      generateOrderedOAuthAliasPoolYaml(pool, {
        kind: 'unsupported',
        runtimeVersion: '7.2.88-1-plus',
        reason: 'OAuth aliases deduplicate by channel and OpenAI-compatible pools rotate',
      })
    ).toThrow(OrderedOAuthAliasPoolUnsupportedError);
  });

  it('leaves the existing generated config intact when capability gating fails', async () => {
    // Given
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-oauth-alias-gate-'));
    tempDirs.push(tempDir);
    const previousCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempDir;
    const ccsDir = path.join(tempDir, '.ccs');
    const unifiedConfigPath = path.join(ccsDir, 'config.yaml');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      unifiedConfigPath,
      `version: 13\ncliproxy:\n  oauth_accounts: {}\n  providers: []\n  variants:\n    resilient:\n      type: composite\n      default_tier: opus\n      tiers:\n        opus:\n          provider: claude\n          model: claude-opus-4-8\n          fallback_chain:\n            - provider: codex\n              model: gpt-5.5\n        sonnet:\n          provider: claude\n          model: claude-sonnet-4-6\n        haiku:\n          provider: kimi\n          model: kimi-k2.6\n`,
      'utf8'
    );
    const previousConfig = 'port: 8317\n# known-good\n';
    fs.writeFileSync(configPath, previousConfig, 'utf8');
    const { invalidateConfigCache } = await import('../../../config/config-loader-facade');
    invalidateConfigCache();

    try {
      // When / Then
      expect(() => regenerateConfig(8317, { configPath, authDir })).toThrow(
        OrderedOAuthAliasPoolUnsupportedError
      );
      expect(fs.readFileSync(configPath, 'utf8')).toBe(previousConfig);
    } finally {
      if (previousCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = previousCcsHome;
      }
      invalidateConfigCache();
    }
  });

  it('preserves generated cross-channel aliases and antigravity aliases across regeneration', () => {
    // Given
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-oauth-alias-pool-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(tempDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `# CLIProxyAPI config generated by CCS v21\nport: 8317\noauth-model-alias:\n  antigravity:\n    - name: custom-agy\n      alias: custom-agy-alias\n  codex:\n    - name: gpt-5.5\n      alias: ccs-opus\n`,
      'utf8'
    );

    // When
    regenerateConfig(8317, { configPath, authDir });
    const first = fs.readFileSync(configPath, 'utf8').replace(/^# Generated: .*$/m, '');
    regenerateConfig(8317, { configPath, authDir });
    const second = fs.readFileSync(configPath, 'utf8').replace(/^# Generated: .*$/m, '');

    // Then
    expect(second).toBe(first);
    expect(second).toContain('name: custom-agy');
    expect(second).toContain('  codex:\n    - name: gpt-5.5\n      alias: ccs-opus');
  });
});
