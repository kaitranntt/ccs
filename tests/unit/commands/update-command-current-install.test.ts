import { beforeEach, describe, expect, it } from 'bun:test';
import type { UpdateCommandDeps } from '../../../src/commands/update-command';
import type { UpdateResult } from '../../../src/utils/update-checker';

let logLines: string[] = [];
let spawnCalls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
let exitCodes: number[] = [];

type InstalledState = {
  version: string | null;
  packageJsonMtimeMs: number | null;
  scriptMtimeMs: number | null;
};

type Scenario = {
  beforeState: InstalledState;
  afterState: InstalledState;
};

let scenario: Scenario;
let updateCheckResult: UpdateResult;
let currentInstallOverride: ReturnType<typeof installDescriptor>;
let stateReads = 0;

function installDescriptor(manager: 'npm' | 'bun' | 'yarn' | 'pnpm' = 'npm') {
  return {
    manager,
    scriptPath: '/tmp/ccs-prefix/bin/ccs',
    resolvedScriptPath: '/tmp/ccs-prefix/lib/node_modules/@kaitranntt/ccs/dist/ccs.js',
    packageRoot: '/tmp/ccs-prefix/lib/node_modules/@kaitranntt/ccs',
    prefix: '/tmp/ccs-prefix',
    detectionSource: 'path' as const,
  };
}

