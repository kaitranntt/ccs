#!/usr/bin/env node

import { HeadlessExecutor } from './headless-executor';
import { SessionManager } from './session-manager';
import { ResultFormatter } from './result-formatter';
import { DelegationValidator } from '../utils/delegation-validator';
import { SettingsParser } from './settings-parser';
import { fail, warn } from '../utils/ui';
import { getCcsDir } from '../config/config-loader-facade';

const PROFILE_FLAGS_WITH_VALUE = new Set(['-p', '--prompt', '--effort']);
const PROMPT_FLAGS_WITH_VALUE = new Set(['-p', '--prompt']);
const NUMERIC_CCS_FLAGS_WITH_VALUE = new Set(['--timeout', '--max-turns']);
const DASH_REJECTING_CCS_FLAGS_WITH_VALUE = new Set([
  '--permission-mode',
  '--fallback-model',
  '--agents',
  '--betas',
]);
const CCS_FLAGS_WITH_VALUE = new Set([
  '-p',
  '--prompt',
  '--timeout',
  '--permission-mode',
  '--max-turns',
  '--fallback-model',
  '--agents',
  '--betas',
]);

function isFlag(arg: string): boolean {
  return arg.startsWith('-');
}

function isInlineCcsValueFlag(arg: string): boolean {
  return Array.from(CCS_FLAGS_WITH_VALUE).some(
    (flag) => flag.startsWith('--') && arg.startsWith(`${flag}=`)
  );
}

function shouldSkipCcsFlagValue(args: string[], index: number): boolean {
  const arg = args[index];
  if (index >= args.length - 1) return false;
  if (PROMPT_FLAGS_WITH_VALUE.has(arg)) return true;
  const nextArg = args[index + 1];
  if (NUMERIC_CCS_FLAGS_WITH_VALUE.has(arg) && /^-\d/.test(nextArg)) return true;
  if (
    DASH_REJECTING_CCS_FLAGS_WITH_VALUE.has(arg) &&
    isFlag(nextArg) &&
    !nextArg.startsWith('--') &&
    !CCS_FLAGS_WITH_VALUE.has(nextArg)
  ) {
    return true;
  }
  return !isFlag(nextArg);
}

function findInlineFlagValue(args: string[], flagName: string): string | undefined {
  const prefix = `${flagName}=`;
  const inlineArg = args.find((arg) => arg.startsWith(prefix));
  if (inlineArg === undefined) return undefined;
  const value = inlineArg.slice(prefix.length);
  return value.trim().length > 0 ? value : undefined;
}

/**
 * Parse and validate a string flag value
 * @returns value if valid, undefined if invalid/missing
 */
function parseStringFlag(
  args: string[],
  flagName: string,
  options?: { allowDashPrefix?: boolean }
): string | undefined {
  const index = args.indexOf(flagName);
  let value: string | undefined;

  if (index === -1) {
    value = findInlineFlagValue(args, flagName);
    if (value === undefined) return undefined;
  } else {
    if (index >= args.length - 1) return undefined;
    value = args[index + 1];
  }

  // Reject dash-prefixed values (likely another flag)
  if (!options?.allowDashPrefix && value.startsWith('-')) {
    console.error(warn(`${flagName} value "${value}" looks like a flag. Ignoring.`));
    return undefined;
  }

  // Reject empty/whitespace-only
  if (!value.trim()) {
    console.error(warn(`${flagName} value is empty. Ignoring.`));
    return undefined;
  }

  return value;
}

interface ParsedArgs {
  profile: string;
  prompt: string;
  options: {
    cwd: string;
    outputFormat: string;
    permissionMode: string;
    timeout?: number;
    resumeSession?: boolean;
    sessionId?: string;
    // Claude Code CLI passthrough flags (explicit)
    maxTurns?: number;
    fallbackModel?: string;
    agents?: string;
    betas?: string;
    extraArgs?: string[]; // Catch-all for new/unknown flags
  };
}

/**
 * Delegation command handler
 * Routes -p flag commands to HeadlessExecutor with enhanced features
 */
