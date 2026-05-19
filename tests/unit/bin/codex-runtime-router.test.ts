/**
 * Tests for the codex-runtime router module (src/bin/codex-runtime-router.ts).
 *
 * Strategy: mirrors ccsxp-runtime.test.ts — invalidate require.cache before
 * each test so the module re-evaluates with updated stubs and env state.
 * Stub runCodexAuth and require('../ccs') via require.cache injection.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

const routerPath = require.resolve('../../../src/bin/codex-runtime-router.ts');
const ccsPath = require.resolve('../../../src/ccs.ts');
const codexAuthRouterPath = require.resolve('../../../src/codex-auth/codex-auth-router.ts');
const resolveProfilePath = require.resolve('../../../src/codex-auth/resolve-active-profile.ts');
const symlinkPath = require.resolve('../../../src/codex-auth/codex-config-symlink.ts');

const ORIGINAL_CCS_HOME = process.env.CCS_HOME;
const ORIGINAL_CODEX_HOME = process.env.CODEX_HOME;
const ORIGINAL_CCS_CODEX_PROFILE = process.env.CCS_CODEX_PROFILE;

let tempDir: string;
let ccsHome: string;
let registryPath: string;
let instancesDir: string;

function flushRouterCache() {
  delete require.cache[routerPath];
  delete require.cache[codexAuthRouterPath];
  delete require.cache[resolveProfilePath];
  delete require.cache[symlinkPath];
  // Keep ccsPath stub intact — tests inject it explicitly each time
}

function writeRegistry(data: object): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, yaml.dump(data, { indent: 2 }), { mode: 0o600 });
}

function makeProfileDir(name: string): string {
  const dir = path.join(instancesDir, name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function withCapturedStderr<T>(fn: () => Promise<T>): Promise<{ result: T; stderr: string }> {
  const stderrMessages: string[] = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderrMessages.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  try {
    return { result: await fn(), stderr: stderrMessages.join('') };
  } finally {
    process.stderr.write = origWrite;
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-router-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true, mode: 0o700 });
  process.env.CCS_HOME = ccsHome;
  registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
  instancesDir = path.join(ccsHome, '.ccs', 'codex-instances');
  delete process.env.CODEX_HOME;
  delete process.env.CCS_CODEX_PROFILE;
  flushRouterCache();
});

afterEach(() => {
  if (ORIGINAL_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIGINAL_CCS_HOME;

  if (ORIGINAL_CODEX_HOME === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = ORIGINAL_CODEX_HOME;

  if (ORIGINAL_CCS_CODEX_PROFILE === undefined) delete process.env.CCS_CODEX_PROFILE;
  else process.env.CCS_CODEX_PROFILE = ORIGINAL_CCS_CODEX_PROFILE;

  flushRouterCache();
  delete require.cache[ccsPath];
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ── Auth routing ──────────────────────────────────────────────────────────────

describe('codex-runtime router — auth subcommand routing', () => {
  it('routes argv[2]===auth to runCodexAuth with remaining args and returns its exit code', async () => {
    let capturedArgs: string[] | undefined;

    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
    require.cache[codexAuthRouterPath] = {
      exports: {
        runCodexAuth: async (args: string[]) => {
          capturedArgs = args;
          return 0;
        },
      },
    } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    const code = await main(['node', 'codex-runtime', 'auth', 'create', 'work']);

    expect(capturedArgs).toEqual(['create', 'work']);
    expect(code).toBe(0);
  });

  it('returns non-zero exit code propagated from runCodexAuth', async () => {
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
    require.cache[codexAuthRouterPath] = {
      exports: { runCodexAuth: async (_args: string[]) => 1 },
    } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    const code = await main(['node', 'codex-runtime', 'auth', 'login']);

    expect(code).toBe(1);
  });
});

// ── Non-auth profile resolution ───────────────────────────────────────────────

describe('codex-runtime router — non-auth profile resolution', () => {
  it('sets CODEX_HOME from active profile when CCS_CODEX_PROFILE env matches registry', async () => {
    const profileDir = makeProfileDir('work');
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: { work: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null } },
    });
    process.env.CCS_CODEX_PROFILE = 'work';

    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
    // Let real resolve-active-profile + codex-config-symlink run; stub ccs only
    flushRouterCache();
    delete require.cache[ccsPath]; // ensure fresh load guard doesn't skip
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    await main(['node', 'codex-runtime', 'chat']);

    expect(process.env.CODEX_HOME).toBe(profileDir);
  });

  it('leaves CODEX_HOME unset when no registry exists and no env profile set', async () => {
    // No registry file, no CCS_CODEX_PROFILE
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    const code = await main(['node', 'codex-runtime', 'chat']);

    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(code).toBe(-1); // CCS branch: entry must not call process.exit()
  });

  it('fails fast when CCS_CODEX_PROFILE points to a missing registry profile', async () => {
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: {},
    });
    process.env.CCS_CODEX_PROFILE = 'ghost';

    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain("CCS_CODEX_PROFILE='ghost'");
  });

  it('fails fast when CCS_CODEX_PROFILE is set but registry is missing', async () => {
    process.env.CCS_CODEX_PROFILE = 'ghost';

    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('does not exist');
  });

  it('fails fast when CCS_CODEX_PROFILE is set and registry YAML is corrupt', async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, 'profiles: [unterminated\n');
    process.env.CCS_CODEX_PROFILE = 'ghost';

    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('registry YAML could not be parsed');
  });

  it('fails fast when registry YAML is corrupt even without CCS_CODEX_PROFILE', async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, 'profiles: [unterminated\n');

    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('registry YAML could not be parsed');
  });

  it('fails fast when CCS_CODEX_PROFILE is set and registry is not an object', async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, '- not\n- an\n- object\n');
    process.env.CCS_CODEX_PROFILE = 'ghost';

    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('registry YAML root is not an object');
  });

  it('fails fast for structural resolver errors with the expected name', async () => {
    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      require.cache[resolveProfilePath] = {
        exports: {
          resolveActiveProfile: () => {
            throw { name: 'CodexAuthProfileResolutionError', message: 'boundary failure' };
          },
        },
      } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('boundary failure');
  });

  it('fails closed for unexpected resolver errors instead of falling back to legacy mode', async () => {
    const { result: code, stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      require.cache[resolveProfilePath] = {
        exports: {
          resolveActiveProfile: () => {
            throw new Error('permission denied');
          },
        },
      } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(code).toBe(1);
    expect(process.env.CODEX_HOME).toBeUndefined();
    expect(stderr).toContain('profile resolution failed');
    expect(stderr).toContain('permission denied');
  });

  it('preserves an explicit CODEX_HOME already in env — does not overwrite', async () => {
    const explicitHome = path.join(tempDir, 'explicit-codex-home');
    fs.mkdirSync(explicitHome, { recursive: true });
    process.env.CODEX_HOME = explicitHome;

    // Even with a populated registry default, explicit wins
    makeProfileDir('other');
    writeRegistry({
      version: '1.0',
      default: 'other',
      profiles: { other: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null } },
    });

    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    await main(['node', 'codex-runtime', 'chat']);

    expect(process.env.CODEX_HOME).toBe(explicitHome);
  });

  it('lets CCS_CODEX_PROFILE override a stale explicit CODEX_HOME', async () => {
    const explicitHome = path.join(tempDir, 'stale-codex-home');
    const profileDir = makeProfileDir('work');
    fs.mkdirSync(explicitHome, { recursive: true });
    process.env.CODEX_HOME = explicitHome;
    process.env.CCS_CODEX_PROFILE = 'work';
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: { work: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null } },
    });

    const { stderr } = await withCapturedStderr(async () => {
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
      flushRouterCache();
      require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

      const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
      return main(['node', 'codex-runtime', 'chat']);
    });

    expect(process.env.CODEX_HOME).toBe(profileDir);
    expect(stderr).toContain('overrides existing CODEX_HOME');
  });

  it('sets CODEX_HOME from registry default when no CCS_CODEX_PROFILE is set', async () => {
    const profileDir = makeProfileDir('personal');
    writeRegistry({
      version: '1.0',
      default: 'personal',
      profiles: {
        personal: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
      },
    });
    // No CCS_CODEX_PROFILE set

    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;
    flushRouterCache();
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    const { main } = require(routerPath) as { main: (argv: string[]) => Promise<number> };
    await main(['node', 'codex-runtime', '--version']);

    expect(process.env.CODEX_HOME).toBe(profileDir);
  });
});
