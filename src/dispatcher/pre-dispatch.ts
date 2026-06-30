/**
 * Pre-dispatch side-effect handlers.
 *
 * Extracted from src/ccs.ts (Phase B, lines 145-254 after Phase A extraction).
 * Each handler may short-circuit the dispatch by returning true.
 *
 * Handles: update check, auto-migrate, recovery-manager, root-command router,
 * provider help shortcut, copilot/cursor subcommand routing, first-time install hint.
 */

import { info } from '../utils/ui';
import { isCLIProxyProvider } from '../cliproxy/provider-capabilities';
import { isCopilotSubcommandToken } from '../copilot/constants';
import { isCursorSubcommandToken, LEGACY_CURSOR_PROFILE_NAME } from '../cursor/constants';
import { isCacheStale } from '../utils/update-checker';
import { tryHandleRootCommand } from '../commands/root-command-router';
import { refreshUpdateCache, showCachedUpdateNotification } from './environment-builder';
import { printCursorLegacySubcommandDeprecation } from './cli-argument-parser';
import type { Logger } from '../services/logging/logger';

// ========== Pre-Dispatch Context ==========

export interface PreDispatchContext {
  args: string[];
  cliLogger: Logger;
}

// ========== Pre-Dispatch Runner ==========

/**
 * Run all pre-dispatch side-effect handlers in sequence.
 * Returns true if a handler consumed the command (caller should return immediately).
 * Returns false if dispatch should continue normally.
 *
 * All process.exit calls and dynamic imports are preserved at original call sites.
 */
export async function runPreDispatchHandlers(ctx: PreDispatchContext): Promise<boolean> {
  const { args, cliLogger } = ctx;
  const firstArg = args[0] as string | undefined;

  // Update check: show cached notification + refresh background cache
  const skipUpdateCheck = [
    'version',
    '--version',
    '-v',
    'help',
    '--help',
    '-h',
    'update',
    '--update',
  ];
  if (process.stdout.isTTY && !process.env['CI'] && !skipUpdateCheck.includes(firstArg ?? '')) {
    // 1. Show cached update notification (async for proper UI)
    await showCachedUpdateNotification();

    // 2. Refresh cache in background if stale (non-blocking)
    if (isCacheStale()) {
      refreshUpdateCache();
    }
  }

  // CCS_NO_PRE_DISPATCH guard — set by `ccsx auth use` to keep stdout clean
  // for shell eval. Must be checked BEFORE autoMigrate/recovery, both of which
  // write to stdout and would otherwise contaminate `eval "$(ccsx auth use <name>)"`.
  // See: src/codex-auth/commands/use-command.ts (C2 in plan.md §Validation findings)
  if (process.env.CCS_NO_PRE_DISPATCH === '1') {
    return false;
  }

  // Auto-migrate to unified config format (silent if already migrated)
  // Skip if user is explicitly running migrate command.
  // Wrapped in try-catch so a corrupt config.yaml does not crash pre-dispatch
  // before doctor/setup can run and report the problem to the user.
  if (firstArg !== 'migrate') {
    try {
      const { autoMigrate } = await import('../config/migration-manager');
      await autoMigrate();
    } catch (err) {
      cliLogger.warn('migration.failed', 'Auto-migration failed (config may be corrupt)', {
        message: (err as Error).message,
      });
      // Do not print the error again — loadUnifiedConfig already printed the YAML details.
    }
  }

  // Auto-recovery for missing configuration (BEFORE any early-exit commands)
  // Recovery is safe to run early - it only creates missing files with safe defaults
  // Wrapped in try-catch to prevent blocking --version/--help on permission errors
  try {
    const RecoveryManagerModule = await import('../management/recovery-manager');
    const RecoveryManager = RecoveryManagerModule.default;
    const recovery = new RecoveryManager();
    const recovered = recovery.recoverAll();

    if (recovered) {
      recovery.showRecoveryHints();
    }
  } catch (err) {
    cliLogger.warn('recovery.failed', 'Auto-recovery failed during CLI startup', {
      message: (err as Error).message,
    });
    // Recovery is best-effort - don't block basic CLI functionality. Use only the
    // first line: a YAML parse error embeds a multi-line snippet the loader already
    // printed, so re-emitting it here just duplicates the noise.
    console.warn('[!] Recovery failed:', (err as Error).message.split('\n')[0].trim());
  }

  // Root command router (handles --help, --version, config, doctor, etc.)
  if (await tryHandleRootCommand(args)) {
    return true;
  }

  // Provider help shortcut: `ccs gemini --help` → provider-specific help page
  if (
    typeof firstArg === 'string' &&
    isCLIProxyProvider(firstArg) &&
    args.length > 1 &&
    (args.includes('--help') || args.includes('-h'))
  ) {
    const { showProviderShortcutHelp } = await import('../commands/help-command');
    await showProviderShortcutHelp(firstArg);
    return true;
  }

  // Special case: copilot command (GitHub Copilot integration).
  // Route ONLY known subcommands to the handler; any other arg is kept as
  // passthrough to the copilot bridge profile flow (legacy behavior). Do not
  // treat an arbitrary token as an unknown subcommand error, or this breaks the
  // passthrough path.
  if (firstArg === 'copilot' && args.length > 1) {
    const copilotToken = args[1];
    if (isCopilotSubcommandToken(copilotToken)) {
      const { handleCopilotCommand } = await import('../commands/copilot-command');
      const exitCode = await handleCopilotCommand(args.slice(1));
      process.exit(exitCode);
    }
  }

  // Special case: explicit legacy Cursor bridge namespace.
  // Route ONLY known subcommands; keep other args as passthrough to the cursor
  // bridge flow (legacy behavior).
  if (firstArg === LEGACY_CURSOR_PROFILE_NAME && args.length > 1) {
    const cursorToken = args[1];
    if (isCursorSubcommandToken(cursorToken)) {
      const { handleCursorCommand } = await import('../commands/cursor-command');
      const exitCode = await handleCursorCommand(args.slice(1));
      process.exit(exitCode);
    }
  }

  // Compatibility shim: old `ccs cursor <subcommand>` still forwards to the legacy bridge
  // for one migration window, but bare/positional `ccs cursor` now belongs to CLIProxy.
  if (firstArg === 'cursor' && args.length > 1) {
    const { handleCursorCommand } = await import('../commands/cursor-command');
    const cursorToken = args[1];

    if (isCursorSubcommandToken(cursorToken) && cursorToken !== '--help' && cursorToken !== '-h') {
      printCursorLegacySubcommandDeprecation(cursorToken);
      const exitCode = await handleCursorCommand(args.slice(1));
      process.exit(exitCode);
    }
  }

  // First-time install: offer setup wizard for interactive users
  // Check independently of recovery status (user may have empty config.yaml)
  // Skip if headless, CI, or non-TTY environment
  const { isFirstTimeInstall } = await import('../commands/setup-command');
  if (process.stdout.isTTY && !process.env['CI'] && isFirstTimeInstall()) {
    console.log('');
    console.log(info('First-time install detected. Run `ccs setup` for guided configuration.'));
    console.log('    Or use `ccs config` for the web dashboard.');
    console.log('');
  }

  return false;
}
