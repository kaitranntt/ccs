import * as fs from 'fs';
import * as path from 'path';
import { initUI, color, dim, info, ok } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import {
  createTimestampStamp,
  getAuthBackupRoot,
  getContinuityArtifactNames,
  resolveRuntimePlainCcsResumeLane,
} from '../resume-lane-diagnostics';
import { isAccountContextMetadata, resolveAccountContextPolicy } from '../account-context';
import { isProfileLocalSharedResourceMode } from '../shared-resource-policy';
import { CommandContext, parseArgs, rejectUnsupportedAuthOptions } from './types';

interface BackupManifest {
  target: string;
  source_config_dir: string;
  created_at: string;
  copied: string[];
  skipped: string[];
}

function copyDirectoryIfPresent(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    dereference: true,
    force: false,
    errorOnExist: false,
  });
  return true;
}

export async function handleBackup(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  const { profileName, json } = parsed;
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth backup <profile|default> [--json]',
  });

  if (!profileName) {
    console.log('');
    console.log(`Usage: ${color('ccs auth backup <profile|default> [--json]', 'command')}`);
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  try {
    let sourceConfigDir = '';
    let backupLabel = profileName;
    let artifactNames: string[] = [];

    if (profileName === 'default') {
      const lane = await resolveRuntimePlainCcsResumeLane();
      sourceConfigDir = lane.configDir;
      backupLabel = lane.accountName ? `default-${lane.accountName}` : 'default';
      artifactNames = getContinuityArtifactNames('default');
    } else {
      const profiles = ctx.registry.getAllProfilesMerged();
      const profile = profiles[profileName];
      if (!profile || profile.type !== 'account') {
        exitWithError(
          `Backup supports auth accounts or "default". Not found: ${profileName}`,
          ExitCode.PROFILE_ERROR
        );
      }

      const contextPolicy = resolveAccountContextPolicy(
        isAccountContextMetadata(profile) ? profile : undefined
      );
      sourceConfigDir = await ctx.instanceMgr.ensureInstance(profileName, contextPolicy, {
        bare: isProfileLocalSharedResourceMode(profile),
      });
      artifactNames = getContinuityArtifactNames('account');
    }

    const backupRoot = path.join(getAuthBackupRoot(), backupLabel, createTimestampStamp());
    fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });

    const copied: string[] = [];
    const skipped: string[] = [];

    for (const artifactName of artifactNames) {
      const sourcePath = path.join(sourceConfigDir, artifactName);
      const targetPath = path.join(backupRoot, artifactName);
      if (copyDirectoryIfPresent(sourcePath, targetPath)) {
        copied.push(artifactName);
      } else {
        skipped.push(artifactName);
      }
    }

    const manifest: BackupManifest = {
      target: profileName,
      source_config_dir: sourceConfigDir,
      created_at: new Date().toISOString(),
      copied,
      skipped,
    };
    fs.writeFileSync(
      path.join(backupRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      {
        encoding: 'utf8',
        mode: 0o600,
      }
    );

    if (json) {
      console.log(
        JSON.stringify(
          {
            target: profileName,
            backup_path: backupRoot,
            copied,
            skipped,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(ok(`Continuity backup created: ${backupRoot}`));
    console.log('');
    console.log(info(`Source lane: ${sourceConfigDir}`));
    console.log(`  ${dim(`Copied: ${copied.length > 0 ? copied.join(', ') : 'none'}`)}`);
    if (skipped.length > 0) {
      console.log(`  ${dim(`Skipped: ${skipped.join(', ')}`)}`);
    }
    console.log('');
  } catch (error) {
    exitWithError(
      `Failed to create continuity backup: ${(error as Error).message}`,
      ExitCode.GENERAL_ERROR
    );
  }
}
