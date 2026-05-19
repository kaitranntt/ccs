import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { handlePersistCommand } from '../../../src/commands/persist-command';
import { createEmptyUnifiedConfig } from '../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../src/config/unified-config-loader';
import { runWithScopedCcsHome } from '../../../src/utils/config-manager';

interface RestoreFixture {
  claudeDir: string;
  settingsPath: string;
  backupPath: string;
  timestamp: string;
  originalSettings: Record<string, unknown>;
  backupSettings: Record<string, unknown>;
}

let tempRoot: string;
let originalClaudeConfigDir: string | undefined;
let originalProcessExit: typeof process.exit;
let originalFsOpen: typeof fs.promises.open;
let originalFsRename: typeof fs.promises.rename;

async function withScopedHome<T>(fn: () => Promise<T>): Promise<T> {
  return await runWithScopedCcsHome(tempRoot, fn);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function createRestoreFixture(
  options: {
    timestamp?: string;
    originalSettings?: Record<string, unknown>;
    backupSettings?: Record<string, unknown>;
  } = {}
): Promise<RestoreFixture> {
  const timestamp = options.timestamp ?? '20260110_205324';
  const claudeDir = path.join(tempRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const backupPath = `${settingsPath}.backup.${timestamp}`;

  const originalSettings = options.originalSettings ?? {
    env: { ORIGINAL_TOKEN: 'original-value' },
    permissions: { defaultMode: 'plan' },
  };
  const backupSettings = options.backupSettings ?? {
    env: { NEW_TOKEN: 'new-value' },
    permissions: { defaultMode: 'acceptEdits' },
  };

  await fs.promises.mkdir(claudeDir, { recursive: true });
  await fs.promises.writeFile(
    settingsPath,
    JSON.stringify(originalSettings, null, 2) + '\n',
    'utf8'
  );
  await fs.promises.writeFile(backupPath, JSON.stringify(backupSettings, null, 2) + '\n', 'utf8');

  return { claudeDir, settingsPath, backupPath, timestamp, originalSettings, backupSettings };
}

function stubProcessExit(): void {
  process.exit = ((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as typeof process.exit;
}

beforeEach(async () => {
  tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ccs-persist-handler-test-'));
  originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  // Clear CLAUDE_CONFIG_DIR so scoped CCS_HOME takes effect (leaks from host CCS session)
  delete process.env.CLAUDE_CONFIG_DIR;
  originalProcessExit = process.exit;
  originalFsOpen = fs.promises.open;
  originalFsRename = fs.promises.rename;
});

afterEach(async () => {
  process.exit = originalProcessExit;
  fs.promises.open = originalFsOpen;
  fs.promises.rename = originalFsRename;

  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  }

  if (tempRoot) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
});

describe('persist command real handler paths', () => {
  it('throws parseError for missing --permission-mode before profile detection', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['glm', '--permission-mode']))
    ).rejects.toThrow('Missing value for --permission-mode');
  });

  it('throws parseError for empty inline --permission-mode before profile detection', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['glm', '--permission-mode=']))
    ).rejects.toThrow('Missing value for --permission-mode');
  });

  it('throws parseError for invalid --permission-mode before profile detection', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['glm', '--permission-mode', 'invalid-mode']))
    ).rejects.toThrow(/Invalid --permission-mode/);
  });

  it('throws parseError for unknown flags on real handler path', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['glm', '--unknown-flag']))
    ).rejects.toThrow(/Unknown option\(s\)/);
  });

  it('throws parseError for list/restore conflict on real handler path', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['--list-backups', '--restore']))
    ).rejects.toThrow('--list-backups cannot be used with --restore');
  });

  it('throws parseError for permission flags with --restore on real handler path', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['--restore', '--auto-approve']))
    ).rejects.toThrow(/Permission flags are not valid with backup operations/);
  });

  it('shows help when --help is present even with other invalid args', async () => {
    await expect(
      withScopedHome(() => handlePersistCommand(['--help', '--permission-mode']))
    ).resolves.toBeUndefined();
  });

  it('does not create CLAUDE_CONFIG_DIR on parseError path', async () => {
    const isolatedClaudeDir = path.join(tempRoot, '.claude-parse-early');
    process.env.CLAUDE_CONFIG_DIR = isolatedClaudeDir;

    await expect(
      withScopedHome(() => handlePersistCommand(['glm', '--permission-mode=']))
    ).rejects.toThrow('Missing value for --permission-mode');
    expect(await pathExists(isolatedClaudeDir)).toBe(false);
  });
});

