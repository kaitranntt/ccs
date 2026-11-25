/**
 * CLIProxy Variant Management (Dispatcher / Facade)
 *
 * Handles:
 * - ccs cliproxy create [name]
 * - ccs cliproxy edit [name]
 * - ccs cliproxy remove <name>
 */

export { parseProfileArgs, validateVariantCreateName } from './variant-subcommand/shared-helpers';
export { handleCreate } from './variant-subcommand/create-handler';
export { handleRemove } from './variant-subcommand/remove-handler';
export { handleEdit } from './variant-subcommand/edit-handler';
