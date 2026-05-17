/**
 * Integration tests: two-terminal profile isolation.
 *
 * Verifies that two profiles with separate CODEX_HOME dirs write to their own
 * auth.json/history.jsonl with zero crosstalk. Uses real filesystem.
 *
 * Cases:
 *  - Profiles A and B have independent auth.json (writing A does not touch B)
 *  - Profiles A and B have independent history.jsonl (writing A does not touch B)
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-two-terminal-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function makeJwt(email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ email })).toString('base64url');
  return `${header}.${body}.sig`;
}

async function createProfile(name: string) {
  const { CodexProfileRegistry } = await import('../../../src/codex-auth/codex-profile-registry');
  const { resolveCodexProfileDir } = await import('../../../src/codex-auth/codex-profile-paths');
  const registry = new CodexProfileRegistry();
  const dir = resolveCodexProfileDir(name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  registry.createProfile(name, { created: new Date().toISOString(), last_used: null });
  return { dir, registry };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('two-terminal isolation — auth.json independence', () => {
  it('writing auth.json to profile A does not affect profile B', async () => {
    const { dir: dirA } = await createProfile('terminal-a');
    const { dir: dirB } = await createProfile('terminal-b');

    const authA = path.join(dirA, 'auth.json');
    const authB = path.join(dirB, 'auth.json');

    // Simulate Codex writing auth.json for profile A (token refresh)
    const tokenA = JSON.stringify({ tokens: { id_token: makeJwt('a@example.com') } });
    fs.writeFileSync(authA, tokenA, { mode: 0o600 });

    // Profile B auth.json must not exist (untouched)
    expect(fs.existsSync(authB)).toBe(false);

    // Now simulate a login for profile B
    const tokenB = JSON.stringify({ tokens: { id_token: makeJwt('b@example.com') } });
    fs.writeFileSync(authB, tokenB, { mode: 0o600 });

    // Verify A's auth.json content is unchanged — same token that was written for A
    const readA = fs.readFileSync(authA, 'utf8');
    expect(readA).toBe(tokenA);

    // Verify each profile dir is fully independent
    expect(dirA).not.toBe(dirB);
    expect(dirA.endsWith('terminal-a')).toBe(true);
    expect(dirB.endsWith('terminal-b')).toBe(true);
  });
});

describe('two-terminal isolation — history.jsonl independence', () => {
  it('writing history.jsonl to profile A does not affect profile B', async () => {
    const { dir: dirA } = await createProfile('hist-a');
    const { dir: dirB } = await createProfile('hist-b');

    const histA = path.join(dirA, 'history.jsonl');
    const histB = path.join(dirB, 'history.jsonl');

    // Profile A writes history
    fs.writeFileSync(histA, '{"prompt":"hello from A"}\n');

    // Profile B history must not exist
    expect(fs.existsSync(histB)).toBe(false);

    // Profile B writes its own history
    fs.writeFileSync(histB, '{"prompt":"hello from B"}\n');

    // A's history unchanged
    const contentA = fs.readFileSync(histA, 'utf8');
    expect(contentA).toContain('hello from A');
    expect(contentA).not.toContain('hello from B');

    // B's history has its own entry only
    const contentB = fs.readFileSync(histB, 'utf8');
    expect(contentB).toContain('hello from B');
    expect(contentB).not.toContain('hello from A');
  });
});
