/**
 * Persist Command - Receipt Building & Profile Resolution
 *
 * Computes the post-write receipt (cleared/written/unchanged env keys and
 * settings) and resolves a profile's extension env vars via the shared
 * Claude extension setup resolver.
 */

import { resolveClaudeExtensionSetup } from '../../shared/claude-extension-setup';
import {
  CODEX_TRANSLATOR_URL_MARKER,
  findCodexTranslatorUrlPaths,
  formatSettingsPathList,
} from '../../shared/stale-codex-translator-settings';
import { subheader, ok, warn } from '../../utils/ui';
import { getClaudeSettingsDisplayPath } from './secure-file';
import {
  NATIVE_CODEX_TARGETS,
  type PersistReceipt,
  type PermissionMode,
  type ResolvedEnv,
} from './types';

export function buildPersistReceipt(
  existingEnv: Record<string, string>,
  existingSettings: Record<string, unknown>,
  mergedSettings: Record<string, unknown>,
  resolved: ResolvedEnv,
  resolvedPermissionMode?: PermissionMode
): PersistReceipt {
  const mergedEnv =
    typeof mergedSettings.env === 'object' &&
    mergedSettings.env !== null &&
    !Array.isArray(mergedSettings.env)
      ? (mergedSettings.env as Record<string, string>)
      : {};

  const clearedKeys = resolved.clearEnvKeys.filter(
    (key) => Object.prototype.hasOwnProperty.call(existingEnv, key) && mergedEnv[key] === undefined
  );
  const clearedCodexTranslatorUrlKeys = clearedKeys.filter(
    (key) => findCodexTranslatorUrlPaths(existingEnv[key]).length > 0
  );
  const writtenKeys = Object.entries(resolved.env)
    .filter(([key, value]) => existingEnv[key] !== value)
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));
  const unchangedWrittenKeys = Object.entries(resolved.env)
    .filter(([key, value]) => existingEnv[key] === value)
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));
  const existingPermissions =
    typeof existingSettings.permissions === 'object' &&
    existingSettings.permissions !== null &&
    !Array.isArray(existingSettings.permissions)
      ? (existingSettings.permissions as Record<string, unknown>)
      : {};
  const writtenSettings =
    resolvedPermissionMode && existingPermissions.defaultMode !== resolvedPermissionMode
      ? ['permissions.defaultMode']
      : [];
  const unchangedSettings =
    resolvedPermissionMode && existingPermissions.defaultMode === resolvedPermissionMode
      ? ['permissions.defaultMode']
      : [];

  return {
    clearedKeys,
    clearedCodexTranslatorUrlKeys,
    writtenKeys,
    unchangedWrittenKeys,
    writtenSettings,
    unchangedSettings,
    codexTranslatorUrlPaths: findCodexTranslatorUrlPaths(mergedSettings),
  };
}

function formatKeyList(keys: string[]): string {
  return keys.length > 0 ? keys.join(', ') : 'none';
}

export function printPersistReceipt(receipt: PersistReceipt): void {
  console.log(subheader('Config Receipt'));
  console.log(`  Settings: ${getClaudeSettingsDisplayPath()}`);
  console.log(`  Cleared managed keys: ${formatKeyList(receipt.clearedKeys)}`);
  console.log(`  Written/rewritten managed keys: ${formatKeyList(receipt.writtenKeys)}`);
  if (receipt.unchangedWrittenKeys.length > 0) {
    console.log(`  Already current keys: ${formatKeyList(receipt.unchangedWrittenKeys)}`);
  }
  if (receipt.writtenSettings.length > 0 || receipt.unchangedSettings.length > 0) {
    console.log(`  Written/rewritten managed settings: ${formatKeyList(receipt.writtenSettings)}`);
    if (receipt.unchangedSettings.length > 0) {
      console.log(`  Already current settings: ${formatKeyList(receipt.unchangedSettings)}`);
    }
  }

  const hadCodexTranslatorCleanup = receipt.clearedCodexTranslatorUrlKeys.length > 0;
  if (receipt.codexTranslatorUrlPaths.length > 0) {
    console.log(
      warn(
        `  Codex translator URL: still found at ${formatSettingsPathList(
          receipt.codexTranslatorUrlPaths
        )} (${CODEX_TRANSLATOR_URL_MARKER})`
      )
    );
  } else {
    console.log(ok('  Codex translator URL: not found'));
  }
  if (hadCodexTranslatorCleanup || receipt.codexTranslatorUrlPaths.length > 0) {
    console.log(`  Native Codex target: ${NATIVE_CODEX_TARGETS.join(' or ')}`);
  }
}

/** Resolve shared Claude settings payload for a profile */
export async function resolveProfileEnvVars(profileName: string): Promise<ResolvedEnv> {
  const setup = await resolveClaudeExtensionSetup(profileName);
  const typeLabel: Record<string, string> = {
    settings: 'API',
    cliproxy: 'CLIProxy',
    copilot: 'Copilot',
    account: 'Account',
    default: 'Default',
  };

  return {
    env: setup.extensionEnv,
    clearEnvKeys: setup.removeEnvKeys,
    profileType: typeLabel[setup.profileType] ?? setup.profileType,
    warnings: setup.warnings,
    notes: setup.notes,
  };
}
