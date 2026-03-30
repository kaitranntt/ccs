import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runWithScopedCcsHome } from '../../../src/utils/config-manager';

async function loadAccountManager() {
  return import(`../../../src/cliproxy/account-manager?optional-nickname=${Date.now()}`);
}

function writeTokenFile(homeDir: string, tokenFile: string): void {
  const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, tokenFile), '{}', 'utf8');
}

async function withIsolatedHome<T>(fn: (homeDir: string) => Promise<T> | T): Promise<T> {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-optional-nickname-'));
  try {
    return await runWithScopedCcsHome(testDir, () => fn(testDir));
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

describe('registerAccount optional nickname flow', () => {
  it('uses a filename-derived id when Kiro/GHCP nickname is omitted', async () => {
    const account = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-github-ABC123.json');
      const { registerAccount } = await loadAccountManager();
      return registerAccount('kiro', 'kiro-github-ABC123.json');
    });

    expect(account.id).toBe('github-ABC123');
    expect(account.nickname).toBe('github-ABC123');
  });

  it('falls back to provider-scoped sequential ids when the filename is not descriptive', async () => {
    const { first, second } = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-nomail.json');
      writeTokenFile(homeDir, 'kiro-second.json');
      const { registerAccount } = await loadAccountManager();
      return {
        first: registerAccount('kiro', 'kiro-nomail.json'),
        second: registerAccount('kiro', 'kiro-second.json'),
      };
    });

    expect(first.id).toBe('kiro-1');
    expect(first.nickname).toBe('kiro-1');
    expect(second.id).toBe('kiro-2');
    expect(second.nickname).toBe('kiro-2');
  });

  it('keeps user nicknames optional metadata separate from internal ids', async () => {
    const account = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'ghcp-amazon-XYZ789.json');
      const { registerAccount } = await loadAccountManager();
      return registerAccount('ghcp', 'ghcp-amazon-XYZ789.json', undefined, 'work');
    });

    expect(account.id).toBe('amazon-XYZ789');
    expect(account.nickname).toBe('work');
  });

  it('preserves an existing custom nickname when the same token file is re-registered', async () => {
    const reauthenticated = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-github-ABC123.json');
      const { registerAccount } = await loadAccountManager();
      registerAccount('kiro', 'kiro-github-ABC123.json', undefined, 'work');
      return registerAccount('kiro', 'kiro-github-ABC123.json');
    });

    expect(reauthenticated.id).toBe('github-ABC123');
    expect(reauthenticated.nickname).toBe('work');
  });

  it('rejects nickname collisions against existing account ids and nicknames', async () => {
    await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-github-ABC123.json');
      writeTokenFile(homeDir, 'kiro-google-XYZ789.json');
      writeTokenFile(homeDir, 'kiro-google-NEW123.json');
      const { registerAccount, renameAccount } = await loadAccountManager();
      registerAccount('kiro', 'kiro-github-ABC123.json');
      const second = registerAccount('kiro', 'kiro-google-XYZ789.json', undefined, 'personal');

      expect(() =>
        registerAccount('kiro', 'kiro-google-NEW123.json', undefined, 'github-ABC123')
      ).toThrow(/already exists/i);
      expect(() => renameAccount('kiro', second.id, 'github-ABC123')).toThrow(/already used/i);
    });
  });

  it('avoids auto-generated ids that would collide with an existing nickname', async () => {
    const added = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-github-ABC123.json');
      writeTokenFile(homeDir, 'kiro-google-XYZ789.json');
      const { registerAccount } = await loadAccountManager();
      registerAccount('kiro', 'kiro-github-ABC123.json', undefined, 'google-XYZ789');
      return registerAccount('kiro', 'kiro-google-XYZ789.json');
    });

    expect(added.id).toBe('kiro-1');
    expect(added.nickname).toBe('kiro-1');
  });

  it('does not resolve ambiguous nickname prefixes to the first generated account', async () => {
    const match = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'kiro-github-ABC123.json');
      writeTokenFile(homeDir, 'kiro-github-DEF456.json');
      const { registerAccount, findAccountByQuery } = await loadAccountManager();
      registerAccount('kiro', 'kiro-github-ABC123.json');
      registerAccount('kiro', 'kiro-github-DEF456.json');
      return findAccountByQuery('kiro', 'github');
    });

    expect(match).toBeNull();
  });

  it('treats duplicate Codex emails as distinct accounts and rejects bare-email lookups', async () => {
    const result = await withIsolatedHome(async (homeDir) => {
      writeTokenFile(homeDir, 'codex-04a0f049-kaidu.kd@gmail.com-team.json');
      writeTokenFile(homeDir, 'codex-kaidu.kd@gmail.com-free.json');
      const { registerAccount, getProviderAccounts, findAccountByQuery } = await loadAccountManager();
      const team = registerAccount(
        'codex',
        'codex-04a0f049-kaidu.kd@gmail.com-team.json',
        'kaidu.kd@gmail.com'
      );
      const free = registerAccount(
        'codex',
        'codex-kaidu.kd@gmail.com-free.json',
        'kaidu.kd@gmail.com'
      );

      return {
        team,
        free,
        accounts: getProviderAccounts('codex'),
        ambiguousLookup: findAccountByQuery('codex', 'kaidu.kd@gmail.com'),
        teamLookup: findAccountByQuery('codex', 'kaidu.kd@gmail.com#04a0f049-team'),
        freeLookup: findAccountByQuery('codex', free.id),
      };
    });

    expect(result.team.id).toBe('kaidu.kd@gmail.com');
    expect(result.free.id).toBe('kaidu.kd@gmail.com#free');
    expect(result.accounts.map((account) => account.id).sort()).toEqual([
      'kaidu.kd@gmail.com#04a0f049-team',
      'kaidu.kd@gmail.com#free',
    ]);
    expect(result.ambiguousLookup).toBeNull();
    expect(result.teamLookup?.id).toBe('kaidu.kd@gmail.com#04a0f049-team');
    expect(result.freeLookup?.id).toBe('kaidu.kd@gmail.com#free');
  });
});
