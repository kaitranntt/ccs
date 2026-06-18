/**
 * Persist Command - Argument Parsing
 *
 * Parses the raw CLI argv array for `ccs persist` into a typed
 * PersistCommandArgs object. Owns permission-mode validation and unknown
 * flag detection.
 */

import { extractOption, hasAnyFlag } from '../arg-extractor';
import {
  PERSIST_KNOWN_FLAGS,
  VALID_PERMISSION_MODES,
  type PersistCommandArgs,
  type PermissionMode,
} from './types';

export function isPermissionMode(value: string): value is PermissionMode {
  return VALID_PERMISSION_MODES.includes(value as PermissionMode);
}

export function isKnownPersistFlagToken(token: string): boolean {
  return PERSIST_KNOWN_FLAGS.some((flag) => token === flag || token.startsWith(`${flag}=`));
}

export function resolvePermissionMode(parsedArgs: PersistCommandArgs): PermissionMode | undefined {
  if (!parsedArgs.dangerouslySkipPermissions) {
    return parsedArgs.permissionMode;
  }

  if (parsedArgs.permissionMode && parsedArgs.permissionMode !== 'bypassPermissions') {
    throw new Error(
      '--dangerously-skip-permissions conflicts with --permission-mode. Use bypassPermissions or remove one flag.'
    );
  }

  return 'bypassPermissions';
}

/** Parse command line arguments */
export function parseArgs(args: string[]): PersistCommandArgs {
  const result: PersistCommandArgs = {
    yes: hasAnyFlag(args, ['--yes', '-y']),
    listBackups: hasAnyFlag(args, ['--list-backups']),
  };

  const restoreOption = extractOption(args, ['--restore']);
  if (restoreOption.found) {
    result.restore = restoreOption.missingValue ? true : restoreOption.value || true;
  }

  const permissionModeOption = extractOption(restoreOption.remainingArgs, ['--permission-mode'], {
    knownFlags: PERSIST_KNOWN_FLAGS,
  });
  if (permissionModeOption.found) {
    if (permissionModeOption.missingValue) {
      result.parseError = 'Missing value for --permission-mode';
    } else if (permissionModeOption.value) {
      if (!isPermissionMode(permissionModeOption.value)) {
        result.parseError = `Invalid --permission-mode "${permissionModeOption.value}". Valid modes: ${VALID_PERMISSION_MODES.join(', ')}`;
      } else {
        result.permissionMode = permissionModeOption.value;
      }
    }
  }

  result.dangerouslySkipPermissions = hasAnyFlag(permissionModeOption.remainingArgs, [
    '--dangerously-skip-permissions',
    '--auto-approve',
  ]);

  const unknownFlags = permissionModeOption.remainingArgs.filter(
    (arg) => arg.startsWith('-') && !isKnownPersistFlagToken(arg)
  );
  if (!result.parseError && unknownFlags.length > 0) {
    const unknownList = unknownFlags.map((flag) => `"${flag}"`).join(', ');
    result.parseError = `Unknown option(s): ${unknownList}. Run 'ccs persist --help' for usage.`;
  }

  if (!result.parseError && result.listBackups && result.restore) {
    result.parseError = '--list-backups cannot be used with --restore';
  }

  if (
    !result.parseError &&
    (result.listBackups || result.restore) &&
    (result.permissionMode || result.dangerouslySkipPermissions)
  ) {
    result.parseError =
      'Permission flags are not valid with backup operations. Use them only with ccs persist <profile>.';
  }

  for (const arg of permissionModeOption.remainingArgs) {
    if (!arg.startsWith('-')) {
      result.profile = arg;
      break;
    }
  }
  return result;
}
