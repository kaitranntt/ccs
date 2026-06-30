/**
 * Auth Commands Barrel Export
 *
 * Re-exports all command handlers and types from the commands module.
 */

// Types and utilities
export type { AuthCommandArgs, ProfileOutput, ListOutput, CommandContext } from './types';
export { parseArgs, formatRelativeTime } from './types';

// Command handlers
export { handleCreate } from './create-command';
export { handleBackup } from './backup-command';
export { handleList } from './list-command';
export { handleShow } from './show-command';
export { handleResources } from './resources-command';
export { handleRemove } from './remove-command';
export { handleDefault, handleResetDefault } from './default-command';
