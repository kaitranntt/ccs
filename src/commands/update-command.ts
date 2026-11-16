/**
 * Update Command Handler
 *
 * Handles `ccs update` command - checks for updates and installs latest version.
 * Uses npm/yarn/pnpm/bun package managers exclusively.
 */

import { spawn } from 'child_process';
import { initUI, header, ok, fail, warn, info, color } from '../utils/ui';
import {
  buildPackageManagerEnv,
  detectCurrentInstall,
  formatManualUpdateCommand,
  readInstalledPackageState,
  type CurrentInstall,
  type InstalledPackageState,
} from '../utils/package-manager-detector';
import { compareVersionsWithPrerelease, type UpdateResult } from '../utils/update-checker';
import { getVersion } from '../utils/version';
import { findGlobalManifestIssues, type GlobalManifestIssue } from '../utils/bun-global-manifest';

/**
 * Options for the update command
 */
export interface UpdateOptions {
  force?: boolean;
  beta?: boolean;
}

type TargetTag = 'latest' | 'dev';

export interface UpdateCommandDeps {
  initUI: typeof initUI;
  getVersion: typeof getVersion;
  log: typeof console.log;
  exit: typeof process.exit;
  detectCurrentInstall: typeof detectCurrentInstall;
  buildPackageManagerEnv: typeof buildPackageManagerEnv;
  formatManualUpdateCommand: typeof formatManualUpdateCommand;
  readInstalledPackageState: typeof readInstalledPackageState;
  compareVersionsWithPrerelease: typeof compareVersionsWithPrerelease;
  checkForUpdates: (
    currentVersion: string,
    interactive: boolean,
    channel: 'npm' | 'direct',
    targetTag: TargetTag
  ) => Promise<UpdateResult>;
  spawn: typeof spawn;
  findGlobalManifestIssues: typeof findGlobalManifestIssues;
}

function logGlobalManifestIssue(issue: GlobalManifestIssue, deps: UpdateCommandDeps): void {
  const names = issue.invalidNames.map((name) => JSON.stringify(name)).join(', ');
  deps.log(warn(`bun global manifest has invalid dependency name(s): ${names}`));
  deps.log(`    File: ${issue.manifestPath} (and bun.lock next to it)`);
  deps.log('    Remove those entries, then re-run the update.');
  deps.log('');
}

async function loadCheckForUpdates(
  currentVersion: string,
  interactive: boolean,
  channel: 'npm' | 'direct',
  targetTag: TargetTag
): Promise<UpdateResult> {
  const { checkForUpdates } = await import('../utils/update-checker');
  return checkForUpdates(currentVersion, interactive, channel, targetTag);
}

const defaultDeps: UpdateCommandDeps = {
  initUI,
  getVersion,
  log: console.log,
  exit: process.exit.bind(process) as typeof process.exit,
  detectCurrentInstall,
  buildPackageManagerEnv,
  formatManualUpdateCommand,
  readInstalledPackageState,
  compareVersionsWithPrerelease,
  checkForUpdates: loadCheckForUpdates,
  spawn,
  findGlobalManifestIssues,
};

async function resolveTargetVersion(
  currentVersion: string,
  targetTag: TargetTag,
  deps: UpdateCommandDeps
): Promise<string | undefined> {
  const result = await deps.checkForUpdates(currentVersion, true, 'npm', targetTag);

  if (result.status === 'update_available' && result.latest) {
    return result.latest;
  }

  if (result.status === 'no_update') {
    return currentVersion;
  }

  return undefined;
}

