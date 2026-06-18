/**
 * Persist Command - Main Handler
 *
 * Orchestrates the `ccs persist` command: dispatches to help/list/restore
 * subcommands, otherwise resolves a profile, previews writes, takes a backup
 * (optional), and atomically writes settings.json under a settings-dir lock.
 */

import * as fs from 'fs';
import { initUI, header, color, dim, ok, fail, warn, info } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import ProfileDetector from '../../auth/profile-detector';
import { getClaudeSettingsPath } from '../../utils/claude-config-path';
import { parseArgs, resolvePermissionMode } from './arg-parsing';
import { showHelp } from './help';
import { handleListBackups, handleRestore, createBackup } from './backup-rotation';
import {
  formatDisplayPath,
  getClaudeSettingsDisplayPath,
  pathExists,
  readClaudeSettings,
  withPersistSettingsLock,
  writeClaudeSettings,
} from './secure-file';
import { isSensitiveEnvKey, maskApiKey } from './secret-detection';
import { buildPersistReceipt, printPersistReceipt, resolveProfileEnvVars } from './receipt';
import type { ResolvedEnv } from './types';

/** Main persist command handler */
export async function handlePersistCommand(args: string[]): Promise<void> {
  // Check for help first
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    await showHelp();
    return;
  }
  const parsedArgs = parseArgs(args);
  if (parsedArgs.parseError) {
    throw new Error(parsedArgs.parseError);
  }
  // Handle --list-backups
  if (parsedArgs.listBackups) {
    await handleListBackups();
    return;
  }
  // Handle --restore
  if (parsedArgs.restore) {
    await handleRestore(parsedArgs.restore, parsedArgs.yes ?? false);
    return;
  }
  await initUI();
  const resolvedPermissionMode = resolvePermissionMode(parsedArgs);
  if (!parsedArgs.profile) {
    console.log(fail('Profile name is required'));
    console.log('');
    console.log('Usage:');
    console.log(`  ${color('ccs persist <profile>', 'command')}`);
    console.log('');
    console.log('Run for help:');
    console.log(`  ${color('ccs persist --help', 'command')}`);
    process.exit(1);
  }
  // Detect profile
  const detector = new ProfileDetector();
  try {
    detector.detectProfileType(parsedArgs.profile);
  } catch (error) {
    const err = error as Error & { availableProfiles?: string };
    console.log(fail(`Profile not found: ${parsedArgs.profile}`));
    console.log('');
    if (err.availableProfiles) {
      console.log(err.availableProfiles);
    }
    process.exit(1);
  }
  // Resolve env vars
  let resolved: ResolvedEnv;
  try {
    resolved = await resolveProfileEnvVars(parsedArgs.profile);
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }
  // Display what will be written
  console.log(header(`Persist Profile: ${parsedArgs.profile}`));
  console.log('');
  console.log(`Profile type: ${color(resolved.profileType, 'command')}`);
  console.log('');
  const envKeys = Object.keys(resolved.env);
  if (envKeys.length > 0) {
    console.log(`The following env vars will be written to ${getClaudeSettingsDisplayPath()}:`);
    console.log('');
    const maxKeyLen = Math.max(...envKeys.map((k) => k.length));
    for (const [key, value] of Object.entries(resolved.env)) {
      const paddedKey = key.padEnd(maxKeyLen + 2);
      const displayValue = isSensitiveEnvKey(key) ? maskApiKey(value) : value;
      console.log(`  ${color(paddedKey, 'command')} = ${displayValue}`);
    }
    console.log('');
  } else {
    console.log(info('No new env vars will be added.'));
    console.log(dim('    CCS-managed transport overrides will be removed if present.'));
    console.log('');
  }
  if (resolved.clearEnvKeys.length > 0) {
    console.log('Managed env keys replaced/cleared on write:');
    console.log(`  ${dim(resolved.clearEnvKeys.join(', '))}`);
    console.log('');
  }
  if (resolvedPermissionMode) {
    console.log(`Default permission mode: ${color(resolvedPermissionMode, 'command')}`);
    if (resolvedPermissionMode === 'bypassPermissions') {
      console.log(warn('Auto-approve enabled: Claude will skip permission prompts by default.'));
    }
    console.log('');
  }
  if (resolved.warnings?.length) {
    for (const message of resolved.warnings) {
      console.log(warn(message));
    }
    console.log('');
  }
  if (resolved.notes?.length) {
    for (const note of resolved.notes) {
      console.log(info(note));
    }
    console.log('');
  }
  // Warning about modification
  console.log(warn(`This will modify ${getClaudeSettingsDisplayPath()}`));
  console.log(dim('    Existing hooks and other settings will be preserved.'));
  console.log(
    dim('    Existing managed profile env keys will be replaced to avoid stale routing.')
  );
  console.log('');
  // Check if settings.json exists for backup
  const settingsPath = getClaudeSettingsPath();
  const settingsExist = fs.existsSync(settingsPath);
  let createBackupFlag = false;
  // Track backup path for error recovery guidance
  let createdBackupPath: string | null = null;
  // Backup prompt (unless --yes)
  if (settingsExist) {
    createBackupFlag = parsedArgs.yes === true; // Auto-backup with --yes
    if (!parsedArgs.yes) {
      createBackupFlag = await InteractivePrompt.confirm('Create backup before modifying?', {
        default: true,
      });
    }
  }
  // Proceed confirmation (unless --yes)
  if (!parsedArgs.yes) {
    const proceed = await InteractivePrompt.confirm('Proceed with persist?', { default: true });
    if (!proceed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }
  try {
    await withPersistSettingsLock(async () => {
      if (createBackupFlag && (await pathExists(settingsPath))) {
        try {
          createdBackupPath = await createBackup();
          console.log(ok(`Backup created: ${formatDisplayPath(createdBackupPath)}`));
          console.log('');
        } catch (error) {
          throw new Error(`Failed to create backup: ${(error as Error).message}`);
        }
      }

      // Read existing settings and merge
      const existingSettings = await readClaudeSettings();
      // Validate existing env is an object (not array/primitive)
      const rawEnv = existingSettings.env;
      let existingEnv: Record<string, string> = {};
      if (rawEnv !== undefined) {
        if (rawEnv === null) {
          console.log(warn('Existing env in settings.json is null - it will be replaced'));
        } else if (typeof rawEnv !== 'object' || Array.isArray(rawEnv)) {
          console.log(warn('Existing env in settings.json is not an object - it will be replaced'));
        } else {
          existingEnv = rawEnv as Record<string, string>;
        }
      }

      const preservedEnv = { ...existingEnv };
      for (const key of resolved.clearEnvKeys) {
        delete preservedEnv[key];
      }

      const mergedSettings: Record<string, unknown> = {
        ...existingSettings,
        env: {
          ...preservedEnv,
          ...resolved.env,
        },
      };

      if (resolvedPermissionMode) {
        const rawPermissions = existingSettings.permissions;
        let existingPermissions: Record<string, unknown> = {};
        if (rawPermissions !== undefined) {
          if (rawPermissions === null) {
            console.log(
              warn('Existing permissions in settings.json is null - it will be replaced')
            );
          } else if (typeof rawPermissions !== 'object' || Array.isArray(rawPermissions)) {
            console.log(
              warn('Existing permissions in settings.json is not an object - it will be replaced')
            );
          } else {
            existingPermissions = rawPermissions as Record<string, unknown>;
          }
        }
        mergedSettings.permissions = {
          ...existingPermissions,
          defaultMode: resolvedPermissionMode,
        };
      }

      await writeClaudeSettings(mergedSettings);
      const persistedSettings = await readClaudeSettings();
      const receipt = buildPersistReceipt(
        existingEnv,
        existingSettings,
        persistedSettings,
        resolved,
        resolvedPermissionMode
      );

      console.log('');
      console.log(
        ok(`Profile '${parsedArgs.profile}' written to ${getClaudeSettingsDisplayPath()}`)
      );
      console.log('');
      printPersistReceipt(receipt);
      console.log('');
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Failed to create backup:')) {
      console.log(fail(message));
    } else {
      console.log(fail(`Failed to write settings: ${message}`));
    }
    if (createdBackupPath) {
      console.log('');
      console.log(info(`A backup was created before this error:`));
      console.log(`    ${formatDisplayPath(createdBackupPath)}`);
      console.log(dim('    To restore: ccs persist --restore'));
    }
    process.exit(1);
  }
  console.log(info('Claude Code will now use this profile by default.'));
  console.log(dim('    To revert, restore the backup or edit settings.json manually.'));
  console.log('');
}