export class DelegationHandler {
  /**
   * Route delegation command
   * @param args - Full args array from ccs.js
   */
  async route(args: string[]): Promise<void> {
    try {
      // 1. Parse args into { profile, prompt, options }
      const parsed = this._parseArgs(args);

      // 2. Detect special profiles (glm:continue, kimi:continue)
      if (parsed.profile.includes(':continue')) {
        return await this._handleContinue(parsed);
      }

      // 3. Validate profile
      this._validateProfile(parsed.profile);

      // 4. Execute via HeadlessExecutor
      const result = await HeadlessExecutor.execute(parsed.profile, parsed.prompt, parsed.options);

      // 5. Format and display results
      const formatted = await ResultFormatter.format(result);
      console.log(formatted);

      // 6. Exit with proper code
      process.exit(result.exitCode || 0);
    } catch (error) {
      console.error(fail(`Delegation error: ${(error as Error).message}`));
      if (process.env.CCS_DEBUG) {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  }

  /**
   * Handle continue command (resume last session)
   * @param parsed - Parsed args
   */
  async _handleContinue(parsed: ParsedArgs): Promise<void> {
    const baseProfile = parsed.profile.replace(':continue', '');

    // Get last session from SessionManager
    const sessionMgr = new SessionManager();
    const lastSession = sessionMgr.getLastSession(baseProfile);

    if (!lastSession) {
      console.error(fail(`No previous session found for ${baseProfile}`));
      console.error(`    Start a new session first with: ccs ${baseProfile} -p "task"`);
      process.exit(1);
    }

    // Execute with resume flag
    const result = await HeadlessExecutor.execute(baseProfile, parsed.prompt, {
      ...parsed.options,
      resumeSession: true,
      sessionId: lastSession.sessionId,
    });

    const formatted = await ResultFormatter.format(result);
    console.log(formatted);

    process.exit(result.exitCode || 0);
  }

  /**
   * Parse args into structured format
   * @param args - Raw args
   * @returns { profile, prompt, options }
   */
  _parseArgs(args: string[]): ParsedArgs {
    // Extract profile (first non-flag arg or 'default')
    const profile = this._extractProfile(args);

    // Extract prompt from -p or --prompt
    const prompt = this._extractPrompt(args);

    // Extract options (--timeout, --permission-mode, etc.)
    const options = this._extractOptions(args);

    return { profile, prompt, options };
  }

  /**
   * Extract profile from args (first non-flag arg)
   * @param args - Args array
   * @returns profile name
   */
  _extractProfile(args: string[]): string {
    // Find first arg that doesn't start with '-' and isn't -p value
    let skipNext = false;
    for (let i = 0; i < args.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (PROFILE_FLAGS_WITH_VALUE.has(args[i])) {
        skipNext = true;
        continue;
      }

      if (args[i].startsWith('--prompt=')) continue;
      if (args[i].startsWith('--effort=')) continue;

      if (!isFlag(args[i])) {
        return args[i];
      }
    }

    // No profile specified, return empty string (will error in validation)
    return '';
  }

  /**
   * Extract prompt from -p flag
   * @param args - Args array
   * @returns prompt text
   */
  _extractPrompt(args: string[]): string {
    const pIndex = args.indexOf('-p');
    const promptIndex = args.indexOf('--prompt');

    const index = pIndex !== -1 ? pIndex : promptIndex;

    if (index === -1) {
      const inlinePrompt = args.find((arg) => arg.startsWith('--prompt='));
      if (inlinePrompt) {
        const prompt = inlinePrompt.slice('--prompt='.length);
        if (prompt.length > 0) return prompt;
      }
    }

    if (index === -1 || index === args.length - 1) {
      console.error(fail('Missing prompt after -p flag'));
      console.error('    Usage: ccs glm -p "task description"');
      process.exit(1);
    }

    return args[index + 1];
  }

  /**
   * Extract options from remaining args
   * @param args - Args array
   * @returns options for HeadlessExecutor
   */
  _extractOptions(args: string[]): ParsedArgs['options'] {
    const cwd = process.cwd();

    // Read default permission mode from .claude/settings.local.json
    // Falls back to 'acceptEdits' if file doesn't exist
    const defaultPermissionMode = SettingsParser.parseDefaultPermissionMode(cwd);

    const options: ParsedArgs['options'] = {
      cwd,
      outputFormat: 'stream-json',
      permissionMode: defaultPermissionMode,
    };

    // Parse permission-mode (CLI flag overrides settings file)
    const permissionMode = parseStringFlag(args, '--permission-mode');
    if (permissionMode) {
      options.permissionMode = permissionMode;
    }

    // Parse timeout (validated: positive integer, max 10 minutes)
    const timeoutIndex = args.indexOf('--timeout');
    const inlineTimeout = findInlineFlagValue(args, '--timeout');
    const rawTimeout =
      timeoutIndex !== -1 && timeoutIndex < args.length - 1
        ? args[timeoutIndex + 1]
        : inlineTimeout;
    if (rawTimeout !== undefined) {
      const rawVal = rawTimeout;
      const val = parseInt(rawVal, 10);
      if (!isNaN(val) && val > 0 && val <= 600000) {
        options.timeout = val;
      } else if (isNaN(val)) {
        console.error(warn(`--timeout "${rawVal}" is not a number. Using default.`));
      } else if (val <= 0) {
        console.error(warn(`--timeout ${val} must be positive. Using default.`));
      } else if (val > 600000) {
        console.error(warn(`--timeout ${val} exceeds max (600000ms). Using default.`));
      }
    }

    // Parse --max-turns (limit agentic turns, max 100)
    const maxTurnsIndex = args.indexOf('--max-turns');
    const inlineMaxTurns = findInlineFlagValue(args, '--max-turns');
    const rawMaxTurns =
      maxTurnsIndex !== -1 && maxTurnsIndex < args.length - 1
        ? args[maxTurnsIndex + 1]
        : inlineMaxTurns;
    if (rawMaxTurns !== undefined) {
      const rawVal = rawMaxTurns;
      const val = parseInt(rawVal, 10);
      if (!isNaN(val) && val > 0 && val <= 100) {
        options.maxTurns = val;
      } else if (isNaN(val)) {
        console.error(warn(`--max-turns "${rawVal}" is not a number. Ignoring.`));
      } else if (val <= 0) {
        console.error(warn(`--max-turns ${val} must be positive. Ignoring.`));
      } else if (val > 100) {
        console.error(warn(`--max-turns ${val} exceeds max (100). Using 100.`));
        options.maxTurns = 100;
      }
    }

    // Parse --fallback-model (auto-fallback on overload)
    options.fallbackModel = parseStringFlag(args, '--fallback-model');

    // Parse --agents (dynamic subagent JSON)
    const agentsValue = parseStringFlag(args, '--agents');
    if (agentsValue) {
      // Validate JSON structure
      try {
        JSON.parse(agentsValue);
        options.agents = agentsValue;
      } catch {
        console.error(warn('--agents must be valid JSON. Ignoring.'));
      }
    }

    // Parse --betas (experimental features)
    options.betas = parseStringFlag(args, '--betas');

    // Collect extra args to pass through to Claude CLI.
    // Only CCS-owned flags are consumed here. Unknown/native Claude flags are preserved
    // generically, including future variadic flags such as "--flag value1 value2".
    const extraArgs: string[] = [];
    const profile = this._extractProfile(args);
    let profileSkipped = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Skip only the first profile token. Later matching values may belong to native flags.
      if (!profileSkipped && arg === profile && !isFlag(arg)) {
        profileSkipped = true;
        continue;
      }

      // Skip CCS-handled flags and their values.
      if (CCS_FLAGS_WITH_VALUE.has(arg)) {
        if (shouldSkipCcsFlagValue(args, i)) i++;
        continue;
      }
      if (isInlineCcsValueFlag(arg)) {
        continue;
      }

      // Preserve native/future Claude flags and all adjacent values until the next flag.
      if (isFlag(arg)) {
        extraArgs.push(arg);
        while (i + 1 < args.length && !isFlag(args[i + 1])) {
          extraArgs.push(args[i + 1]);
          i++;
        }
        continue;
      }

      extraArgs.push(arg);
    }

    if (extraArgs.length > 0) {
      options.extraArgs = extraArgs;
    }

    return options;
  }

  /**
   * Validate profile exists and is configured
   * @param profile - Profile name
   */
  _validateProfile(profile: string): void {
    if (!profile) {
      console.error(fail('No profile specified'));
      console.error('    Usage: ccs <profile> -p "task"');
      console.error('    Examples: ccs glm -p "task", ccs km -p "task"');
      process.exit(1);
    }

    // Use DelegationValidator to check profile
    const validation = DelegationValidator.validate(profile);
    if (!validation.valid) {
      console.error(fail(`Profile '${profile}' is not configured for delegation`));
      console.error(`    ${validation.error}`);
      console.error('');
      console.error('    Run: ccs doctor');
      console.error(`    Or configure: ${getCcsDir()}/${profile}.settings.json`);
      process.exit(1);
    }
  }
}
