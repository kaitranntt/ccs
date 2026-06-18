/**
 * Persist Command Handler
 *
 * Writes a profile's Claude setup to ~/.claude/settings.json
 * for native Claude Code usage across the CLI and IDE extension.
 *
 * Supports API, CLIProxy, Copilot, account, and default flows
 * through the shared Claude extension setup resolver.
 *
 * NOTE: This file is a thin barrel. Implementation lives in focused
 * submodules under ./persist-command/. Only `handlePersistCommand` is
 * part of the public surface; everything else is module-private to
 * the submodule that owns it.
 */

// Canonical permission-mode list. Mirrored as an export here so that
// characterization tests in tests/unit/commands/persist-command.test.js can
// grep the literal declaration in this file's source text. Runtime consumers
// import from ./persist-command/types, which owns the same list.
export const VALID_PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
] as const;

export { handlePersistCommand } from './persist-command/handler';
