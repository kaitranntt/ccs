/**
 * Codex auth command router.
 *
 * Exports runCodexAuth(argv) which routes argv[0] (the subcommand) to
 * the appropriate handler. Returns an exit code (0 = success, non-zero = error).
 *
 * Phase 3 wires this into src/bin/codex-runtime.ts for argv[2]==='auth'.
 */

import { CodexProfileRegistry } from './codex-profile-registry';
import { printCodexAuthHelp } from './codex-auth-help';
import {
  handleCreateCodex,
  handleLoginCodex,
  handleSwitchCodex,
  handleUseCodex,
  handleShowCodex,
  handleRemoveCodex,
  handleImportDefaultCodex,
} from './commands/index';
import type { CodexCommandContext } from './commands/types';

const packageJson = require('../../package.json') as { version: string };

/**
 * Route a `ccsx auth <subcommand> [...args]` invocation.
 *
 * @param argv - Arguments after `auth`, e.g. ['create', 'work'] or ['--help']
 * @returns Exit code (0 success, 1 user error, 2+ system error)
 */
export async function runCodexAuth(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;

  // Help / no-arg
  if (!subcommand || subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    printCodexAuthHelp();
    return 0;
  }

  // Version passthrough
  if (subcommand === '--version' || subcommand === '-v') {
    process.stdout.write(`ccsx auth ${packageJson.version}\n`);
    return 0;
  }

  const registry = new CodexProfileRegistry();
  const ctx: CodexCommandContext = {
    registry,
    version: packageJson.version,
  };

  try {
    switch (subcommand) {
      case 'create':
        await handleCreateCodex(ctx, rest);
        return 0;
      case 'login':
        await handleLoginCodex(ctx, rest);
        return 0;
      case 'switch':
        await handleSwitchCodex(ctx, rest);
        return 0;
      case 'use':
        await handleUseCodex(ctx, rest);
        return 0;
      case 'show':
        await handleShowCodex(ctx, rest);
        return 0;
      case 'remove':
        await handleRemoveCodex(ctx, rest);
        return 0;
      case 'import-default':
        await handleImportDefaultCodex(ctx, rest);
        return 0;
      default:
        process.stderr.write(`[X] Unknown command: ${subcommand}\n`);
        process.stderr.write(`    ccsx auth --help\n`);
        return 1;
    }
  } catch (err) {
    // Unhandled errors from handlers (e.g. process.exit called inside)
    // These should be rare — handlers use exitWithError() which calls process.exit
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[X] Unexpected error in ccsx auth ${subcommand}: ${msg}\n`);
    return 1;
  }
}