export async function handleUpdateCommand(
  options: UpdateOptions = {},
  injectedDeps: Partial<UpdateCommandDeps> = {}
): Promise<void> {
  const deps = { ...defaultDeps, ...injectedDeps };
  await deps.initUI();
  const { force = false, beta = false } = options;
  const targetTag: TargetTag = beta ? 'dev' : 'latest';
  const currentInstall = deps.detectCurrentInstall();
  const currentVersion = deps.getVersion();

  deps.log('');
  deps.log(header('Checking for updates...'));
  deps.log('');

  // Force reinstall - skip update check
  if (force) {
    deps.log(info(`Force reinstall from @${targetTag} channel...`));
    deps.log('');
    const expectedVersion = await resolveTargetVersion(currentVersion, targetTag, deps);
    await performNpmUpdate(currentInstall, targetTag, true, expectedVersion, deps);
    return;
  }

  const updateResult = await deps.checkForUpdates(currentVersion, true, 'npm', targetTag);

  if (updateResult.status === 'check_failed') {
    handleCheckFailed(
      updateResult.message ?? 'Update check failed',
      targetTag,
      currentInstall,
      deps
    );
    return;
  }

  if (updateResult.status === 'no_update') {
    handleNoUpdate(updateResult.reason, currentVersion, deps);
    return;
  }

  // Update available
  deps.log(warn(`Update available: ${updateResult.current} -> ${updateResult.latest}`));
  deps.log('');

  // Check if this is a downgrade (e.g., stable to older dev)
  const isDowngrade =
    updateResult.latest &&
    updateResult.current &&
    deps.compareVersionsWithPrerelease(updateResult.latest, updateResult.current) < 0;

  // This happens when stable user requests @dev but @dev base is older
  if (isDowngrade && beta) {
    deps.log(
      warn(
        'WARNING: Downgrading from ' +
          (updateResult.current || 'unknown') +
          ' to ' +
          (updateResult.latest || 'unknown')
      )
    );
    deps.log(warn('Dev channel may be behind stable.'));
    deps.log('');
  }

  // Show beta warning
  if (beta) {
    deps.log(warn('Installing from @dev channel (unstable)'));
    deps.log(warn('Not recommended for production use'));
    deps.log(info('Use `ccs update` (without --beta) to return to stable'));
    deps.log('');
  }

  await performNpmUpdate(currentInstall, targetTag, false, updateResult.latest, deps);
}

/**
 * Handle failed update check
 */
