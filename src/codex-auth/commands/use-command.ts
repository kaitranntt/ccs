/**
 * codex-auth use command.
 *
 * STDOUT DISCIPLINE (C2, R4): stdout contains ONLY shell-evalable export
 * statements. ALL errors, hints, and info messages go to STDERR so that
 * `eval "$(ccsx auth use <name>)"` is never contaminated.
 *
 * Belt-and-suspenders for C2: the primary protection is
 * `src/bin/codex-runtime-router.ts`, which dispatches `auth` subcommands
 * BEFORE pre-dispatch runs at all. This IIFE is a fallback for any future
 * code path (e.g., direct import from a different bin entry) that bypasses
 * the router and would otherwise let pre-dispatch banners hit stdout.
 */

(function guardPreDispatch() {
  const argv = process.argv;
  // argv[2] is the first user arg to ccsx (e.g. "auth"), argv[3] is the subcommand
  for (let i = 2; i < argv.length - 1; i++) {
    if (argv[i] === 'auth' && argv[i + 1] === 'use') {
      process.env.CCS_NO_PRE_DISPATCH = '1';
      break;
    }
  }
})();
// ── End guard — safe to import CCS modules now ───────────────────────────────

import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { resolveCodexProfileDir } from '../codex-profile-paths';
import { detectShell, formatExport } from '../shell-detect';
import { parseArgs, rejectUnsupportedOptions, getProfileNameError } from './types';
import type { Shell } from '../shell-detect';
import type { CodexCommandContext } from './types';

const VALID_SHELLS = new Set<string>(['bash', 'zsh', 'fish', 'pwsh', 'cmd']);

export async function handleUseCodex(ctx: CodexCommandContext, args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  rejectUnsupportedOptions(parsed, 'ccsx auth use <name> [--shell <bash|zsh|fish|pwsh|cmd>]', {
    shell: true,
  });

  const { profileName, shell: shellOverride } = parsed;

  // All errors → stderr, empty stdout
  if (!profileName) {
    process.stderr.write('[X] Profile name is required.\n');
    process.stderr.write('Usage: ccsx auth use <name> [--shell <bash|zsh|fish|pwsh|cmd>]\n');
    process.exit(ExitCode.PROFILE_ERROR);
    return;
  }

  const nameError = getProfileNameError(profileName);
  if (nameError) {
    process.stderr.write(`[X] ${nameError}\n`);
    process.exit(ExitCode.PROFILE_ERROR);
    return;
  }

  if (shellOverride !== undefined && !VALID_SHELLS.has(shellOverride)) {
    process.stderr.write(
      `[X] Unsupported --shell value: "${shellOverride}". Valid: bash, zsh, fish, pwsh, cmd\n`
    );
    process.exit(ExitCode.GENERAL_ERROR);
    return;
  }

  const { registry } = ctx;

  if (!registry.hasProfile(profileName)) {
    const available = registry.listProfiles();
    const availableStr = available.length > 0 ? available.join(', ') : '<none>';
    process.stderr.write(`[X] Profile not found: ${profileName}. Available: ${availableStr}\n`);
    process.exit(ExitCode.PROFILE_ERROR);
    return;
  }

  const profileDir = resolveCodexProfileDir(profileName);
  const shell: Shell =
    shellOverride !== undefined
      ? (shellOverride as Shell)
      : detectShell(process.env, process.platform);

  // ── STDOUT: only export statements ──────────────────────────────────────────
  process.stdout.write(formatExport(shell, 'CODEX_HOME', profileDir) + '\n');
  process.stdout.write(formatExport(shell, 'CCS_CODEX_PROFILE', profileName) + '\n');

  // ── STDERR: human-readable hint ─────────────────────────────────────────────
  process.stderr.write(`[i] Codex profile "${profileName}" active in this shell. Run: codex\n`);

  if (shell === 'cmd') {
    process.stderr.write('[i] Note: cmd.exe cannot eval output from a subprocess natively.\n');
    process.stderr.write(
      '    Use PowerShell: ccsx auth use ' + profileName + ' | Invoke-Expression\n'
    );
  }

  // Note: This profile applies only to native `codex`.
  // `ccsxp` ignores CCS_CODEX_PROFILE and uses its own cliproxy pool.
}

// suppress unused import warning — exitWithError is available but we use process.exit
// for stdout purity in this command
void exitWithError;