function createDeps(overrides: Partial<UpdateCommandDeps> = {}): Partial<UpdateCommandDeps> {
  return {
    initUI: async () => {},
    getVersion: () => '7.67.0-dev.5',
    log: (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    },
    exit: ((code?: number) => {
      exitCodes.push(code ?? 0);
    }) as typeof process.exit,
    detectCurrentInstall: () => currentInstallOverride,
    buildPackageManagerEnv: () => {
      if (currentInstallOverride.manager === 'npm') {
        return {
          PATH: '/usr/bin',
          npm_config_prefix: '/tmp/ccs-prefix',
          NPM_CONFIG_PREFIX: '/tmp/ccs-prefix',
        };
      }

      if (currentInstallOverride.manager === 'bun') {
        return { PATH: '/usr/bin', BUN_INSTALL: '/tmp/bun-prefix' };
      }

      if (currentInstallOverride.manager === 'yarn') {
        return { PATH: '/usr/bin', YARN_GLOBAL_FOLDER: '/tmp/yarn-prefix' };
      }

      return { PATH: '/usr/bin', PNPM_HOME: '/tmp/pnpm-prefix' };
    },
    formatManualUpdateCommand: () => {
      if (currentInstallOverride.manager === 'npm') {
        return 'NPM_CONFIG_PREFIX=/tmp/ccs-prefix npm install -g @kaitranntt/ccs@dev';
      }

      if (currentInstallOverride.manager === 'bun') {
        return 'BUN_INSTALL=/tmp/bun-prefix bun add -g @kaitranntt/ccs@dev';
      }

      if (currentInstallOverride.manager === 'yarn') {
        return 'YARN_GLOBAL_FOLDER=/tmp/yarn-prefix yarn global add @kaitranntt/ccs@dev';
      }

      return 'PNPM_HOME=/tmp/pnpm-prefix pnpm add -g @kaitranntt/ccs@dev';
    },
    readInstalledPackageState: () => {
      stateReads += 1;
      return stateReads === 1 ? scenario.beforeState : scenario.afterState;
    },
    compareVersionsWithPrerelease: (left: string, right: string) => left.localeCompare(right),
    checkForUpdates: async () => updateCheckResult,
    spawn: ((command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      spawnCalls.push({ command, args, env: options?.env });
      return {
        stderr: undefined,
        on: (event: string, callback: (code?: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
        },
      };
    }) as unknown as UpdateCommandDeps['spawn'],
    ...overrides,
  };
}

async function loadHandleUpdateCommand() {
  const mod = await import(
    `../../../src/commands/update-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleUpdateCommand;
}

beforeEach(() => {
  logLines = [];
  spawnCalls = [];
  exitCodes = [];
  stateReads = 0;
  scenario = {
    beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    afterState: { version: '7.67.0-dev.9', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
  };
  updateCheckResult = {
    status: 'update_available',
    current: '7.67.0-dev.5',
    latest: '7.67.0-dev.9',
  };
  currentInstallOverride = installDescriptor();
});

describe('update-command current install handling', () => {
  it('updates through the current install manager and prefix', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    await handleUpdateCommand({ beta: true }, createDeps());

    const installCall = spawnCalls.find((call) => call.args.includes('install'));

    expect(installCall?.command).toBe('npm');
    expect(installCall?.args).toEqual(['install', '-g', '@kaitranntt/ccs@dev']);
    expect(installCall?.env?.npm_config_prefix).toBe('/tmp/ccs-prefix');
    expect(exitCodes).toContain(0);
  });

  it('fails when another manager updated elsewhere but the current binary stayed stale', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };

    await handleUpdateCommand({ beta: true }, createDeps());

    expect(logLines.join('\n')).toContain('outside the current installation');
    expect(logLines.join('\n')).toContain(
      'NPM_CONFIG_PREFIX=/tmp/ccs-prefix npm install -g @kaitranntt/ccs@dev'
    );
    expect(exitCodes).toContain(1);
  });

  it('keeps force mode under exact target-version verification', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };

    await handleUpdateCommand({ force: true, beta: true }, createDeps());

    expect(logLines.join('\n')).toContain('outside the current installation');
    expect(exitCodes).toContain(1);
  });

  it('warns but succeeds when target resolution says no update and the current install stays unchanged', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    updateCheckResult = { status: 'no_update' };

    await handleUpdateCommand({ force: true, beta: true }, createDeps());

    expect(logLines.join('\n')).toContain('could not prove that the current installation changed');
    expect(exitCodes).toContain(0);
  });

  it('warns but succeeds when target version resolution fails and the current install stays unchanged', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    updateCheckResult = { status: 'check_failed', message: 'network' };

    await handleUpdateCommand({ force: true, beta: true }, createDeps());

    expect(logLines.join('\n')).toContain('could not prove that the current installation changed');
    expect(exitCodes).toContain(0);
  });

  it('uses the injected version in the no-update message', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    updateCheckResult = { status: 'no_update' };

    await handleUpdateCommand(
      {},
      createDeps({
        getVersion: () => '9.9.9-test.1',
      })
    );

    expect(logLines.join('\n')).toContain('latest version (9.9.9-test.1)');
    expect(exitCodes).toContain(0);
  });

  it('accepts a newer installed version when the dist-tag moves during update', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.1-dev.0', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
    };

    await handleUpdateCommand({ beta: true }, createDeps());

    expect(logLines.join('\n')).not.toContain('outside the current installation');
    expect(exitCodes).toContain(0);
  });

  it('accepts force reinstall when the version stays the same but the current install files change', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
    };
    updateCheckResult = { status: 'no_update' };

    await handleUpdateCommand({ force: true, beta: true }, createDeps());

    expect(logLines.join('\n')).not.toContain(
      'could not verify that the current installation changed'
    );
    expect(exitCodes).toContain(0);
  });

  it.each([
    ['bun', 'add', 'BUN_INSTALL', '/tmp/bun-prefix'],
    ['yarn', 'global', 'YARN_GLOBAL_FOLDER', '/tmp/yarn-prefix'],
    ['pnpm', 'add', 'PNPM_HOME', '/tmp/pnpm-prefix'],
  ])(
    'routes updates through the current %s install and env',
    async (manager, expectedArg, envKey, envValue) => {
      const handleUpdateCommand = await loadHandleUpdateCommand();
      currentInstallOverride = {
        ...installDescriptor(),
        manager: manager as 'bun' | 'yarn' | 'pnpm',
        prefix: envValue,
      };

      await handleUpdateCommand({ beta: true }, createDeps());

      const updateCall = spawnCalls.find(
        (call) =>
          call.command === manager && call.args.some((arg) => arg.includes('@kaitranntt/ccs@dev'))
      );

      expect(updateCall?.args).toContain(expectedArg);
      expect(updateCall?.env?.[envKey]).toBe(envValue);
      expect(exitCodes).toContain(0);
    }
  );
});
