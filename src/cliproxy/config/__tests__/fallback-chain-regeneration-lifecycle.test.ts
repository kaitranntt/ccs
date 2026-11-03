import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateConfig, regenerateConfig } from '../generator';
import {
  loadOrCreateUnifiedConfig,
  saveUnifiedConfig,
} from '../../../config/unified-config-loader';
import { runWithScopedCcsHome } from '../../../utils/config-manager';

describe('Fallback chain v8 config regeneration lifecycle', () => {
  it('exercises generate -> regenerate with fallback -> remove -> regenerate without fallback', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-fallback-regen-'));
    try {
      await runWithScopedCcsHome(tempHome, async () => {
        const port = 8317;
        const configPath = path.join(tempHome, '.ccs/cliproxy/config.yaml');

        // 1. Initial configuration without fallback-chain
        const baseConfig = loadOrCreateUnifiedConfig();
        saveUnifiedConfig(baseConfig);

        generateConfig('claude', port);
        let content = fs.readFileSync(configPath, 'utf8');
        expect(content).not.toContain('fallback-chain:');

        // 2. Add fallback-chain and regenerate
        const withFallback = loadOrCreateUnifiedConfig();
        withFallback.cliproxy.fallback_chain = {
          'codex:gpt-5.6-sol': {
            candidates: [
              { provider: 'codex', model: 'gpt-5.6-sol' },
              { provider: 'claude', model: 'claude-sonnet-4' },
            ],
            sticky_primary: true,
            exhaustion_cooldown: '15m',
          },
        };
        saveUnifiedConfig(withFallback);

        regenerateConfig(port);
        content = fs.readFileSync(configPath, 'utf8');
        expect(content).toContain('fallback-chain:');
        expect(content).toContain('codex:gpt-5.6-sol');

        // Verify round-trip parse of regenerated YAML
        const parsedWithChain = yaml.load(content) as Record<string, any>;
        expect(parsedWithChain['fallback-chain']).toBeDefined();
        expect(parsedWithChain['fallback-chain']['codex:gpt-5.6-sol'].candidates).toHaveLength(2);

        // 3. Remove fallback-chain and regenerate (must NOT be re-appended by appendKeptV8Sections)
        const withoutFallback = loadOrCreateUnifiedConfig();
        delete withoutFallback.cliproxy.fallback_chain;
        saveUnifiedConfig(withoutFallback);

        regenerateConfig(port);
        content = fs.readFileSync(configPath, 'utf8');

        // Condition check: fallback-chain must be completely removed
        expect(content).not.toContain('fallback-chain:');
        expect(content).not.toContain('codex:gpt-5.6-sol');

        const parsedWithoutChain = yaml.load(content) as Record<string, any>;
        expect(parsedWithoutChain['fallback-chain']).toBeUndefined();
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
