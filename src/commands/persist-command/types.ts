/**
 * Persist Command - Shared Types & Constants
 *
 * Shared interfaces, type aliases, and module constants used across the
 * persist-command submodules. Keeping these in one place avoids circular
 * imports between arg-parsing, receipt, secure-file, and handler modules.
 */

export interface PersistCommandArgs {
  profile?: string;
  yes?: boolean;
  listBackups?: boolean;
  restore?: string | boolean;
  permissionMode?: PermissionMode;
  dangerouslySkipPermissions?: boolean;
  parseError?: string;
}

export interface ResolvedEnv {
  env: Record<string, string>;
  clearEnvKeys: string[];
  profileType: string;
  warnings?: string[];
  notes?: string[];
}

export interface PersistReceipt {
  clearedKeys: string[];
  clearedCodexTranslatorUrlKeys: string[];
  writtenKeys: string[];
  unchangedWrittenKeys: string[];
  writtenSettings: string[];
  unchangedSettings: string[];
  codexTranslatorUrlPaths: string[];
}

export const PERSIST_KNOWN_FLAGS = [
  '--yes',
  '-y',
  '--list-backups',
  '--restore',
  '--permission-mode',
  '--dangerously-skip-permissions',
  '--auto-approve',
  '--help',
  '-h',
] as const;

export const VALID_PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
] as const;

export const PERSIST_LOCK_STALE_MS = 10000;
export const PERSIST_LOCK_RETRIES = 5;
export const PERSIST_LOCK_RETRY_MIN_MS = 100;
export const PERSIST_LOCK_RETRY_MAX_MS = 500;

/** Native Codex target invocation hints surfaced in the persist receipt. */
export const NATIVE_CODEX_TARGETS = ['ccsxp', 'ccs codex --target codex'];

export type PermissionMode = (typeof VALID_PERMISSION_MODES)[number];
