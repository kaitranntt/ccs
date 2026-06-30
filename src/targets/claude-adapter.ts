/**
 * Claude Adapter
 *
 * TargetAdapter implementation for Claude Code CLI.
 * Wraps existing detection, spawning, and execution logic.
 */

import { spawn, ChildProcess } from 'child_process';
import { TargetAdapter, TargetBinaryInfo, TargetCredentials, TargetType } from './target-adapter';
import { detectClaudeCli, getClaudeCliInfo } from '../utils/claude-detector';
import type { ProfileType } from '../types/profile';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripBrowserEnv,
  stripAnthropicEnv,
  stripClaudeCodeEnv,
} from '../utils/shell-executor';
import { ErrorManager } from '../utils/error-manager';
import { getWebSearchHookEnv } from '../utils/websearch-manager';
import { getOutputLimitsEnv } from '../config/config-loader-facade';
import { appendBrowserToolArgs } from '../utils/browser';
import { wireChildProcessSignals } from '../utils/signal-forwarder';
import { runCleanup } from '../errors';
import { createLogger } from '../services/logging';

const adapterLogger = createLogger('targets:claude');

export class ClaudeAdapter implements TargetAdapter {
  readonly type: TargetType = 'claude';
  readonly displayName = 'Claude Code';

  detectBinary(): TargetBinaryInfo | null {
    const info = getClaudeCliInfo();
    if (!info) return null;
    return { path: info.path, needsShell: info.needsShell };
  }

  /**
   * Claude uses env vars for credential delivery — no config file writes needed.
   */
  async prepareCredentials(_creds: TargetCredentials): Promise<void> {
    // No-op: Claude receives credentials via environment variables
  }

  buildArgs(
    _profile: string,
    userArgs: string[],
    options?: {
      creds?: TargetCredentials;
      profileType?: ProfileType;
      binaryInfo?: TargetBinaryInfo;
    }
  ): string[] {
    return options?.creds?.browserRuntimeEnv ? appendBrowserToolArgs(userArgs) : userArgs;
  }

  buildEnv(creds: TargetCredentials, profileType: ProfileType): NodeJS.ProcessEnv {
    const webSearchEnv = getWebSearchHookEnv();

    // For account/default profiles, strip ANTHROPIC_* from parent env to prevent
    // stale proxy config from interfering with native Claude API routing.
    const baseEnv =
      profileType === 'account' || profileType === 'default'
        ? stripAnthropicEnv(process.env)
        : process.env;

    const env: NodeJS.ProcessEnv = { ...stripBrowserEnv(baseEnv), ...webSearchEnv };

    if (creds.envVars) {
      Object.assign(env, stripBrowserEnv(creds.envVars));
    }
    if (creds.browserRuntimeEnv) {
      Object.assign(env, creds.browserRuntimeEnv);
    }

    if (creds.baseUrl) env['ANTHROPIC_BASE_URL'] = creds.baseUrl;
    if (creds.apiKey) env['ANTHROPIC_AUTH_TOKEN'] = creds.apiKey;
    if (creds.model) env['ANTHROPIC_MODEL'] = creds.model;

    // Opt-in output limits (issue #231): inject only the env vars the user has
    // explicitly configured under config.runtime.outputLimits. When unset, this
    // is {} and nothing is injected, so Claude Code keeps its own default caps.
    Object.assign(env, getOutputLimitsEnv());

    return stripClaudeCodeEnv(env);
  }

  exec(
    args: string[],
    env: NodeJS.ProcessEnv,
    _options?: { cwd?: string; binaryInfo?: TargetBinaryInfo }
  ): void {
    const exitWithCleanup = (code: number): never => {
      try {
        runCleanup();
      } catch {
        // Cleanup should be best-effort on launch errors.
      }
      process.exit(code);
    };

    const claudeCli = detectClaudeCli();
    if (!claudeCli) {
      void ErrorManager.showClaudeNotFound();
      return exitWithCleanup(1);
    }

    const isWindows = process.platform === 'win32';
    const isPowerShellScript = isWindows && /\.ps1$/i.test(claudeCli);
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(claudeCli);

    const spawnStartedAt = Date.now();
    adapterLogger.stage('dispatch', 'target.spawn', 'Spawning Claude CLI child process', {
      target: 'claude',
      claudeCli,
      argCount: args.length,
    });

    let child: ChildProcess;
    if (isPowerShellScript) {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudeCli, ...args],
        {
          stdio: 'inherit',
          windowsHide: true,
          env,
        }
      );
    } else if (needsShell) {
      const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, {
        stdio: 'inherit',
        windowsHide: true,
        shell: getWindowsEscapedCommandShell(),
        env,
      });
    } else {
      child = spawn(claudeCli, args, {
        stdio: 'inherit',
        windowsHide: true,
        env,
      });
    }

    child.on('exit', (code, signal) => {
      adapterLogger.stage(
        'respond',
        'target.exit',
        'Claude CLI child process exited',
        { target: 'claude', exitCode: code, signal },
        { latencyMs: Date.now() - spawnStartedAt }
      );
    });

    wireChildProcessSignals(child, async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        console.error(`[X] Claude CLI is not executable: ${claudeCli}`);
        console.error('    Check file permissions and executable bit.');
      } else if (err.code === 'ENOENT') {
        if (isPowerShellScript) {
          console.error('[X] PowerShell executable not found (required for .ps1 wrapper launch).');
          console.error('    Ensure powershell.exe is available in PATH.');
        } else if (needsShell) {
          console.error('[X] Windows command shell not found for Claude wrapper launch.');
          console.error('    Ensure cmd.exe is available and accessible.');
        } else {
          await ErrorManager.showClaudeNotFound();
        }
      } else {
        console.error(`[X] Failed to start Claude CLI (${claudeCli}): ${err.message}`);
      }
      return exitWithCleanup(1);
    });
  }

  /**
   * Claude supports all CCS profile types.
   */
  supportsProfileType(_profileType: ProfileType): boolean {
    return true;
  }
}
