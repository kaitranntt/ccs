/**
 * Argument parsing for account-management subcommands (default/pause/resume).
 *
 * Extracted verbatim from the original god file. Only the parsing logic lives
 * here; the subcommand handlers themselves are in handlers.ts.
 */

import type { CliproxyProfileArgs } from './types';

/** Parse the raw CLI args for a `ccs cliproxy default|pause|resume` invocation. */
export function parseProfileArgs(args: string[]): CliproxyProfileArgs {
  const result: CliproxyProfileArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      result.provider = args[++i];
    } else if (arg === '--model' && args[i + 1]) {
      result.model = args[++i];
    } else if (arg === '--account' && args[i + 1]) {
      result.account = args[++i];
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (!arg.startsWith('-') && !result.name) {
      result.name = arg;
    }
  }
  return result;
}
