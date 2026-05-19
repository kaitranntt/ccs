/**
 * Unit tests for codex-auth-dashboard-service.
 *
 * Tests cover: empty registry, decoded fields, corrupt auth.json,
 * active resolution precedence (4 paths), cache TTL, cache invalidation,
 * and token redaction from response.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;

// Helpers ------------------------------------------------------------------

function buildToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

function writeAuthJson(profileDir: string, idTokenPayload: Record<string, unknown>): void {
  const authJson = {
    tokens: {
      id_token: buildToken(idTokenPayload),
      access_token: 'access-token-should-not-appear',
      refresh_token: 'refresh-token-should-not-appear',
    },
  };
  fs.writeFileSync(path.join(profileDir, 'auth.json'), JSON.stringify(authJson), {
    mode: 0o600,
  });
}

function writeRawAuthJson(profileDir: string, idToken: string): void {
  fs.writeFileSync(
    path.join(profileDir, 'auth.json'),
    JSON.stringify({
      tokens: {
        id_token: idToken,
        access_token: 'access-token-should-not-appear',
        refresh_token: 'refresh-token-should-not-appear',
      },
    }),
    { mode: 0o600 }
  );
}

function writeRegistry(registryPath: string, data: unknown): void {
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const yaml = (d: unknown): string => {
    // Minimal YAML serialiser for the test fixture
    if (typeof d === 'object' && d !== null) {
      return Object.entries(d as Record<string, unknown>)
        .map(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            const nested = Object.entries(v as Record<string, unknown>)
              .map(([nk, nv]) => `  ${nk}: ${nv === null ? 'null' : String(nv)}`)
              .join('\n');
            return `${k}:\n${nested}`;
          }
          return `${k}: ${v === null ? 'null' : String(v)}`;
        })
        .join('\n');
    }
    return '';
  };
  fs.writeFileSync(registryPath, yaml(data), { mode: 0o600 });
}

function bumpRegistryMtime(registryPath: string): void {
  const future = new Date(Date.now() + 10_000);
  fs.utimesSync(registryPath, future, future);
}

// Module cache helpers -----------------------------------------------------

async function importService() {
  // Bust module cache on each test by importing fresh via dynamic import
  const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await import(
    '../../../src/codex-auth/codex-auth-dashboard-service'
  );
  return { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache };
}

// Setup / teardown ---------------------------------------------------------

// getCcsDir() returns path.join(CCS_HOME, '.ccs') when CCS_HOME is set.
// Tests must write to tmpDir/.ccs/ to be visible to the service.
let ccsDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-'));
  process.env.CCS_HOME = tmpDir;
  ccsDir = path.join(tmpDir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  // Clear module cache so cache state doesn't bleed between tests
  // Bun doesn't have require.cache; we rely on invalidateCodexAuthProfilesCache
});

afterEach(() => {
  delete process.env.CCS_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.CCS_CODEX_PROFILE;
  mock.restore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Tests --------------------------------------------------------------------

describe('getCodexAuthProfilesSummary', () => {
  it('returns empty profiles and active=null when registry does not exist', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();
    const result = await getCodexAuthProfilesSummary();
    expect(result.profiles).toEqual([]);
    expect(result.active).toBeNull();
    expect(result.default).toBeNull();
  });

  it('throws instead of returning an empty list when registry YAML is malformed', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(registryPath, '{ invalid: yaml: [', { mode: 0o600 });

    await expect(getCodexAuthProfilesSummary()).rejects.toThrow(/could not be read safely/i);
  });

  it('does not expose raw stat errors when the registry cannot be checked', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    const rawMessage = `EACCES: permission denied, stat '${registryPath}'`;
    const realStatSync = fs.statSync;
    spyOn(fs, 'statSync').mockImplementation((target) => {
      if (target === registryPath) {
        const err = new Error(rawMessage) as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return realStatSync(target);
    });

    let message = '';
    try {
      await getCodexAuthProfilesSummary();
    } catch (err) {
      message = String(err);
    }

    expect(message).toContain('could not be checked safely');
    expect(message).not.toContain(registryPath);
    expect(message).not.toContain('EACCES');
  });

  it('returns decoded email, plan, accountId for valid registry with 2 profiles', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const workDir = path.join(instancesDir, 'work');
    const personalDir = path.join(instancesDir, 'personal');
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(personalDir, { recursive: true });

    writeAuthJson(workDir, {
      email: 'work@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_account_id: 'acct-work-123',
      },
    });
    writeAuthJson(personalDir, {
      email: 'personal@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'free',
        chatgpt_account_id: 'acct-personal-456',
      },
    });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    const yamlContent = `version: "1.0"\ndefault: work\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: "2026-05-17T05:45:00Z"\n  personal:\n    type: codex\n    created: "2026-01-02T00:00:00Z"\n    last_used: null\n`;
    fs.writeFileSync(registryPath, yamlContent, { mode: 0o600 });

    const result = await getCodexAuthProfilesSummary();
    expect(result.profiles).toHaveLength(2);

    const work = result.profiles.find((p) => p.name === 'work');
    expect(work).toBeDefined();
    expect(work?.email).toBe('work@example.com');
    expect(work?.plan).toBe('pro');
    expect(work?.accountId).toBe('acct-work-123');
    expect(work?.authValid).toBe(true);
    expect(work?.lastUsed).toBe('2026-05-17T05:45:00Z');

    const personal = result.profiles.find((p) => p.name === 'personal');
    expect(personal).toBeDefined();
    expect(personal?.email).toBe('personal@example.com');
    expect(personal?.plan).toBe('free');
    expect(personal?.accountId).toBe('acct-personal-456');
    expect(personal?.authValid).toBe(true);
    expect(personal?.lastUsed).toBeNull();
  });

  it('sets authValid=false and nulls identity fields when auth.json is corrupt JSON', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const brokenDir = path.join(instancesDir, 'broken');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, 'auth.json'), '{ not valid json', {
      mode: 0o600,
    });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: broken\nprofiles:\n  broken:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    expect(result.profiles).toHaveLength(1);
    const broken = result.profiles[0];
    expect(broken?.authValid).toBe(false);
    expect(broken?.email).toBeNull();
    expect(broken?.plan).toBeNull();
    expect(broken?.accountId).toBeNull();
  });

  it('sets authValid=false when id_token is non-empty but malformed', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const brokenDir = path.join(instancesDir, 'broken-jwt');
    fs.mkdirSync(brokenDir, { recursive: true });
    writeRawAuthJson(brokenDir, 'not-a-jwt');

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: broken-jwt\nprofiles:\n  broken-jwt:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    const broken = result.profiles[0];
    expect(broken?.authValid).toBe(false);
    expect(broken?.email).toBeNull();
    expect(broken?.plan).toBeNull();
    expect(broken?.accountId).toBeNull();
  });

  it('sets authValid=false when id_token contains invalid base64url characters', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const brokenDir = path.join(instancesDir, 'broken-base64url');
    fs.mkdirSync(brokenDir, { recursive: true });
    writeRawAuthJson(brokenDir, 'h.e30$.s');

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: broken-base64url\nprofiles:\n  broken-base64url:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    const broken = result.profiles[0];
    expect(broken?.authValid).toBe(false);
  });

  it('sets authValid=true for a valid but sparse JWT payload', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const sparseDir = path.join(instancesDir, 'sparse');
    fs.mkdirSync(sparseDir, { recursive: true });
    writeRawAuthJson(sparseDir, buildToken({}));

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: sparse\nprofiles:\n  sparse:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    const sparse = result.profiles[0];
    expect(sparse?.authValid).toBe(true);
    expect(sparse?.email).toBeNull();
    expect(sparse?.plan).toBeNull();
    expect(sparse?.accountId).toBeNull();
  });

  it('sets authValid=false and nulls identity fields when auth.json is missing', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const noAuthDir = path.join(instancesDir, 'noauth');
    fs.mkdirSync(noAuthDir, { recursive: true });
    // No auth.json written

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: noauth\nprofiles:\n  noauth:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    const profile = result.profiles[0];
    expect(profile?.authValid).toBe(false);
    expect(profile?.email).toBeNull();
    expect(profile?.plan).toBeNull();
    expect(profile?.accountId).toBeNull();
  });

  it('active resolution: CODEX_HOME set externally -> source=explicit-codex-home', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const externalHome = path.join(tmpDir, 'external-codex');
    process.env.CODEX_HOME = externalHome;

    const result = await getCodexAuthProfilesSummary();
    expect(result.active).not.toBeNull();
    expect(result.active?.source).toBe('explicit-codex-home');
    expect(result.active?.codexHome).toBe(externalHome);
  });

  it('active resolution: CCS_CODEX_PROFILE set -> source=env, name=that profile', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    process.env.CCS_CODEX_PROFILE = 'work';

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const workDir = path.join(instancesDir, 'work');
    fs.mkdirSync(workDir, { recursive: true });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: null\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    expect(result.active?.source).toBe('env');
    expect(result.active?.name).toBe('work');
  });

  it('active resolution: ignores stale CCS_CODEX_PROFILE values missing from registry', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    process.env.CCS_CODEX_PROFILE = 'ghost';

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: null\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    expect(result.active).toBeNull();
  });

  it('active resolution: registry default set -> source=default', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const workDir = path.join(instancesDir, 'work');
    fs.mkdirSync(workDir, { recursive: true });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: work\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    expect(result.active?.source).toBe('default');
    expect(result.active?.name).toBe('work');
  });

  it('active resolution: no env, no default -> active=null', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();
    // No registry file, no env vars
    const result = await getCodexAuthProfilesSummary();
    expect(result.active).toBeNull();
  });

  it('returns cached value on second call within 5s when the registry file is unchanged', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const workDir = path.join(instancesDir, 'work');
    fs.mkdirSync(workDir, { recursive: true });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: work\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const first = await getCodexAuthProfilesSummary();
    const second = await getCodexAuthProfilesSummary();

    // Both calls should return same reference (cache hit)
    expect(second).toBe(first);
  });

  it('does not serve cached missing-registry success after a malformed registry appears', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const first = await getCodexAuthProfilesSummary();
    expect(first.profiles).toHaveLength(0);

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(registryPath, '{ invalid: yaml: [', { mode: 0o600 });
    bumpRegistryMtime(registryPath);

    await expect(getCodexAuthProfilesSummary()).rejects.toThrow(/could not be read safely/i);
  });

  it('does not serve cached valid-registry success after the registry becomes malformed', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(registryPath, `version: "1.0"\ndefault: null\nprofiles: {}\n`, {
      mode: 0o600,
    });

    const first = await getCodexAuthProfilesSummary();
    expect(first.profiles).toHaveLength(0);

    fs.writeFileSync(registryPath, '{ invalid: yaml: [', { mode: 0o600 });
    bumpRegistryMtime(registryPath);

    await expect(getCodexAuthProfilesSummary()).rejects.toThrow(/could not be read safely/i);
  });

  it('invalidateCodexAuthProfilesCache forces re-read on next call', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(registryPath, `version: "1.0"\ndefault: null\nprofiles: {}\n`, {
      mode: 0o600,
    });

    const first = await getCodexAuthProfilesSummary();
    expect(first.profiles).toHaveLength(0);

    // Now add a profile
    const instancesDir = path.join(ccsDir, 'codex-instances');
    const newDir = path.join(instancesDir, 'newprofile');
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: newprofile\nprofiles:\n  newprofile:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    invalidateCodexAuthProfilesCache();
    const second = await getCodexAuthProfilesSummary();
    expect(second.profiles).toHaveLength(1);
    expect(second.profiles[0]?.name).toBe('newprofile');
  });

  it('response JSON contains no token substrings', async () => {
    const { getCodexAuthProfilesSummary, invalidateCodexAuthProfilesCache } = await importService();
    invalidateCodexAuthProfilesCache();

    const instancesDir = path.join(ccsDir, 'codex-instances');
    const workDir = path.join(instancesDir, 'work');
    fs.mkdirSync(workDir, { recursive: true });

    writeAuthJson(workDir, {
      email: 'work@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_account_id: 'acct-work',
      },
    });

    const registryPath = path.join(ccsDir, 'codex-profiles.yaml');
    fs.writeFileSync(
      registryPath,
      `version: "1.0"\ndefault: work\nprofiles:\n  work:\n    type: codex\n    created: "2026-01-01T00:00:00Z"\n    last_used: null\n`,
      { mode: 0o600 }
    );

    const result = await getCodexAuthProfilesSummary();
    const serialized = JSON.stringify(result);

    // Security: no raw token material in response
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('refresh_token');
    expect(serialized).not.toContain('id_token');
    // The known sentinel values from writeAuthJson
    expect(serialized).not.toContain('access-token-should-not-appear');
    expect(serialized).not.toContain('refresh-token-should-not-appear');
  });
});
