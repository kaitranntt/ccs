import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

let getCodexAuthRegistryPath: () => string;
let getCodexInstancesDir: () => string;
let resolveCodexProfileDir: (name: string) => string;
let getSharedCodexConfigPath: () => string;

const ORIGINAL_CCS_HOME = process.env.CCS_HOME;

beforeEach(async () => {
  process.env.CCS_HOME = '/tmp/test-ccs-home';
  // Re-import to pick up env change — use dynamic import with cache busting
  const mod = await import('../../../src/codex-auth/codex-profile-paths');
  getCodexAuthRegistryPath = mod.getCodexAuthRegistryPath;
  getCodexInstancesDir = mod.getCodexInstancesDir;
  resolveCodexProfileDir = mod.resolveCodexProfileDir;
  getSharedCodexConfigPath = mod.getSharedCodexConfigPath;
});

afterEach(() => {
  if (ORIGINAL_CCS_HOME === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = ORIGINAL_CCS_HOME;
  }
});

describe('codex-profile-paths', () => {
  it('getCodexAuthRegistryPath returns codex-profiles.yaml inside getCcsDir()', () => {
    const result = getCodexAuthRegistryPath();
    expect(result).toContain('codex-profiles.yaml');
    expect(result).toContain('.ccs');
  });

  it('getCodexInstancesDir returns codex-instances inside getCcsDir()', () => {
    const result = getCodexInstancesDir();
    expect(result).toContain('codex-instances');
    expect(result).toContain('.ccs');
  });

  it('resolveCodexProfileDir returns instancesDir/<name>', () => {
    const instancesDir = getCodexInstancesDir();
    const profileDir = resolveCodexProfileDir('work');
    expect(profileDir).toBe(path.join(instancesDir, 'work'));
  });

  it('resolveCodexProfileDir correctly nests a different profile name', () => {
    const instancesDir = getCodexInstancesDir();
    const profileDir = resolveCodexProfileDir('personal');
    expect(profileDir).toBe(path.join(instancesDir, 'personal'));
  });

  it('getSharedCodexConfigPath resolves under os.homedir() not getCcsDir()', () => {
    const result = getSharedCodexConfigPath();
    // Must equal os.homedir()/.codex/config.toml — uses real homedir, not getCcsDir()
    expect(result).toBe(path.join(os.homedir(), '.codex', 'config.toml'));
    // Must end with the Codex-canonical path fragment
    expect(result).toMatch(/\.codex[/\\]config\.toml$/);
    // Must NOT end inside the .ccs directory (i.e. not a CCS-owned path)
    expect(result).not.toContain(path.join('.ccs', 'codex'));
  });
});
