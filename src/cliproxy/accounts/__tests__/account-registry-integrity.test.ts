import { describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runWithScopedCcsHome } from '../../../utils/config-manager';

async function withIsolatedHome<T>(fn: (homeDir: string) => Promise<T> | T): Promise<T> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-account-registry-'));
  try {
    return await runWithScopedCcsHome(homeDir, () => fn(homeDir));
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

async function loadRegistryModule() {
  return import(`../registry?registry-integrity=${Date.now()}`);
}

async function loadAccountManager() {
  return import(`../account-manager?account-registry-integrity=${Date.now()}`);
}

async function captureConsoleError<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; messages: string[] }> {
  const originalError = console.error;
  const messages: string[] = [];

  console.error = ((...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  }) as typeof console.error;

  try {
    return {
      result: await fn(),
      messages,
    };
  } finally {
    console.error = originalError;
  }
}

function listRegistryBackups(registryPath: string): string[] {
  return fs
    .readdirSync(path.dirname(registryPath))
    .filter((file) => /^accounts\.json\.corrupt-.*\.bak$/.test(file));
}

describe('account registry integrity', () => {
  it('does not create accounts.json during no-op discovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });

      const { discoverExistingAccounts } = await loadRegistryModule();
      discoverExistingAccounts();

      expect(fs.existsSync(registryPath)).toBe(false);
    });
  });

  it('does not write accounts.json during provider account reads', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });

      const { getProviderAccounts } = await loadAccountManager();
      expect(getProviderAccounts('kiro')).toEqual([]);
      expect(fs.existsSync(registryPath)).toBe(false);
    });
  });

  it('removes stale accounts before choosing the next default during registration', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const registryPath = path.join(cliproxyDir, 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'kiro-github-ABC123.json'),
        JSON.stringify({ type: 'kiro' })
      );
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          version: 1,
          providers: {
            kiro: {
              default: 'github-OLD999',
              accounts: {
                'github-OLD999': {
                  nickname: 'old',
                  tokenFile: 'kiro-github-OLD999.json',
                  createdAt: '2025-01-01T00:00:00.000Z',
                  lastUsedAt: '2025-01-01T00:00:00.000Z',
                },
              },
            },
          },
        }),
        'utf8'
      );

      const { registerAccount } = await loadAccountManager();
      const account = registerAccount('kiro', 'kiro-github-ABC123.json');

      const { loadAccountsRegistry } = await loadRegistryModule();
      const registry = loadAccountsRegistry();
      const kiroAccounts = registry.providers.kiro;

      expect(account.id).toBe('github-ABC123');
      expect(kiroAccounts?.default).toBe('github-ABC123');
      expect(kiroAccounts?.accounts['github-OLD999']).toBeUndefined();
      expect(Object.keys(kiroAccounts?.accounts ?? {})).toEqual(['github-ABC123']);
    });
  });

  it('recovers corrupted accounts.json from token-backed accounts and preserves a backup', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'codex-user@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'user@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{not-valid-json', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const accounts = getProviderAccounts('codex');
      const { loadAccountsRegistry } = await loadRegistryModule();
      const registry = loadAccountsRegistry();

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('user@example.com');
      expect(accounts[0]?.isDefault).toBe(true);
      expect(registry.providers.codex?.accounts['user@example.com']?.tokenFile).toBe(
        'codex-user@example.com.json'
      );

      const backups = listRegistryBackups(registryPath);
      expect(backups).toHaveLength(1);
      expect(
        fs.readFileSync(path.join(path.dirname(registryPath), backups[0] as string), 'utf8')
      ).toBe('{not-valid-json');
    });
  });

  it('recovers paused token-backed accounts when rebuilding a corrupted registry', async () => {
    await withIsolatedHome(async (homeDir) => {
      const pausedDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth-paused');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(pausedDir, { recursive: true });
      fs.writeFileSync(
        path.join(pausedDir, 'codex-paused@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'paused@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const accounts = getProviderAccounts('codex');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('paused@example.com');
      expect(accounts[0]?.paused).toBe(true);
    });
  });

  it('surfaces skipped token files only during corruption recovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'codex-valid@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'valid@example.com' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(authDir, 'codex-invalid@example.com.json'),
        JSON.stringify({ type: 123, email: 'invalid@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const { result: accounts, messages } = await captureConsoleError(() =>
        getProviderAccounts('codex')
      );

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('valid@example.com');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Recovered corrupted account registry');
      expect(messages[0]).toContain('auth/codex-invalid@example.com.json');
      expect(messages[0]).toContain('invalid token type');
    });
  });

  it('logs successful corruption recovery even when every token file is recoverable', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'codex-clean@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'clean@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const { result: accounts, messages } = await captureConsoleError(() =>
        getProviderAccounts('codex')
      );

      expect(accounts).toHaveLength(1);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Recovered corrupted account registry');
      expect(messages[0]).toContain('backup saved to');
      expect(messages[0]).not.toContain('skipped');
    });
  });

  it('prefers active tokens over paused duplicates during corruption recovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const pausedDir = path.join(cliproxyDir, 'auth-paused');
      const registryPath = path.join(cliproxyDir, 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.mkdirSync(pausedDir, { recursive: true });

      fs.writeFileSync(
        path.join(authDir, 'codex-shared@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'active@example.com' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pausedDir, 'codex-shared@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'paused@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const accounts = getProviderAccounts('codex');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('active@example.com');
      expect(accounts[0]?.tokenFile).toBe('codex-shared@example.com.json');
      expect(accounts[0]?.paused).toBeUndefined();
    });
  });

  it('infers subdomain emails from token file names during corruption recovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'codex-user@mail.example.com.json'),
        JSON.stringify({ type: 'codex' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      const accounts = getProviderAccounts('codex');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.id).toBe('user@mail.example.com');
      expect(accounts[0]?.email).toBe('user@mail.example.com');
      expect(accounts[0]?.tokenFile).toBe('codex-user@mail.example.com.json');
    });
  });

  it('strips alternate token file prefixes when inferring missing emails', async () => {
    const cases = [
      { provider: 'gemini', tokenFile: 'google-user@example.com.json', type: 'gemini' },
      { provider: 'codex', tokenFile: 'openai-user@example.com.json', type: 'codex' },
      { provider: 'agy', tokenFile: 'antigravity-user@example.com.json', type: 'antigravity' },
      {
        provider: 'ghcp',
        tokenFile: 'github-copilot-user@example.com.json',
        type: 'github-copilot',
      },
    ] as const;

    for (const testCase of cases) {
      await withIsolatedHome(async (homeDir) => {
        const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(
          path.join(authDir, testCase.tokenFile),
          JSON.stringify({ type: testCase.type }),
          'utf8'
        );

        const { discoverExistingAccounts, loadAccountsRegistry } = await loadRegistryModule();
        discoverExistingAccounts();
        const registry = loadAccountsRegistry();
        const providerAccounts = registry.providers[testCase.provider];

        expect(Object.keys(providerAccounts?.accounts ?? {})).toEqual(['user@example.com']);
        expect(providerAccounts?.accounts['user@example.com']?.email).toBe('user@example.com');
        expect(providerAccounts?.accounts['user@example.com']?.tokenFile).toBe(testCase.tokenFile);
      });
    }
  });

  it('preserves the corrupted registry backup when recovery cannot rewrite accounts.json', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'codex-user@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'user@example.com' }),
        'utf8'
      );
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const originalWriteFileSync = fs.writeFileSync;
      const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(((file, data, options) => {
        if (String(file).includes('accounts.json.tmp.')) {
          throw new Error('simulated recovery write failure');
        }

        return originalWriteFileSync(file, data, options as never);
      }) as typeof fs.writeFileSync);

      try {
        const { loadAccountsRegistry } = await loadRegistryModule();

        expect(() => loadAccountsRegistry()).toThrow('simulated recovery write failure');
      } finally {
        writeSpy.mockRestore();
      }

      expect(fs.existsSync(registryPath)).toBe(false);
      const backups = listRegistryBackups(registryPath);
      expect(backups).toHaveLength(1);
      expect(
        fs.readFileSync(path.join(path.dirname(registryPath), backups[0] as string), 'utf8')
      ).toBe('{"providers":');

      const { loadAccountsRegistry } = await loadRegistryModule();
      expect(loadAccountsRegistry()).toEqual({
        version: 1,
        providers: {},
      });
    });
  });

  it('does not repopulate paused tokens during normal startup discovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const pausedDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth-paused');
      const registryPath = path.join(homeDir, '.ccs', 'cliproxy', 'accounts.json');
      fs.mkdirSync(pausedDir, { recursive: true });
      fs.writeFileSync(
        path.join(pausedDir, 'codex-paused@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'paused@example.com' }),
        'utf8'
      );

      const { discoverExistingAccounts } = await loadRegistryModule();
      discoverExistingAccounts();

      expect(fs.existsSync(registryPath)).toBe(false);

      const { getProviderAccounts } = await loadAccountManager();
      expect(getProviderAccounts('codex')).toEqual([]);
    });
  });

  it('splits a collapsed same-email Claude entry into one account per organization', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const registryPath = path.join(cliproxyDir, 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      for (const [tokenFile, email] of [
        ['claude-1a2b3c4d-solo@example.com.json', 'solo@example.com'],
        ['claude-a1b2c3d4-dev@example.com.json', 'dev@example.com'],
        ['claude-f0e1d2c3-dev@example.com.json', 'dev@example.com'],
      ]) {
        fs.writeFileSync(
          path.join(authDir, tokenFile),
          JSON.stringify({ type: 'claude', email }),
          'utf8'
        );
      }
      // Registry written before Claude supported duplicate emails: both organizations
      // collapsed onto one bare-email entry and the other token file was orphaned.
      const soloAccount = {
        email: 'solo@example.com',
        nickname: 'solo',
        tokenFile: 'claude-1a2b3c4d-solo@example.com.json',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-03T00:00:00.000Z',
      };
      const collapsedAccount = {
        email: 'dev@example.com',
        nickname: 'work',
        tokenFile: 'claude-f0e1d2c3-dev@example.com.json',
        createdAt: '2026-01-02T00:00:00.000Z',
        lastUsedAt: '2026-01-02T00:00:00.000Z',
      };
      const collapsedRegistry = JSON.stringify({
        version: 1,
        providers: {
          claude: {
            default: 'dev@example.com',
            accounts: {
              'solo@example.com': soloAccount,
              'dev@example.com': collapsedAccount,
            },
          },
        },
      });
      fs.writeFileSync(registryPath, collapsedRegistry, 'utf8');

      const { getProviderAccounts } = await loadAccountManager();
      expect(
        getProviderAccounts('claude')
          .map((account) => [account.id, account.isDefault])
          .sort()
      ).toEqual([
        ['dev@example.com#a1b2c3d4', false],
        ['dev@example.com#f0e1d2c3', true],
        ['solo@example.com', false],
      ]);
      expect(fs.readFileSync(registryPath, 'utf8')).toBe(collapsedRegistry);

      const { discoverExistingAccounts, loadAccountsRegistry } = await loadRegistryModule();
      discoverExistingAccounts();
      const claudeAccounts = loadAccountsRegistry().providers.claude;

      expect(claudeAccounts?.default).toBe('dev@example.com#f0e1d2c3');
      expect(Object.keys(claudeAccounts?.accounts ?? {}).sort()).toEqual([
        'dev@example.com#a1b2c3d4',
        'dev@example.com#f0e1d2c3',
        'solo@example.com',
      ]);
      expect(claudeAccounts?.accounts['solo@example.com']).toEqual(soloAccount);
      expect(claudeAccounts?.accounts['dev@example.com#f0e1d2c3']).toEqual(collapsedAccount);
      expect(claudeAccounts?.accounts['dev@example.com#a1b2c3d4']).toMatchObject({
        email: 'dev@example.com',
        nickname: 'dev-a1b2c3d4',
        tokenFile: 'claude-a1b2c3d4-dev@example.com.json',
      });

      const migratedRegistry = fs.readFileSync(registryPath, 'utf8');
      discoverExistingAccounts();
      expect(fs.readFileSync(registryPath, 'utf8')).toBe(migratedRegistry);
    });
  });

  it('keeps same-email Claude organization ids and entries while either one is paused', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const pausedDir = path.join(cliproxyDir, 'auth-paused');
      const teamFile = 'claude-a1b2c3d4-dev@example.com.json';
      const personalFile = 'claude-f0e1d2c3-dev@example.com.json';
      fs.mkdirSync(authDir, { recursive: true });
      for (const tokenFile of [teamFile, personalFile]) {
        fs.writeFileSync(
          path.join(authDir, tokenFile),
          JSON.stringify({ type: 'claude', email: 'dev@example.com' }),
          'utf8'
        );
      }

      const { discoverExistingAccounts, loadAccountsRegistry, pauseAccount, resumeAccount } =
        await loadRegistryModule();
      const { getProviderAccounts } = await loadAccountManager();
      const describeAccounts = () =>
        getProviderAccounts('claude')
          .map((account) => [account.id, account.tokenFile, account.nickname, !!account.paused])
          .sort();
      discoverExistingAccounts();

      expect(pauseAccount('claude', 'dev@example.com#a1b2c3d4')).toBe(true);
      discoverExistingAccounts();
      expect(describeAccounts()).toEqual([
        ['dev@example.com#a1b2c3d4', teamFile, 'dev-a1b2c3d4', true],
        ['dev@example.com#f0e1d2c3', personalFile, 'dev-f0e1d2c3', false],
      ]);

      expect(pauseAccount('claude', 'dev@example.com#f0e1d2c3')).toBe(true);
      expect(resumeAccount('claude', 'dev@example.com#a1b2c3d4')).toBe(true);
      discoverExistingAccounts();

      expect(describeAccounts()).toEqual([
        ['dev@example.com#a1b2c3d4', teamFile, 'dev-a1b2c3d4', false],
        ['dev@example.com#f0e1d2c3', personalFile, 'dev-f0e1d2c3', true],
      ]);
      expect(Object.keys(loadAccountsRegistry().providers.claude?.accounts ?? {}).sort()).toEqual([
        'dev@example.com#a1b2c3d4',
        'dev@example.com#f0e1d2c3',
      ]);
      expect(fs.readdirSync(pausedDir)).toEqual([personalFile]);
    });
  });

  it('applies account mutations to hydrated Claude organization ids before discovery', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const authDir = path.join(cliproxyDir, 'auth');
      const registryPath = path.join(cliproxyDir, 'accounts.json');
      fs.mkdirSync(authDir, { recursive: true });
      for (const [tokenFile, email] of [
        ['claude-a1b2c3d4-dev@example.com.json', 'dev@example.com'],
        ['claude-f0e1d2c3-dev@example.com.json', 'dev@example.com'],
        ['claude-1a2b3c4d-solo@example.com.json', 'solo@example.com'],
      ]) {
        fs.writeFileSync(
          path.join(authDir, tokenFile),
          JSON.stringify({ type: 'claude', email }),
          'utf8'
        );
      }
      const collapsedAccount = {
        email: 'dev@example.com',
        nickname: 'work',
        tokenFile: 'claude-f0e1d2c3-dev@example.com.json',
        createdAt: '2026-01-02T00:00:00.000Z',
        lastUsedAt: '2026-01-02T00:00:00.000Z',
      };
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          version: 1,
          providers: {
            claude: {
              default: 'solo@example.com',
              accounts: {
                'solo@example.com': {
                  email: 'solo@example.com',
                  nickname: 'solo',
                  tokenFile: 'claude-1a2b3c4d-solo@example.com.json',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  lastUsedAt: '2026-01-01T00:00:00.000Z',
                },
                'dev@example.com': collapsedAccount,
              },
            },
          },
        }),
        'utf8'
      );

      const { loadAccountsRegistry, renameAccount, setDefaultAccount } = await loadRegistryModule();
      expect(setDefaultAccount('claude', 'dev@example.com#a1b2c3d4')).toBe(true);
      expect(renameAccount('claude', 'dev@example.com#a1b2c3d4', 'team')).toBe(true);

      const claudeAccounts = loadAccountsRegistry().providers.claude;
      expect(claudeAccounts?.default).toBe('dev@example.com#a1b2c3d4');
      expect(claudeAccounts?.accounts['solo@example.com']?.nickname).toBe('solo');
      expect(claudeAccounts?.accounts['dev@example.com#f0e1d2c3']).toEqual(collapsedAccount);
      expect(claudeAccounts?.accounts['dev@example.com#a1b2c3d4']).toMatchObject({
        nickname: 'team',
        tokenFile: 'claude-a1b2c3d4-dev@example.com.json',
      });
      expect(setDefaultAccount('claude', 'dev@example.com')).toBe(false);
    });
  });

  it('recovers to an empty registry when no token files are available', async () => {
    await withIsolatedHome(async (homeDir) => {
      const cliproxyDir = path.join(homeDir, '.ccs', 'cliproxy');
      const registryPath = path.join(cliproxyDir, 'accounts.json');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      fs.writeFileSync(registryPath, '{"providers":', 'utf8');

      const { loadAccountsRegistry } = await loadRegistryModule();
      const { result: registry, messages } = await captureConsoleError(() =>
        loadAccountsRegistry()
      );

      expect(registry).toEqual({
        version: 1,
        providers: {},
      });
      expect(fs.existsSync(registryPath)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Recovered corrupted account registry');
      expect(messages[0]).toContain('backup saved to');
      expect(listRegistryBackups(registryPath)).toHaveLength(1);
    });
  });
});
