import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_ACCOUNT_CONTEXT_GROUP, type AccountContextPolicy } from './account-context';
import { getCcsDir } from '../config/config-loader-facade';
import { getDefaultClaudeConfigDir } from '../utils/claude-config-path';

export type SettingsSyncState = 'shared' | 'profile-local' | 'missing' | 'unknown';

export interface AccountSettingsSyncSummary {
  state: SettingsSyncState;
  profile_settings_path: string;
  shared_settings_path: string;
  root_settings_path: string;
  description: string;
}

export interface AccountHistorySummary {
  project_count: number;
  session_count: number;
  projects_path: string;
  projects_shared: boolean;
  deeper_artifacts_shared: boolean;
}

function safeRealpath(targetPath: string): string | null {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function countTopLevelDirectories(targetPath: string): number {
  try {
    return fs
      .readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

function countJsonFiles(targetPath: string): number {
  try {
    return fs.readdirSync(targetPath).filter((entry) => entry.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function resolvesTo(targetPath: string, expectedPath: string): boolean {
  const realTarget = safeRealpath(targetPath);
  const realExpected = safeRealpath(expectedPath);
  return !!realTarget && !!realExpected && realTarget === realExpected;
}

export function describeSettingsSync(
  instancePath: string,
  options: { bare?: boolean } = {}
): AccountSettingsSyncSummary {
  const rootSettingsPath = path.join(getDefaultClaudeConfigDir(), 'settings.json');
  const sharedSettingsPath = path.join(getCcsDir(), 'shared', 'settings.json');
  const profileSettingsPath = path.join(instancePath, 'settings.json');

  if (options.bare) {
    if (!fs.existsSync(profileSettingsPath)) {
      return {
        state: 'missing',
        profile_settings_path: profileSettingsPath,
        shared_settings_path: sharedSettingsPath,
        root_settings_path: rootSettingsPath,
        description: 'missing (bare profile; no local settings.json yet)',
      };
    }

    return {
      state: 'profile-local',
      profile_settings_path: profileSettingsPath,
      shared_settings_path: sharedSettingsPath,
      root_settings_path: rootSettingsPath,
      description: 'profile-local (bare profile; not linked to ~/.claude/settings.json)',
    };
  }

  if (!fs.existsSync(profileSettingsPath)) {
    return {
      state: 'missing',
      profile_settings_path: profileSettingsPath,
      shared_settings_path: sharedSettingsPath,
      root_settings_path: rootSettingsPath,
      description: 'missing (run or repair this profile to recreate settings link)',
    };
  }

  if (resolvesTo(profileSettingsPath, rootSettingsPath)) {
    return {
      state: 'shared',
      profile_settings_path: profileSettingsPath,
      shared_settings_path: sharedSettingsPath,
      root_settings_path: rootSettingsPath,
      description: 'shared with ~/.claude/settings.json',
    };
  }

  return {
    state: 'unknown',
    profile_settings_path: profileSettingsPath,
    shared_settings_path: sharedSettingsPath,
    root_settings_path: rootSettingsPath,
    description: 'not linked to ~/.claude/settings.json',
  };
}

export function summarizeAccountHistory(
  instancePath: string,
  policy: AccountContextPolicy
): AccountHistorySummary {
  const projectsPath = path.join(instancePath, 'projects');
  const sessionEnvPath = path.join(instancePath, 'session-env');
  const group = policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP;
  const sharedGroupRoot = path.join(getCcsDir(), 'shared', 'context-groups', group);
  const sharedProjectsPath = path.join(sharedGroupRoot, 'projects');
  const deeperArtifacts = ['session-env', 'file-history', 'shell-snapshots', 'todos'];

  return {
    project_count: countTopLevelDirectories(projectsPath),
    session_count: countJsonFiles(sessionEnvPath),
    projects_path: projectsPath,
    projects_shared: policy.mode === 'shared' && resolvesTo(projectsPath, sharedProjectsPath),
    deeper_artifacts_shared:
      policy.mode === 'shared' &&
      policy.continuityMode === 'deeper' &&
      deeperArtifacts.every((artifact) =>
        resolvesTo(
          path.join(instancePath, artifact),
          path.join(sharedGroupRoot, 'continuity', artifact)
        )
      ),
  };
}
