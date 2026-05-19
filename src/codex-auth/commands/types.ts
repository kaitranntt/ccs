/**
 * Shared types and utilities for codex-auth command handlers.
 */

import { color } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import type { CodexProfileRegistry } from '../codex-profile-registry';
import { getCodexProfileNameError, isValidCodexProfileName } from '../types';

// Re-export for convenience in command modules
export { formatRelativeTime } from '../../utils/time';

// ── Context ──────────────────────────────────────────────────────────────────

export interface CodexCommandContext {
  registry: CodexProfileRegistry;
  version: string;
}

// ── CLI args ─────────────────────────────────────────────────────────────────

export interface CodexAuthArgs {
  profileName?: string;
  yes?: boolean;
  json?: boolean;
  force?: boolean;
  shell?: string;
  unknownFlags?: string[];
  seenOptions?: string[];
  extraPositionals?: string[];
}

// ── Profile output shape (JSON mode) ─────────────────────────────────────────

export interface CodexProfileOutput {
  name: string;
  is_default: boolean;
  is_active: boolean;
  created: string;
  last_used: string | null;
  email: string | null;
  plan: string | null;
  account_id: string | null;
  profile_dir: string;
  auth_json_exists: boolean;
  auth_json_mtime: string | null;
  config_toml_link_target: string | null;
}

// ── Name validation ───────────────────────────────────────────────────────────

export { isValidCodexProfileName };
export const getProfileNameError = getCodexProfileNameError;

// ── Arg parsing ───────────────────────────────────────────────────────────────

export function parseArgs(args: string[]): CodexAuthArgs {
  const result: CodexAuthArgs = { unknownFlags: [], seenOptions: [] };
  const positional: string[] = [];
  const markSeen = (flag: string) => result.seenOptions?.push(flag);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      markSeen('--yes');
      result.yes = true;
    } else if (arg === '--json') {
      markSeen('--json');
      result.json = true;
    } else if (arg === '--force') {
      markSeen('--force');
      result.force = true;
    } else if (arg === '--shell') {
      markSeen('--shell');
      result.shell = args[++i] ?? '';
    } else if (arg.startsWith('--shell=')) {
      markSeen('--shell');
      result.shell = arg.slice('--shell='.length);
    } else if (arg.startsWith('-') && arg !== '--') {
      if (result.unknownFlags) result.unknownFlags.push(arg);
    } else if (arg !== '--') {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    result.profileName = positional[0];
  }
  if (positional.length > 1) {
    result.extraPositionals = positional.slice(1);
  }

  return result;
}

export interface AllowedCodexAuthOptions {
  yes?: boolean;
  json?: boolean;
  force?: boolean;
  shell?: boolean;
}

export function rejectUnsupportedOptions(
  parsed: CodexAuthArgs,
  usage: string,
  allowed: AllowedCodexAuthOptions = {}
): void {
  const unsupported = new Set(parsed.unknownFlags ?? []);
  const seen = new Set(parsed.seenOptions ?? []);
  if (seen.has('--yes') && !allowed.yes) unsupported.add('--yes');
  if (seen.has('--json') && !allowed.json) unsupported.add('--json');
  if (seen.has('--force') && !allowed.force) unsupported.add('--force');
  if (seen.has('--shell') && !allowed.shell) unsupported.add('--shell');
  const extraPositionals = parsed.extraPositionals ?? [];

  if (unsupported.size > 0 || extraPositionals.length > 0) {
    const flags = [...unsupported].join(', ');
    process.stderr.write(`Usage: ${color(usage, 'command')}\n`);
    const details = [
      flags ? `Unknown options: ${flags}` : null,
      extraPositionals.length > 0
        ? `Unexpected arguments: ${extraPositionals.map((arg) => `"${arg}"`).join(', ')}`
        : null,
    ].filter(Boolean);
    exitWithError(details.join('; '), ExitCode.GENERAL_ERROR);
  }
}
