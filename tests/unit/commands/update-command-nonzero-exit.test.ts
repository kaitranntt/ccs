import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { UpdateCommandDeps } from '../../../src/commands/update-command';
import { findGlobalManifestIssues } from '../../../src/utils/bun-global-manifest';
import type { UpdateResult } from '../../../src/utils/update-checker';

type InstalledState = {
  version: string | null;
  packageJsonMtimeMs: number | null;
  scriptMtimeMs: number | null;
};

let logLines: string[] = [];
let exitCodes: number[] = [];
let stateReads = 0;
let beforeState: InstalledState;
let afterState: InstalledState;
let installExitCode = 1;
let manifestIssue: ReturnType<typeof findGlobalManifestIssues> = null;
let tempDirs: string[] = [];

const bunInstall = {
  manager: 'bun' as const,
  scriptPath: '/tmp/bun-prefix/bin/ccs',
  resolvedScriptPath: '/tmp/bun-prefix/install/global/node_modules/@kaitranntt/ccs/dist/ccs.js',
  packageRoot: '/tmp/bun-prefix/install/global/node_modules/@kaitranntt/ccs',
  prefix: '/tmp/bun-prefix',
  detectionSource: 'path' as const,
};

function createDeps(updateResult: UpdateResult): UpdateCommandDeps {
  return {
    initUI: async () => {},
    getVersion: () => '8.9.0',
    log: (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    },
    exit: ((code?: number) => {
      exitCodes.push(code ?? 0);
    }) as typeof process.exit,
    detectCurrentInstall: () => bunInstall,
    buildPackageManagerEnv: () => ({ PATH: '/usr/bin', BUN_INSTALL: '/tmp/bun-prefix' }),
    formatManualUpdateCommand: () => 'BUN_INSTALL=/tmp/bun-prefix bun add -g @kaitranntt/ccs@latest',
    readInstalledPackageState: () => {
      stateReads += 1;
      return stateReads === 1 ? beforeState : afterState;
    },
    compareVersionsWithPrerelease: (left: string, right: string) => left.localeCompare(right),
    checkForUpdates: async () => updateResult,
    spawn: (() => ({
      stderr: undefined,
      on: (event: string, callback: (code?: number) => void) => {
        if (event === 'exit') {
          callback(installExitCode);
        }
      },
    })) as unknown as UpdateCommandDeps['spawn'],
    findGlobalManifestIssues: () => manifestIssue,
  };
}

async function loadHandleUpdateCommand() {
  const mod = await import(
    `../../../src/commands/update-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleUpdateCommand;
}

const updateAvailable: UpdateResult = {
  status: 'update_available',
  current: '8.9.0',
  latest: '8.11.0',
};

beforeEach(() => {
  logLines = [];
  exitCodes = [];
  stateReads = 0;
  installExitCode = 1;
  manifestIssue = null;
  beforeState = { version: '8.9.0', packageJsonMtimeMs: 100, scriptMtimeMs: 100 };
  afterState = { version: '8.11.0', packageJsonMtimeMs: 200, scriptMtimeMs: 200 };
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('update-command non-zero package manager exit', () => {
  it('reports success with a warning when the target version landed anyway', async () => {
    manifestIssue = {
      manifestPath: '/tmp/bun-prefix/install/global/package.json',
      invalidNames: [''],
    };
    const handleUpdateCommand = await loadHandleUpdateCommand();
    await handleUpdateCommand({}, createDeps(updateAvailable));

    const output = logLines.join('\n');
    expect(output).toContain('bun exited with code 1, but CCS 8.11.0 is installed');
    expect(output).toContain('invalid dependency name(s): ""');
    expect(output).toContain('Update successful!');
    expect(output).not.toContain('Update failed');
    expect(exitCodes).toEqual([0]);
  });

  it('still fails when the installed version did not change', async () => {
    afterState = beforeState;
    const handleUpdateCommand = await loadHandleUpdateCommand();
    await handleUpdateCommand({}, createDeps(updateAvailable));

    const output = logLines.join('\n');
    expect(output).toContain('Update failed');
    expect(output).toContain('bun add -g @kaitranntt/ccs@latest');
    expect(exitCodes).toEqual([1]);
  });

  it('shows the manifest hint on a real failure', async () => {
    afterState = beforeState;
    installExitCode = 2;
    manifestIssue = {
      manifestPath: '/tmp/bun-prefix/install/global/package.json',
      invalidNames: ['', '.'],
    };
    const handleUpdateCommand = await loadHandleUpdateCommand();
    await handleUpdateCommand({}, createDeps(updateAvailable));

    const output = logLines.join('\n');
    expect(output).toContain('Update failed');
    expect(output).toContain('invalid dependency name(s): "", "."');
    expect(exitCodes).toEqual([2]);
  });

  it('does not treat a same-version force reinstall as success', async () => {
    afterState = { version: '8.11.0', packageJsonMtimeMs: 300, scriptMtimeMs: 300 };
    beforeState = { version: '8.11.0', packageJsonMtimeMs: 100, scriptMtimeMs: 100 };
    const handleUpdateCommand = await loadHandleUpdateCommand();
    await handleUpdateCommand(
      { force: true },
      createDeps({ status: 'no_update', current: '8.11.0', latest: '8.11.0' })
    );

    expect(logLines.join('\n')).toContain('Reinstall failed');
    expect(exitCodes).toEqual([1]);
  });
});

describe('findGlobalManifestIssues', () => {
  function writeManifest(dependencies: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bun-global-'));
    tempDirs.push(root);
    const globalDir = path.join(root, 'install', 'global');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, 'package.json'), JSON.stringify({ dependencies }));
    return root;
  }

  it('flags empty and path-like dependency names', () => {
    const root = writeManifest({
      '': '.',
      '../evil': '1.0.0',
      '@kaitranntt/ccs': '^8.11.0',
      vercel: '^51.2.1',
    });

    const issue = findGlobalManifestIssues(bunInstall, { BUN_INSTALL: root });

    expect(issue?.invalidNames).toEqual(['', '../evil']);
    expect(issue?.manifestPath).toBe(path.join(root, 'install', 'global', 'package.json'));
  });

  it('returns null for a clean manifest, a missing manifest, or a non-bun install', () => {
    const root = writeManifest({ '@kaitranntt/ccs': '^8.11.0', 'agent-browser': '^0.26.0' });

    expect(findGlobalManifestIssues(bunInstall, { BUN_INSTALL: root })).toBeNull();
    expect(findGlobalManifestIssues(bunInstall, { BUN_INSTALL: '/nonexistent/bun' })).toBeNull();
    expect(
      findGlobalManifestIssues({ ...bunInstall, manager: 'npm' }, { BUN_INSTALL: root })
    ).toBeNull();
  });
});
