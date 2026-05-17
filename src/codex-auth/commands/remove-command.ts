/**
 * codex-auth remove command.
 * Deletes profile dir + registry entry.
 * Guards: refuses to remove the default when others exist (unless --force).
 * Best-effort warning if CCS_CODEX_PROFILE points to it.
 * --yes skips confirmation prompt.
 */

import * as fs from 'fs';
import * as path from 'path';
import { initUI, info, ok } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { resolveCodexProfileDir } from '../codex-profile-paths';
import { decodeAccountIdentity } from '../codex-account-identity';
import { parseArgs, rejectUnsupportedOptions, getProfileNameError } from './types';
import type { CodexCommandContext } from './types';
import type { CodexProfileMetadata } from '../types';

export async function handleRemoveCodex(ctx: CodexCommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  rejectUnsupportedOptions(parsed, 'ccsx auth remove <name> [--yes|-y] [--force]', {
    yes: true,
    force: true,
  });

  const { profileName, yes, force } = parsed;

  if (!profileName) {
    console.log('Usage: ccsx auth remove <name> [--yes|-y] [--force]');
    exitWithError('Profile name required', ExitCode.PROFILE_ERROR);
    return;
  }

  const nameError = getProfileNameError(profileName);
  if (nameError) {
    exitWithError(nameError, ExitCode.PROFILE_ERROR);
    return;
  }

  const { registry } = ctx;

  if (!registry.hasProfile(profileName)) {
    exitWithError(`Profile not found: ${profileName}`, ExitCode.PROFILE_ERROR);
    return;
  }

  const allProfiles = registry.listProfiles();
  const isDefault = registry.getDefault() === profileName;

  // Default guard: refuse if others exist and no --force
  if (isDefault && allProfiles.length > 1 && !force) {
    const others = allProfiles.filter((n) => n !== profileName);
    console.log(`    Switch first: ccsx auth switch ${others[0]}`);
    console.log(`    Or override : ccsx auth remove ${profileName} --force`);
    exitWithError('Cannot remove default profile', ExitCode.PROFILE_ERROR);
    return;
  }

  // Active-env warning (best-effort — can only see current shell)
  if (process.env.CCS_CODEX_PROFILE === profileName) {
    process.stderr.write(`[!] CCS_CODEX_PROFILE in this shell points to "${profileName}".\n`);
    process.stderr.write(`    After removal, codex sessions in this shell will fail until you\n`);
    const others = allProfiles.filter((n) => n !== profileName);
    if (others.length > 0) {
      process.stderr.write(
        `    run: eval "$(ccsx auth use ${others[0]})" or unset CCS_CODEX_PROFILE.\n`
      );
    } else {
      process.stderr.write(`    run: unset CCS_CODEX_PROFILE\n`);
    }
  }

  const profileDir = resolveCodexProfileDir(profileName);
  const authJsonPath = path.join(profileDir, 'auth.json');
  const authExists = fs.existsSync(authJsonPath);
  const dirExists = fs.existsSync(profileDir);

  // Load cached email for impact summary
  const meta = registry.getProfile(profileName);
  const originalDefault = registry.getDefault();
  let emailStr = meta.email ?? null;
  if (!emailStr && authExists) {
    const identity = decodeAccountIdentity(authJsonPath);
    emailStr = identity.email ?? null;
  }

  // Ghost case: dir already gone
  if (!dirExists) {
    process.stderr.write(`[!] Profile dir was already missing; removing registry entry only.\n`);
    try {
      registry.removeProfile(profileName, { forceDefault: force });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      exitWithError(
        `Profile registry update failed; profile dir was already missing.\n  ${msg}`,
        ExitCode.GENERAL_ERROR
      );
      return;
    }
    console.log(ok(`Profile removed: ${profileName}`));
    return;
  }

  // Impact summary
  console.log(`Profile "${profileName}" will be removed.`);
  console.log(`  Profile dir   : ${profileDir}`);
  console.log(`  auth.json     : ${authExists ? 'present (will be deleted)' : 'not found'}`);
  console.log(`  Email         : ${emailStr ?? '<unknown>'}`);
  console.log('');

  // Confirm unless --yes
  if (!yes) {
    const confirmed = await InteractivePrompt.confirm('Delete this profile?', {
      default: false,
    });
    if (!confirmed) {
      console.log(info('Cancelled.'));
      return;
    }
  }

  const stagedDeleteDir = `${profileDir}.deleting.${process.pid}.${Math.random()
    .toString(36)
    .slice(2)}`;
  const preservationDir = `${profileDir}.preserved.${process.pid}.${Math.random()
    .toString(36)
    .slice(2)}`;

  try {
    fs.renameSync(profileDir, stagedDeleteDir);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES') {
      exitWithError('Permission denied', ExitCode.GENERAL_ERROR);
      return;
    }
    throw err;
  }

  try {
    fs.cpSync(stagedDeleteDir, preservationDir, { recursive: true, errorOnExist: true });
  } catch (err) {
    const restored = _restoreProfileDir(stagedDeleteDir, profileDir);
    _removePathBestEffort(preservationDir);
    const preservedPath = restored ? profileDir : stagedDeleteDir;
    const msg = err instanceof Error ? err.message : String(err);
    exitWithError(
      `Profile data delete preparation failed; profile data was preserved at ${preservedPath}.\n  ${msg}`,
      ExitCode.GENERAL_ERROR
    );
    return;
  }

  try {
    registry.removeProfile(profileName, { forceDefault: force });
  } catch (err) {
    const restored = _restoreProfileDir(stagedDeleteDir, profileDir);
    _removePathBestEffort(preservationDir);
    const preservedPath = restored ? profileDir : stagedDeleteDir;
    const msg = err instanceof Error ? err.message : String(err);
    exitWithError(
      `Profile registry update failed; profile data was preserved at ${preservedPath}.\n  ${msg}`,
      ExitCode.GENERAL_ERROR
    );
    return;
  }

  try {
    fs.rmSync(stagedDeleteDir, { recursive: true, force: true });
    fs.rmSync(preservationDir, { recursive: true, force: true });
  } catch (err) {
    const restoreSource = fs.existsSync(preservationDir) ? preservationDir : stagedDeleteDir;
    const restoredDir = _restoreProfileDir(restoreSource, profileDir);
    const restoredRegistry = _restoreRegistryEntry(registry, profileName, meta, originalDefault);
    if (restoredDir && restoreSource === preservationDir) {
      _removePathBestEffort(stagedDeleteDir);
    }
    const preservedPath = restoredDir ? profileDir : stagedDeleteDir;
    const msg = err instanceof Error ? err.message : String(err);
    const registryNote = restoredRegistry
      ? 'Profile registry entry was restored.'
      : 'Profile registry entry could not be restored automatically.';
    exitWithError(
      `Profile data delete failed; profile data was preserved at ${preservedPath}. ${registryNote}\n  ${msg}`,
      ExitCode.GENERAL_ERROR
    );
    return;
  }

  console.log(ok(`Profile removed: ${profileName}`));
}

function _removePathBestEffort(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // best-effort cleanup after data has already been preserved elsewhere
  }
}

function _restoreRegistryEntry(
  registry: CodexCommandContext['registry'],
  profileName: string,
  meta: CodexProfileMetadata,
  originalDefault: string | null
): boolean {
  try {
    if (registry.hasProfile(profileName)) {
      registry.updateProfile(profileName, meta);
    } else {
      registry.createProfile(profileName, meta);
    }
    if (originalDefault === profileName) {
      registry.setDefault(profileName);
    }
    return true;
  } catch {
    process.stderr.write(
      `[!] Profile data delete failed and automatic registry restore failed for "${profileName}".\n`
    );
    return false;
  }
}

function _restoreProfileDir(stagedDeleteDir: string, profileDir: string): boolean {
  try {
    if (fs.existsSync(stagedDeleteDir) && !fs.existsSync(profileDir)) {
      fs.renameSync(stagedDeleteDir, profileDir);
      return true;
    }
    return fs.existsSync(profileDir);
  } catch {
    process.stderr.write(
      `[!] Registry update failed and automatic restore failed. Profile data remains at ${stagedDeleteDir}.\n`
    );
    return false;
  }
}
