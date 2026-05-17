/**
 * Integration tests for `ccsx auth import-default`.
 *
 * Uses real filesystem rooted at temp dirs. Sets LEGACY_CODEX_HOME env for
 * test hermeticity. Verifies the full import pipeline end-to-end.
 *
 * Cases:
 *  - End-to-end import: registry entry + symlink + atomic write (no tmp leftovers)
 *  - Decoded email present in registry after import
 *  - --with-history copies history.jsonl + sessions/
 *  - Re-run without --force refuses; re-run with --force succeeds + backup created
 */
import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';

// Build a minimal valid JWT for test fixtures
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

const TEST_EMAIL = 'integration@example.com';
const TEST_JWT = makeJwt({
  email: TEST_EMAIL,
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'plus',
    chatgpt_account_id: 'acct-integration-001',
  },
});
const TEST_AUTH_JSON = JSON.stringify({ tokens: { id_token: TEST_JWT } }, null, 2);

let tempDir: string;
let ccsHome: string;
let legacyCodexHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;
const ORIG_LEGACY = process.env.LEGACY_CODEX_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-import-integ-'));
  ccsHome = path.join(tempDir, 'ccs');
  legacyCodexHome = path.join(tempDir, 'legacy-codex');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  fs.mkdirSync(legacyCodexHome, { recursive: true });
  process.env.CCS_HOME = ccsHome;
  process.env.LEGACY_CODEX_HOME = legacyCodexHome;

  // Prevent pgrep from finding the test runner itself
  spyOn(childProcess, 'spawnSync').mockReturnValue({
    status: 1,
    stdout: '',
    stderr: '',
    pid: 0,
    output: [],
    signal: null,
    error: undefined,
  });
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  if (ORIG_LEGACY === undefined) delete process.env.LEGACY_CODEX_HOME;
  else process.env.LEGACY_CODEX_HOME = ORIG_LEGACY;
  fs.rmSync(tempDir, { recursive: true, force: true });
  mock.restore();
});

async function makeCtx() {
  const { CodexProfileRegistry } = await import('../../../src/codex-auth/codex-profile-registry');
  return { registry: new CodexProfileRegistry(), version: '0.0.0-test' };
}

function silence(): () => void {
  const origLog = console.log;
  const origErr = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  process.stderr.write = () => true;
  return () => {
    console.log = origLog;
    process.stderr.write = origErr;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('import-default integration — end-to-end happy path', () => {
  it('creates registry entry with decoded email and symlink after import', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), TEST_AUTH_JSON);

    const { handleImportDefaultCodex } = await import(
      '../../../src/codex-auth/commands/import-default-command'
    );
    const ctx = await makeCtx();

    const restore = silence();
    try {
      await handleImportDefaultCodex(ctx, ['integ-profile']);
    } finally {
      restore();
    }

    // Registry entry created with email
    expect(ctx.registry.hasProfile('integ-profile')).toBe(true);
    const meta = ctx.registry.getProfile('integ-profile');
    expect(meta.email).toBe(TEST_EMAIL);
    expect(meta.plan_type).toBe('plus');

    // auth.json written to profile dir
    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'integ-profile');
    const destAuth = path.join(profileDir, 'auth.json');
    expect(fs.existsSync(destAuth)).toBe(true);

    // config.toml is a symlink (or was attempted — skip check on no-symlink platforms)
    const configLink = path.join(profileDir, 'config.toml');
    if (fs.existsSync(configLink)) {
      const stat = fs.lstatSync(configLink);
      expect(stat.isSymbolicLink()).toBe(true);
    }

    // No tmp leftovers in profile dir (atomic write cleanup)
    const files = fs.readdirSync(profileDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('import-default integration — with-history flag', () => {
  it('copies history.jsonl and sessions/ when --with-history is passed', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), TEST_AUTH_JSON);
    fs.writeFileSync(
      path.join(legacyCodexHome, 'history.jsonl'),
      '{"prompt":"hello","response":"world"}\n'
    );
    const sessDir = path.join(legacyCodexHome, 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'sess-001.json'), JSON.stringify({ id: 'sess-001' }));
    fs.writeFileSync(path.join(sessDir, 'sess-002.json'), JSON.stringify({ id: 'sess-002' }));

    const { handleImportDefaultCodex } = await import(
      '../../../src/codex-auth/commands/import-default-command'
    );
    const ctx = await makeCtx();

    const restore = silence();
    try {
      await handleImportDefaultCodex(ctx, ['with-hist', '--with-history']);
    } finally {
      restore();
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'with-hist');
    expect(fs.existsSync(path.join(profileDir, 'history.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(profileDir, 'sessions', 'sess-001.json'))).toBe(true);
    expect(fs.existsSync(path.join(profileDir, 'sessions', 'sess-002.json'))).toBe(true);
  });
});

describe('import-default integration — force re-import', () => {
  it('refuses re-import without --force; succeeds with --force + creates backup', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), TEST_AUTH_JSON);

    const { handleImportDefaultCodex } = await import(
      '../../../src/codex-auth/commands/import-default-command'
    );
    const ctx = await makeCtx();

    // First import — should succeed
    const r1 = silence();
    try {
      await handleImportDefaultCodex(ctx, ['force-test']);
    } finally {
      r1();
    }
    expect(ctx.registry.hasProfile('force-test')).toBe(true);

    // Re-import without --force — should refuse
    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const r2 = silence();
    try {
      await handleImportDefaultCodex(ctx, ['force-test']);
    } catch {
      /* expected */
    } finally {
      r2();
      process.exit = origExit;
    }
    expect(exitCalled).toBe(true);

    // Re-import with --force — should overwrite + backup
    const newJwt = makeJwt({ email: 'updated@example.com' });
    fs.writeFileSync(
      path.join(legacyCodexHome, 'auth.json'),
      JSON.stringify({ tokens: { id_token: newJwt } })
    );

    const r3 = silence();
    try {
      await handleImportDefaultCodex(ctx, ['force-test', '--force']);
    } finally {
      r3();
    }

    // Registry updated with new email
    const meta = ctx.registry.getProfile('force-test');
    expect(meta.email).toBe('updated@example.com');

    // Backup file created
    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'force-test');
    const files = fs.readdirSync(profileDir);
    const bakFile = files.find((f) => f.startsWith('auth.json.bak-'));
    expect(bakFile).toBeDefined();
  });
});