describe('persist command restore failure handling', () => {
  it('exits when lock cannot be acquired (concurrency protection)', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    const release = await lockfile.lock(fixture.claudeDir, {
      stale: 60000,
      retries: { retries: 0 },
      realpath: false,
    });

    stubProcessExit();
    try {
      await expect(
        withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
      ).rejects.toThrow('process.exit(1)');
    } finally {
      await release();
    }
  });

  it('exits when backup read fails with ENOENT after selection', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    fs.promises.open = (async (...args: Parameters<typeof fs.promises.open>) => {
      const target = String(args[0]);
      if (target === fixture.backupPath) {
        const error = new Error('forced missing backup') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return originalFsOpen(...args);
    }) as typeof fs.promises.open;

    stubProcessExit();
    await expect(
      withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits when backup read fails with ELOOP (symlink rejection)', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    fs.promises.open = (async (...args: Parameters<typeof fs.promises.open>) => {
      const target = String(args[0]);
      if (target === fixture.backupPath) {
        const error = new Error('forced symlink rejection') as NodeJS.ErrnoException;
        error.code = 'ELOOP';
        throw error;
      }
      return originalFsOpen(...args);
    }) as typeof fs.promises.open;

    stubProcessExit();
    await expect(
      withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
    ).rejects.toThrow('process.exit(1)');
  });

  it('exits when backup path resolves to a non-regular file', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    fs.promises.open = (async (...args: Parameters<typeof fs.promises.open>) => {
      const target = String(args[0]);
      if (target === fixture.backupPath) {
        const fakeHandle = {
          stat: async () => ({ isFile: () => false }),
          readFile: async () => '',
          close: async () => undefined,
        } as unknown as fs.promises.FileHandle;
        return fakeHandle;
      }
      return originalFsOpen(...args);
    }) as typeof fs.promises.open;

    stubProcessExit();
    await expect(
      withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
    ).rejects.toThrow('process.exit(1)');
  });

  it('rolls back settings when restore write fails mid-flight', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    let renameCalls = 0;
    fs.promises.rename = (async (...args: Parameters<typeof fs.promises.rename>) => {
      renameCalls += 1;
      if (renameCalls === 1) {
        throw new Error('forced rename failure');
      }
      return originalFsRename(...args);
    }) as typeof fs.promises.rename;

    stubProcessExit();
    await expect(
      withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
    ).rejects.toThrow('process.exit(1)');

    const finalContent = await fs.promises.readFile(fixture.settingsPath, 'utf8');
    const finalSettings = JSON.parse(finalContent);
    expect(finalSettings).toEqual(fixture.originalSettings);
  });

  it('includes dual failure context when restore write and rollback both fail', async () => {
    const fixture = await createRestoreFixture();
    process.env.CLAUDE_CONFIG_DIR = fixture.claudeDir;

    fs.promises.rename = (async () => {
      throw new Error('forced rename failure');
    }) as typeof fs.promises.rename;

    const originalConsoleLog = console.log;
    const capturedLogs: string[] = [];
    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.map((arg) => String(arg)).join(' '));
    };

    stubProcessExit();
    try {
      await expect(
        withScopedHome(() => handlePersistCommand(['--restore', fixture.timestamp, '--yes']))
      ).rejects.toThrow('process.exit(1)');
      expect(capturedLogs.some((line) => line.includes('Rollback also failed'))).toBe(true);
    } finally {
      console.log = originalConsoleLog;
    }
  });
});

describe('persist command Claude extension parity', () => {
  async function writeUnifiedConfig(): Promise<void> {
    const config = createEmptyUnifiedConfig();
    config.accounts.work = {
      created: '2026-03-15T00:00:00.000Z',
      last_used: null,
      context_mode: 'isolated',
    };
    config.default = 'work';
    config.profiles.glm = {
      type: 'api',
      settings: path.join(tempRoot, '.ccs', 'glm.settings.json'),
    };
    config.cliproxy.variants.codex = {
      provider: 'codex',
      settings: path.join(tempRoot, '.ccs', 'codex.settings.json'),
    };

    await fs.promises.mkdir(path.join(tempRoot, '.ccs'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempRoot, '.ccs', 'glm.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.test',
            ANTHROPIC_API_KEY: 'sk-ant-test-123456',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    await withScopedHome(async () => {
      saveUnifiedConfig(config);
    });
  }

  it('persists account profiles via CLAUDE_CONFIG_DIR and clears stale managed env keys', async () => {
    await writeUnifiedConfig();

    const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
    await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_API_KEY: 'stale-key',
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
            KEEP_ME: 'still-here',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    await withScopedHome(() => handlePersistCommand(['work', '--yes']));

    const persisted = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.KEEP_ME).toBe('still-here');
    expect(persisted.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persisted.env.CLAUDE_CONFIG_DIR).toBe(path.join(tempRoot, '.ccs', 'instances', 'work'));
    expect(fs.existsSync(persisted.env.CLAUDE_CONFIG_DIR)).toBe(true);
  });

  it('persists default profile using mapped account continuity and preserves unrelated env', async () => {
    await writeUnifiedConfig();

    const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
    await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_AUTH_TOKEN: 'stale-token',
            ANTHROPIC_MODEL: 'stale-model',
            KEEP_ME: 'still-here',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    await withScopedHome(() => handlePersistCommand(['default', '--yes']));

    const persisted = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.KEEP_ME).toBe('still-here');
    expect(persisted.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(persisted.env.ANTHROPIC_MODEL).toBeUndefined();
    expect(persisted.env.CLAUDE_CONFIG_DIR).toBe(path.join(tempRoot, '.ccs', 'instances', 'work'));
    expect(fs.existsSync(persisted.env.CLAUDE_CONFIG_DIR)).toBe(true);
  });

  it('blocks Codex CLIProxy profiles from Claude settings persistence', async () => {
    await writeUnifiedConfig();

    const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
    await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.promises.writeFile(
      settingsPath,
      JSON.stringify(
        {
          env: {
            KEEP_ME: 'still-here',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const originalConsoleLog = console.log;
    const capturedLogs: string[] = [];
    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.map((arg) => String(arg)).join(' '));
    };

    stubProcessExit();
    try {
      await expect(withScopedHome(() => handlePersistCommand(['codex', '--yes']))).rejects.toThrow(
        'process.exit(1)'
      );
    } finally {
      console.log = originalConsoleLog;
    }

    const renderedLogs = capturedLogs.join('\n');
    expect(renderedLogs).toContain('Codex CLIProxy profile');
    expect(renderedLogs).toContain('ccsxp');
    expect(renderedLogs).toContain('ccs persist default --yes');

    const persisted = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.KEEP_ME).toBe('still-here');
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});
