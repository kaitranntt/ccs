/**
 * Tests: opt-in output-limit env injection end to end (issue #231).
 *
 * Loads a real config.yaml from a temp CCS_HOME and verifies getOutputLimitsEnv()
 * reads config.runtime.outputLimits correctly:
 * - No runtime section => no env injected (downstream defaults preserved).
 * - Configured values => correct downstream env var names, string values.
 *
 * Also asserts the limits are actually injected at BOTH consumer sites, not just
 * read by the getter:
 * - ClaudeAdapter.buildEnv() (account/default Claude launch path).
 * - getEffectiveEnvVars() (cliproxy launch path, which spreads getGlobalEnvVars).
 * Plus the critical opt-in invariant end to end: when runtime.outputLimits is
 * ABSENT, NEITHER consumer's env carries the keys.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeAdapter } from '../../targets/claude-adapter';
import { getEffectiveEnvVars } from '../../cliproxy/config/env-builder';

/** Downstream env keys the output-limit feature injects. */
const OUTPUT_LIMIT_KEYS = ['MAX_MCP_OUTPUT_TOKENS', 'BASH_MAX_OUTPUT_LENGTH'] as const;

const CONFIGURED_YAML = [
  'version: 1',
  'runtime:',
  '  outputLimits:',
  '    maxMcpOutputTokens: 100000',
  '    bashMaxOutputLength: 200000',
  '',
].join('\n');

/** Minimal valid credentials for ClaudeAdapter.buildEnv. */
function makeCreds(): {
  profile: string;
  baseUrl: string;
  apiKey: string;
} {
  return { profile: 'default', baseUrl: '', apiKey: '' };
}

/** Write a config.yaml into a fresh temp CCS_HOME and return the home dir. */
function createTestHome(configYaml: string): string {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-output-limits-'));
  const ccsDir = path.join(tempHome, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), configYaml, 'utf8');
  return tempHome;
}

/** Re-import the facade with a cache-busting query so each test reads fresh config. */
async function importFacade(): Promise<typeof import('../config-loader-facade')> {
  return import(`../config-loader-facade?cachebust=${Date.now()}-${Math.random()}`);
}

describe('getOutputLimitsEnv (config.runtime.outputLimits)', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('injects nothing when no runtime section is present (defaults preserved)', async () => {
    tempHome = createTestHome(`version: 1\n`);
    process.env.CCS_HOME = tempHome;
    const facade = await importFacade();
    expect(facade.getOutputLimitsEnv()).toEqual({});
  });

  it('injects only configured keys as strings', async () => {
    tempHome = createTestHome(
      [
        'version: 1',
        'runtime:',
        '  outputLimits:',
        '    maxMcpOutputTokens: 100000',
        '    bashMaxOutputLength: 200000',
        '',
      ].join('\n')
    );
    process.env.CCS_HOME = tempHome;
    const facade = await importFacade();
    const env = facade.getOutputLimitsEnv();
    expect(env).toEqual({
      MAX_MCP_OUTPUT_TOKENS: '100000',
      BASH_MAX_OUTPUT_LENGTH: '200000',
    });
    for (const value of Object.values(env)) {
      expect(typeof value).toBe('string');
    }
  });

  it('injects only the configured subset', async () => {
    tempHome = createTestHome(
      ['version: 1', 'runtime:', '  outputLimits:', '    maxMcpOutputTokens: 50000', ''].join('\n')
    );
    process.env.CCS_HOME = tempHome;
    const facade = await importFacade();
    const env = facade.getOutputLimitsEnv();
    expect(env).toEqual({ MAX_MCP_OUTPUT_TOKENS: '50000' });
    expect(env).not.toHaveProperty('BASH_MAX_OUTPUT_LENGTH');
  });

  it('injects nothing when runtime.outputLimits is empty', async () => {
    tempHome = createTestHome(['version: 1', 'runtime:', '  outputLimits: {}', ''].join('\n'));
    process.env.CCS_HOME = tempHome;
    const facade = await importFacade();
    expect(facade.getOutputLimitsEnv()).toEqual({});
  });
});

describe('output limits reach the ClaudeAdapter consumer (buildEnv)', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalLimitEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    // Ensure the parent shell isn't pre-seeding the limit keys: buildEnv spreads
    // process.env, so a leaked value would defeat the negative assertion.
    originalLimitEnv = {};
    for (const key of OUTPUT_LIMIT_KEYS) {
      originalLimitEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    for (const key of OUTPUT_LIMIT_KEYS) {
      if (originalLimitEnv[key] !== undefined) {
        process.env[key] = originalLimitEnv[key];
      } else {
        delete process.env[key];
      }
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('injects the configured limits as string values into the built env', () => {
    tempHome = createTestHome(CONFIGURED_YAML);
    process.env.CCS_HOME = tempHome;

    const env = new ClaudeAdapter().buildEnv(makeCreds(), 'default');

    expect(env.MAX_MCP_OUTPUT_TOKENS).toBe('100000');
    expect(env.BASH_MAX_OUTPUT_LENGTH).toBe('200000');
    expect(typeof env.MAX_MCP_OUTPUT_TOKENS).toBe('string');
    expect(typeof env.BASH_MAX_OUTPUT_LENGTH).toBe('string');
  });

  it('injects nothing when runtime.outputLimits is absent (opt-in invariant)', () => {
    tempHome = createTestHome(`version: 1\n`);
    process.env.CCS_HOME = tempHome;

    const env = new ClaudeAdapter().buildEnv(makeCreds(), 'default');

    for (const key of OUTPUT_LIMIT_KEYS) {
      expect(env).not.toHaveProperty(key);
    }
  });
});

describe('output limits reach the cliproxy consumer (getEffectiveEnvVars)', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('includes the configured limit keys (via getGlobalEnvVars) in the provider env', () => {
    tempHome = createTestHome(CONFIGURED_YAML);
    process.env.CCS_HOME = tempHome;

    // No provider settings file exists in the temp home, so this exercises the
    // bundled-defaults path: { ...globalEnv, ...getClaudeEnvVars() }. globalEnv
    // carries the opt-in output limits from config.runtime.outputLimits.
    const env = getEffectiveEnvVars('gemini', 8317);

    expect(env.MAX_MCP_OUTPUT_TOKENS).toBe('100000');
    expect(env.BASH_MAX_OUTPUT_LENGTH).toBe('200000');
  });

  it('omits the limit keys when runtime.outputLimits is absent (opt-in invariant)', () => {
    tempHome = createTestHome(`version: 1\n`);
    process.env.CCS_HOME = tempHome;

    const env = getEffectiveEnvVars('gemini', 8317);

    for (const key of OUTPUT_LIMIT_KEYS) {
      expect(env).not.toHaveProperty(key);
    }
  });
});