function handleCheckFailed(
  message: string,
  targetTag: string = 'latest',
  currentInstall: CurrentInstall = defaultDeps.detectCurrentInstall(),
  deps: UpdateCommandDeps = defaultDeps
): void {
  deps.log(fail(message));
  deps.log('');
  deps.log(warn('Possible causes:'));
  deps.log('  - Network connection issues');
  deps.log('  - Firewall blocking requests');
  deps.log('  - GitHub/npm API temporarily unavailable');
  deps.log('');
  deps.log('Try again later or update manually:');

  deps.log(color(`  ${deps.formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
  deps.log('');
  deps.exit(1);
}

/**
 * Handle no update available
 */
function handleNoUpdate(
  reason: string | undefined,
  version: string,
  deps: UpdateCommandDeps
): void {
  let message = `You are already on the latest version (${version})`;

  switch (reason) {
    case 'dismissed':
      message = `Update dismissed. You are on version ${version}`;
      deps.log(warn(message));
      break;
    case 'cached':
      message = `No updates available (cached result). You are on version ${version}`;
      deps.log(info(message));
      break;
    default:
      deps.log(ok(message));
  }
  deps.log('');
  deps.exit(0);
}

/**
 * Perform update verification against the current install.
 */
async function verifyCurrentInstallVersion(
  currentInstall: CurrentInstall,
  targetTag: string,
  expectedVersion?: string,
  previousState?: InstalledPackageState,
  isReinstall: boolean = false,
  deps: UpdateCommandDeps = defaultDeps
): Promise<void> {
  const nextState = deps.readInstalledPackageState(currentInstall);
  const installedVersion = nextState.version;
  if (!installedVersion) {
    deps.log('');
    deps.log(fail('Update finished, but CCS could not verify the current installation version.'));
    deps.log('');
    deps.log('Current install remains ambiguous. Re-run manually:');
    deps.log(color(`  ${deps.formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
    deps.log('');
    deps.exit(1);
    return;
  }

  const installChanged =
    previousState !== undefined &&
    (previousState.version !== nextState.version ||
      previousState.packageJsonMtimeMs !== nextState.packageJsonMtimeMs ||
      previousState.scriptMtimeMs !== nextState.scriptMtimeMs);

  if (expectedVersion && installedVersion !== expectedVersion) {
    const postUpdateResult = await deps.checkForUpdates(
      installedVersion,
      true,
      'npm',
      targetTag as TargetTag
    );

    if (postUpdateResult.status === 'no_update') {
      return;
    }

    if (
      postUpdateResult.status === 'update_available' &&
      postUpdateResult.latest === installedVersion
    ) {
      return;
    }

    const comparison = deps.compareVersionsWithPrerelease(installedVersion, expectedVersion);
    if (comparison < 0 || installedVersion === previousState?.version) {
      deps.log('');
      deps.log(
        fail(
          `Update completed outside the current installation. Current binary still reports ${installedVersion}; expected ${expectedVersion}.`
        )
      );
      if (previousState?.version && previousState.version === installedVersion) {
        deps.log(
          warn(
            `The current install path did not change from ${previousState.version}; another package manager likely updated a different copy of CCS.`
          )
        );
      }
      deps.log('');
      deps.log('Re-run manually against the current install:');
      deps.log(color(`  ${deps.formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
      deps.log('');
      deps.exit(1);
      return;
    }
  }

  if (
    isReinstall &&
    previousState?.version &&
    installedVersion === previousState.version &&
    !installChanged
  ) {
    deps.log('');
    deps.log(
      warn(
        `Reinstall completed, but CCS could not prove that the current installation changed from ${previousState.version}. Verify the current binary manually if this reinstall was meant to repair a same-version install.`
      )
    );
  }
}

function runChildProcess(
  deps: UpdateCommandDeps,
  command: string,
  args: string[],
  options: {
    isWindows: boolean;
    env: NodeJS.ProcessEnv;
    filterCleanupWarnings?: boolean;
  }
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { isWindows, env, filterCleanupWarnings = false } = options;
    const child = isWindows
      ? deps.spawn(`${command} ${args.join(' ')}`, [], {
          stdio: ['inherit', 'inherit', 'pipe'],
          shell: true,
          env: { ...env, NODE_NO_WARNINGS: '1' },
        })
      : deps.spawn(command, args, { stdio: 'inherit', env });

    if (isWindows && filterCleanupWarnings && child.stderr) {
      let stderrBuffer = '';
      child.stderr.on('data', (data: Buffer) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';
        for (const line of lines) {
          if (!/npm warn cleanup/i.test(line)) {
            process.stderr.write(line + '\n');
          }
        }
      });
      child.stderr.on('close', () => {
        if (stderrBuffer && !/npm warn cleanup/i.test(stderrBuffer)) {
          process.stderr.write(stderrBuffer);
        }
      });
    }

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

async function performNpmUpdate(
  currentInstall: CurrentInstall,
  targetTag: string = 'latest',
  isReinstall: boolean = false,
  expectedVersion?: string,
  deps: UpdateCommandDeps = defaultDeps
): Promise<void> {
  const packageManager = currentInstall.manager;
  let updateCommand: string;
  let updateArgs: string[];
  let cacheCommand: string | null;
  let cacheArgs: string[] | null;
  const childEnv = deps.buildPackageManagerEnv(currentInstall);
  const previousState = deps.readInstalledPackageState(currentInstall);

  switch (packageManager) {
    case 'npm':
      updateCommand = 'npm';
      updateArgs = ['install', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'npm';
      cacheArgs = ['cache', 'clean', '--force'];
      break;
    case 'yarn':
      updateCommand = 'yarn';
      updateArgs = ['global', 'add', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'yarn';
      cacheArgs = ['cache', 'clean'];
      break;
    case 'pnpm':
      updateCommand = 'pnpm';
      updateArgs = ['add', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'pnpm';
      cacheArgs = ['store', 'prune'];
      break;
    case 'bun':
      updateCommand = 'bun';
      updateArgs = ['add', '-g', `@kaitranntt/ccs@${targetTag}`];
      // On Windows, bun's global bin symlink may not update properly without removal first
      // Pre-remove to ensure clean reinstall (mirrors dev-install.sh behavior)
      cacheCommand = process.platform === 'win32' ? 'bun' : null;
      cacheArgs = process.platform === 'win32' ? ['remove', '-g', '@kaitranntt/ccs'] : null;
      break;
    default:
      updateCommand = 'npm';
      updateArgs = ['install', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'npm';
      cacheArgs = ['cache', 'clean', '--force'];
  }

  deps.log(info(`${isReinstall ? 'Reinstalling' : 'Updating'} via ${packageManager}...`));
  deps.log('');

  const isWindows = process.platform === 'win32';

  if (cacheCommand && cacheArgs) {
    // For bun on Windows, we pre-remove instead of cache clear
    const isBunPreRemove = packageManager === 'bun' && cacheArgs.includes('remove');
    const stepMessage = isBunPreRemove
      ? 'Removing existing installation...'
      : 'Clearing package cache...';
    const failMessage = isBunPreRemove
      ? 'Pre-removal failed, proceeding anyway...'
      : 'Cache clearing failed, proceeding anyway...';

    deps.log(info(stepMessage));
    try {
      const cacheCode = await runChildProcess(deps, cacheCommand, cacheArgs, {
        isWindows,
        env: childEnv,
      });
      if (cacheCode !== 0) {
        deps.log(warn(failMessage));
      }
    } catch {
      deps.log(warn(failMessage));
    }
  }

  try {
    const exitCode = await runChildProcess(deps, updateCommand, updateArgs, {
      isWindows,
      env: childEnv,
      filterCleanupWarnings: true,
    });

    if (exitCode === 0) {
      if (expectedVersion || previousState?.version) {
        await verifyCurrentInstallVersion(
          currentInstall,
          targetTag,
          expectedVersion,
          previousState,
          isReinstall,
          deps
        );
      }
      deps.log('');
      deps.log(ok(`${isReinstall ? 'Reinstall' : 'Update'} successful!`));
      deps.log('');
      deps.log(`Run ${color('ccs --version', 'command')} to verify`);
      deps.log(info(`Tip: Use ${color('ccs config', 'command')} for web-based configuration`));
      deps.log('');
      deps.exit(0);
      return;
    }

    const manifestIssue = deps.findGlobalManifestIssues(currentInstall, childEnv);
    const installedVersion = deps.readInstalledPackageState(currentInstall).version;
    const landedDespiteError =
      !isReinstall &&
      !!expectedVersion &&
      installedVersion === expectedVersion &&
      installedVersion !== previousState?.version;

    deps.log('');
    if (landedDespiteError) {
      deps.log(
        warn(
          `${packageManager} exited with code ${exitCode}, but CCS ${installedVersion} is installed.`
        )
      );
      deps.log(info('The error above came from the package manager, not from the CCS package.'));
      deps.log('');
      if (manifestIssue) {
        logGlobalManifestIssue(manifestIssue, deps);
      }
      deps.log(ok('Update successful!'));
      deps.log('');
      deps.exit(0);
      return;
    }

    deps.log(fail(`${isReinstall ? 'Reinstall' : 'Update'} failed`));
    deps.log('');
    if (manifestIssue) {
      logGlobalManifestIssue(manifestIssue, deps);
    }
    deps.log('Try manually:');
    deps.log(color(`  ${deps.formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
    deps.log('');
    deps.exit(exitCode || 1);
  } catch {
    deps.log('');
    deps.log(fail(`Failed to run ${packageManager} ${isReinstall ? 'reinstall' : 'update'}`));
    deps.log('');
    deps.log('Try manually:');
    deps.log(color(`  ${deps.formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
    deps.log('');
    deps.exit(1);
  }
}
