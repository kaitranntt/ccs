/**
 * Droid Adapter
 *
 * TargetAdapter implementation for Factory Droid CLI.
 * Writes credentials + active model to ~/.factory/settings.json and spawns `droid`.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { TargetAdapter, TargetBinaryInfo, TargetCredentials, TargetType } from './target-adapter';
import { getDroidBinaryInfo, detectDroidCli, checkDroidVersion } from './droid-detector';
import type { ProfileType } from '../types/profile';
import { upsertCcsModel } from './droid-config-manager';
import { resolveDroidProvider } from './droid-provider';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripAnthropicEnv,
} from '../utils/shell-executor';
import { wireChildProcessSignals } from '../utils/signal-forwarder';
import { runCleanup } from '../errors';
import { createLogger } from '../services/logging';

const adapterLogger = createLogger('targets:droid');

export class DroidAdapter implements TargetAdapter {
  readonly type: TargetType = 'droid';
  readonly displayName = 'Factory Droid';

  private validateCredentials(creds: TargetCredentials): void {
    if (!creds.baseUrl?.trim()) {
      throw new Error('Droid target requires ANTHROPIC_BASE_URL');
    }
    if (!creds.apiKey?.trim()) {
      throw new Error('Droid target requires ANTHROPIC_AUTH_TOKEN');
    }
  }

  detectBinary(): TargetBinaryInfo | null {
    const info = getDroidBinaryInfo();
    if (!info) return null;

    // Version compatibility check (non-blocking warning)
    checkDroidVersion(info.path);
    return info;
  }

  /**
   * Write CCS credentials to ~/.factory/settings.json as a custom model entry.
   * This is the key difference from Claude — Droid reads config files, not env vars.
   */
  async prepareCredentials(creds: TargetCredentials): Promise<void> {
    this.validateCredentials(creds);
    const provider = resolveDroidProvider({
      provider: creds.provider,
      baseUrl: creds.baseUrl,
      model: creds.model,
    });
    const modelRef = await upsertCcsModel(creds.profile, {
      model: creds.model || 'claude-opus-4-6',
      displayName: `CCS ${creds.profile}`,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      provider,
      reasoningOverride: creds.reasoningOverride,
    });
    if (!modelRef.selector) {
      throw new Error(`Failed to resolve Droid model selector for profile "${creds.profile}"`);
    }
  }

  buildArgs(profile: string, userArgs: string[]): string[] {
    if (!/^[a-zA-Z0-9._-]+$/.test(profile)) {
      throw new Error(
        `Invalid profile name "${profile}" for Droid target: only alphanumeric, dot, underscore, hyphen allowed`
      );
    }
    // Droid interactive mode treats unknown argv as queued prompt text.
    // Model selection must be persisted in settings.json (`model`) instead of `-m`.
    return [...userArgs];
  }

  /**
   * Droid uses config file for credentials — keep parent env, but strip stale
   * ANTHROPIC_* values so prior CCS/CLIProxy sessions do not leak into Droid.
   */
  buildEnv(_creds: TargetCredentials, _profileType: ProfileType): NodeJS.ProcessEnv {
    return { ...stripAnthropicEnv(process.env) };
  }

  exec(
    args: string[],
    env: NodeJS.ProcessEnv,
    options?: { cwd?: string; binaryInfo?: TargetBinaryInfo }
  ): void {
    const exitWithCleanup = (code: number): never => {
      try {
        runCleanup();
      } catch {
        // Cleanup should be best-effort on launch errors.
      }
      process.exit(code);
    };

    const droidPath = options?.binaryInfo?.path || detectDroidCli();
    if (!droidPath) {
      process.stderr.write('[X] Droid CLI not found. Install: npm i -g @factory/cli\n');
      return exitWithCleanup(1);
    }
    try {
      const stat = fs.statSync(droidPath);
      if (!stat.isFile()) {
        process.stderr.write(`[X] Droid CLI path is not a file: ${droidPath}\n`);
        return exitWithCleanup(1);
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      process.stderr.write(
        `[X] Droid CLI path is not accessible (${error.code || 'unknown'}): ${droidPath}\n`
      );
      return exitWithCleanup(1);
    }

    const isWindows = process.platform === 'win32';
    const isPowerShellScript = isWindows && /\.ps1$/i.test(droidPath);
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(droidPath);

    const spawnStartedAt = Date.now();
    adapterLogger.stage('dispatch', 'target.spawn', 'Spawning Droid CLI child process', {
      target: 'droid',
      droidPath,
      argCount: args.length,
    });

    let child: ChildProcess;
    if (isPowerShellScript) {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', droidPath, ...args],
        {
          stdio: 'inherit',
          windowsHide: true,
          env,
        }
      );
    } else if (needsShell) {
      const cmdString = [droidPath, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, {
        stdio: 'inherit',
        windowsHide: true,
        shell: getWindowsEscapedCommandShell(),
        env,
      });
    } else {
      child = spawn(droidPath, args, {
        stdio: 'inherit',
        windowsHide: true,
        env,
      });
    }

    child.on('exit', (code, signal) => {
      adapterLogger.stage(
        'respond',
        'target.exit',
        'Droid CLI child process exited',
        { target: 'droid', exitCode: code, signal },
        { latencyMs: Date.now() - spawnStartedAt }
      );
    });

    wireChildProcessSignals(child, (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        process.stderr.write(`[X] Droid CLI is not executable: ${droidPath}\n`);
        process.stderr.write('    Check file permissions and executable bit.\n');
      } else if (err.code === 'ENOENT') {
        if (isPowerShellScript) {
          process.stderr.write(
            '[X] PowerShell executable not found (required for .ps1 wrapper launch).\n'
          );
          process.stderr.write('    Ensure powershell.exe is available in PATH.\n');
        } else if (needsShell) {
          process.stderr.write('[X] Windows command shell not found for Droid wrapper launch.\n');
          process.stderr.write('    Ensure cmd.exe is available and accessible.\n');
        } else {
          process.stderr.write(`[X] Droid CLI not found: ${droidPath}\n`);
          process.stderr.write('    Install: npm i -g @factory/cli\n');
        }
      } else {
        process.stderr.write(`[X] Failed to start Droid CLI (${droidPath}): ${err.message}\n`);
      }
      return exitWithCleanup(1);
    });
  }

  /** Droid supports settings/default and CLIProxy-executed profile flows. */
  supportsProfileType(profileType: ProfileType): boolean {
    return profileType === 'settings' || profileType === 'default' || profileType === 'cliproxy';
  }
}
