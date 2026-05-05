/**
 * Show Command Handler
 *
 * Shows details for a specific profile.
 */

import * as fs from 'fs';
import * as path from 'path';
import { initUI, header, color, fail, table } from '../../utils/ui';
import { resolveAccountContextPolicy, formatAccountContextPolicy } from '../account-context';
import { describeSettingsSync, summarizeAccountHistory } from '../account-profile-diagnostics';
import { resolveConfiguredPlainCcsResumeLane } from '../resume-lane-diagnostics';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { CommandContext, ProfileOutput, parseArgs } from './types';

function formatHistorySummary(history: ReturnType<typeof summarizeAccountHistory>): string {
  const scope = history.projects_shared ? 'shared projects' : 'profile-local projects';
  const deeper = history.deeper_artifacts_shared ? ', deeper artifacts shared' : '';
  return `${scope}: ${history.project_count} project(s), ${history.session_count} session env file(s)${deeper}`;
}

/**
 * Handle the show command
 */
export async function handleShow(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const { profileName, json } = parseArgs(args);

  if (!profileName) {
    console.log(fail('Profile name is required'));
    console.log('');
    console.log(`Usage: ${color('ccs auth show <profile> [--json]', 'command')}`);
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  try {
    // Use merged profiles (checks unified config first, falls back to legacy)
    const allProfiles = ctx.registry.getAllProfilesMerged();
    const profile = allProfiles[profileName];
    if (!profile) {
      exitWithError(`Profile not found: ${profileName}`, ExitCode.PROFILE_ERROR);
    }
    const defaultProfile = ctx.registry.getDefaultResolved();
    const isDefault = profileName === defaultProfile;
    const instancePath = ctx.instanceMgr.getInstancePath(profileName);
    const contextPolicy = resolveAccountContextPolicy(profile);
    const settingsSync = describeSettingsSync(instancePath, { bare: profile.bare === true });
    const historySummary = summarizeAccountHistory(instancePath, contextPolicy);
    const plainCcsLane = await resolveConfiguredPlainCcsResumeLane().catch(() => null);
    const plainCcsUsesThisAccount =
      !!plainCcsLane && path.resolve(plainCcsLane.configDir) === path.resolve(instancePath);

    // Count sessions
    let sessionCount = 0;
    try {
      const sessionsDir = path.join(instancePath, 'session-env');
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir);
        sessionCount = files.filter((f) => f.endsWith('.json')).length;
      }
    } catch (_e) {
      // Ignore errors counting sessions
    }

    // JSON output mode
    if (json) {
      const output: ProfileOutput = {
        name: profileName,
        type: profile.type || 'account',
        is_default: isDefault,
        created: profile.created,
        last_used: profile.last_used || null,
        context_mode: contextPolicy.mode,
        context_group: contextPolicy.group || null,
        continuity_mode: contextPolicy.mode === 'shared' ? contextPolicy.continuityMode : null,
        instance_path: instancePath,
        session_count: sessionCount,
        settings_sync: {
          state: settingsSync.state,
          profile_settings_path: settingsSync.profile_settings_path,
          shared_settings_path: settingsSync.shared_settings_path,
          root_settings_path: settingsSync.root_settings_path,
        },
        history: historySummary,
        ...(plainCcsLane
          ? {
              plain_ccs_lane: {
                kind: plainCcsLane.kind,
                label: plainCcsLane.label,
                config_dir: plainCcsLane.configDir,
                project_count: plainCcsLane.projectCount,
                uses_this_account: plainCcsUsesThisAccount,
              },
            }
          : {}),
        ...(profile.bare ? { bare: true } : {}),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable output
    const defaultBadge = isDefault ? color(' (default)', 'success') : '';
    console.log(header(`Profile: ${profileName}${defaultBadge}`));
    console.log('');

    // Details table
    const details = [
      ['Type', profile.type || 'account'],
      ['Instance', instancePath],
      ['Created', new Date(profile.created).toLocaleString()],
      ['Last Used', profile.last_used ? new Date(profile.last_used).toLocaleString() : 'Never'],
      ['Context', formatAccountContextPolicy(contextPolicy)],
      ['Credentials', 'isolated per account'],
      ['Settings', settingsSync.description],
      ['History', formatHistorySummary(historySummary)],
      ...(plainCcsLane
        ? [
            [
              'Plain ccs',
              plainCcsUsesThisAccount
                ? `uses this account lane (${plainCcsLane.projectCount} project(s))`
                : `${plainCcsLane.label} (${plainCcsLane.projectCount} project(s))`,
            ],
          ]
        : []),
      ...(profile.bare ? [['Bare', 'yes (no shared symlinks)']] : []),
      ['Sessions', `${sessionCount}`],
    ];

    console.log(
      table(details, {
        colWidths: [15, 45],
      })
    );
    console.log('');
  } catch (error) {
    exitWithError((error as Error).message, ExitCode.PROFILE_ERROR);
  }
}
