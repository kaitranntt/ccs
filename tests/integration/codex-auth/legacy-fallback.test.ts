/**
 * Integration tests: legacy fallback when no profiles are registered.
 *
 * Verifies that with no codex-auth profiles and no CCS_CODEX_PROFILE env set,
 * resolveActiveProfile returns null — allowing codex to fall back to ~/.codex
 * (legacy mode). This guarantees zero behaviour change for users who never
 * run `ccsx auth create`.
 *
 * Cases:
 *  - Empty registry → resolveActiveProfile returns null (legacy mode)
 *  - Missing registry file → returns null (no registry = legacy mode)
 *  - CCS_CODEX_PROFILE set but registry missing or unmatched → throws to avoid unsafe fallback
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;
const ORIG_CCS_CODEX_PROFILE = process.env.CCS_CODEX_PROFILE;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-legacy-fallback-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
  delete process.env.CCS_CODEX_PROFILE;
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  if (ORIG_CCS_CODEX_PROFILE === undefined) delete process.env.CCS_CODEX_PROFILE;
  else process.env.CCS_CODEX_PROFILE = ORIG_CCS_CODEX_PROFILE;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('legacy fallback — no registry file', () => {
  it('returns null when registry file does not exist (CODEX_HOME stays unset)', async () => {
    // CCS_HOME points to empty temp dir — no codex-profiles.yaml created
    const registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
    expect(fs.existsSync(registryPath)).toBe(false);

    const { resolveActiveProfile } = await import('../../../src/codex-auth/resolve-active-profile');
    const result = resolveActiveProfile({});

    expect(result).toBeNull();
    // When null: caller (codex-runtime.ts) leaves CODEX_HOME unset → Codex uses ~/.codex
  });
});

describe('legacy fallback — empty registry', () => {
  it('returns null when registry exists but has no profiles and no default', async () => {
    const { CodexProfileRegistry } = await import('../../../src/codex-auth/codex-profile-registry');
    // Touch registry by constructing (which cleans orphan tmps but doesn't write)
    // Write an empty registry manually
    const registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, 'version: "1.0"\ndefault: null\nprofiles: {}\n', {
      mode: 0o600,
    });

    const { resolveActiveProfile } = await import('../../../src/codex-auth/resolve-active-profile');
    const result = resolveActiveProfile({});

    expect(result).toBeNull();
    // Registry exists but no profiles → legacy mode
    void new CodexProfileRegistry(); // verify registry reads cleanly
  });
});

describe('legacy fallback — CCS_CODEX_PROFILE set but no matching profile', () => {
  it('throws when env points to non-existent profile', async () => {
    // Create registry with no profiles
    const registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, 'version: "1.0"\ndefault: null\nprofiles: {}\n', {
      mode: 0o600,
    });

    const { resolveActiveProfile } = await import('../../../src/codex-auth/resolve-active-profile');
    expect(() => resolveActiveProfile({ CCS_CODEX_PROFILE: 'ghost-profile' })).toThrow(
      /ghost-profile/
    );
  });

  it('throws when env is set but registry file is missing', async () => {
    const registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
    expect(fs.existsSync(registryPath)).toBe(false);

    const { resolveActiveProfile } = await import('../../../src/codex-auth/resolve-active-profile');
    expect(() => resolveActiveProfile({ CCS_CODEX_PROFILE: 'ghost-profile' })).toThrow(
      /does not exist/
    );
  });
});
