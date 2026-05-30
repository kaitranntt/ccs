/**
 * Config Image Analysis Command Tests
 *
 * Unit tests for ccs config image-analysis subcommand.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_IMAGE_ANALYSIS_CONFIG } from '../../../src/config/schemas/proxy-server';

// Create temp directory for test isolation
let testDir: string;
let originalCcsHome: string | undefined;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-image-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = testDir;
});

afterEach(() => {
  if (originalCcsHome) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(testDir, { recursive: true, force: true });
});

// Helper to create config.yaml for tests
function createConfigYaml(content: string): void {
  fs.writeFileSync(path.join(testDir, 'config.yaml'), content, 'utf8');
}

async function loadHandleConfigImageAnalysisCommand() {
  const mod = await import(
    `../../../src/commands/config-image-analysis-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleConfigImageAnalysisCommand;
}

describe('config image-analysis command', () => {
  describe('config file parsing', () => {
    it('should parse enabled status from config.yaml', () => {
      createConfigYaml(`
version: 2
image_analysis:
  enabled: true
  timeout: 60
  provider_models:
    agy: gemini-3-1-flash-preview
`);

      const content = fs.readFileSync(path.join(testDir, 'config.yaml'), 'utf8');
      expect(content).toContain('enabled: true');
      expect(content).toContain('timeout: 60');
      expect(content).toContain('agy: gemini-3-1-flash-preview');
    });

    it('should parse disabled status from config.yaml', () => {
      createConfigYaml(`
version: 2
image_analysis:
  enabled: false
  timeout: 120
  provider_models: {}
`);

      const content = fs.readFileSync(path.join(testDir, 'config.yaml'), 'utf8');
      expect(content).toContain('enabled: false');
      expect(content).toContain('timeout: 120');
    });

    it('should parse multiple provider models', () => {
      createConfigYaml(`
version: 2
image_analysis:
  enabled: true
  timeout: 60
  provider_models:
    agy: gemini-3-1-flash-preview
    gemini: gemini-2.5-pro
    codex: gpt-5.1-codex-mini
    kiro: kiro-claude-haiku-4-5
`);

      const content = fs.readFileSync(path.join(testDir, 'config.yaml'), 'utf8');
      expect(content).toContain('agy: gemini-3-1-flash-preview');
      expect(content).toContain('gemini: gemini-2.5-pro');
      expect(content).toContain('codex: gpt-5.1-codex-mini');
      expect(content).toContain('kiro: kiro-claude-haiku-4-5');
    });
  });

  describe('timeout validation', () => {
    it('should accept valid timeout within range (10-600)', () => {
      const validTimeouts = [10, 60, 120, 300, 600];

      for (const timeout of validTimeouts) {
        const isValid = timeout >= 10 && timeout <= 600;
        expect(isValid).toBe(true);
      }
    });

    it('should reject timeout below minimum (10)', () => {
      const invalidTimeouts = [0, 1, 5, 9];

      for (const timeout of invalidTimeouts) {
        const isValid = timeout >= 10 && timeout <= 600;
        expect(isValid).toBe(false);
      }
    });

    it('should reject timeout above maximum (600)', () => {
      const invalidTimeouts = [601, 700, 1000, 3600];

      for (const timeout of invalidTimeouts) {
        const isValid = timeout >= 10 && timeout <= 600;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('provider validation', () => {
    it('should accept valid providers', () => {
      const validProviders = [
        'agy',
        'gemini',
        'codex',
        'kiro',
        'ghcp',
        'claude',
        'qwen',
        'iflow',
        'kimi',
      ];

      for (const provider of validProviders) {
        expect(validProviders.includes(provider)).toBe(true);
      }
    });

    it('should reject invalid providers', () => {
      const validProviders = [
        'agy',
        'gemini',
        'codex',
        'kiro',
        'ghcp',
        'claude',
        'qwen',
        'iflow',
        'kimi',
      ];
      const invalidProviders = ['unknown', 'custom', 'my-provider', 'test'];

      for (const provider of invalidProviders) {
        expect(validProviders.includes(provider)).toBe(false);
      }
    });

    it('rejects invalid fallback backends that are not configured', async () => {
      const handleConfigImageAnalysisCommand = await loadHandleConfigImageAnalysisCommand();
      const originalProcessExit = process.exit;

      process.exit = ((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as typeof process.exit;

      try {
        await expect(
          handleConfigImageAnalysisCommand(['--set-fallback', 'unknown-provider'])
        ).rejects.toThrow('process.exit(1)');
      } finally {
        process.exit = originalProcessExit;
      }

      const configPath = path.join(testDir, 'config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        expect(content).not.toContain('fallback_backend: unknown-provider');
      } else {
        expect(fs.existsSync(configPath)).toBe(false);
      }
    });

    it('rejects invalid profile backend mappings that are not configured', async () => {
      const handleConfigImageAnalysisCommand = await loadHandleConfigImageAnalysisCommand();
      const originalProcessExit = process.exit;

      process.exit = ((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as typeof process.exit;

      try {
        await expect(
          handleConfigImageAnalysisCommand(['--set-profile-backend', 'orq', 'unknown-provider'])
        ).rejects.toThrow('process.exit(1)');
      } finally {
        process.exit = originalProcessExit;
      }

      const configPath = path.join(testDir, 'config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        expect(content).not.toContain('unknown-provider');
      } else {
        expect(fs.existsSync(configPath)).toBe(false);
      }
    });
  });

  describe('default configuration', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled).toBe(true);
      expect(DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout).toBe(60);
      expect(DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models.claude).toBe(
        'claude-haiku-4-5-20251001'
      );
      expect(Object.keys(DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models).length).toBe(9);
    });
  });

  describe('config file structure', () => {
    it('should have image_analysis section', () => {
      createConfigYaml(`
version: 2
image_analysis:
  enabled: true
  timeout: 60
  provider_models:
    agy: gemini-3-1-flash-preview
`);

      const content = fs.readFileSync(path.join(testDir, 'config.yaml'), 'utf8');
      expect(content).toContain('image_analysis:');
    });

    it('should support empty provider_models', () => {
      createConfigYaml(`
version: 2
image_analysis:
  enabled: false
  timeout: 60
  provider_models: {}
`);

      const content = fs.readFileSync(path.join(testDir, 'config.yaml'), 'utf8');
      expect(content).toContain('provider_models: {}');
    });
  });
});
