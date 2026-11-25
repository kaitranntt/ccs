/**
 * Disk/Keychain credential readers and profile enumeration for native quota collection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCcsDir } from '../../utils/config-manager';
import { getProviderAccounts } from '../../cliproxy/accounts/query';
import {
  readClaudeCredentials,
  readClaudeCredentialsForConfigDir,
  type ClaudeNativeCredentials,
} from './claude-native-credentials';
import { DEFAULT_PROFILE } from './native-quota-types';

/**
 * Read credentials for a specific Claude Code profile (file-first, Keychain fallback).
 */
export async function readClaudeCredentialsForProfileFromDisk(
  profile: string,
  readDefaultCredentials: () =>
    | ClaudeNativeCredentials
    | null
    | Promise<ClaudeNativeCredentials | null> = readClaudeCredentials
): Promise<ClaudeNativeCredentials | null> {
  try {
    const instanceDir = path.join(getCcsDir(), 'instances', profile);

    if (profile === DEFAULT_PROFILE && !fs.existsSync(instanceDir)) {
      return await readDefaultCredentials();
    }

    return await readClaudeCredentialsForConfigDir(instanceDir);
  } catch {
    return null;
  }
}

/**
 * Read Codex native auth from the profile's on-disk auth.json.
 */
export function readCodexNativeAuthFromDisk(
  profile: string
): { accessToken: string; accountId: string } | null {
  try {
    let authPath: string;
    if (profile === DEFAULT_PROFILE) {
      authPath = path.join(os.homedir(), '.codex', 'auth.json');
    } else {
      const instancesDir = path.join(getCcsDir(), 'codex-instances');
      authPath = path.join(instancesDir, profile, 'auth.json');
    }

    if (!fs.existsSync(authPath)) return null;
    const raw = fs.readFileSync(authPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tokens = parsed.tokens as Record<string, unknown> | undefined;
    if (!tokens) return null;
    const accessToken = tokens.access_token;
    const accountId = tokens.account_id;
    if (typeof accessToken !== 'string' || !accessToken) return null;
    return {
      accessToken,
      accountId: typeof accountId === 'string' ? accountId : '',
    };
  } catch {
    return null;
  }
}

/**
 * List all Claude profiles from the profile registry (merged legacy + unified).
 */
export function listClaudeProfilesFromDisk(): string[] {
  try {
    const { ProfileRegistry } = require('../../auth/profile-registry') as {
      ProfileRegistry: new () => {
        getAllProfilesMerged: () => Record<string, unknown>;
      };
    };
    const registry = new ProfileRegistry();
    const profiles = Object.keys(registry.getAllProfilesMerged());
    if (fs.existsSync(path.join(os.homedir(), '.claude'))) {
      if (!profiles.includes(DEFAULT_PROFILE)) profiles.unshift(DEFAULT_PROFILE);
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Resolve the default Claude profile. A registry-designated default wins;
 * otherwise the bare ~/.claude login (DEFAULT_PROFILE) is the default `ccs`.
 */
export function getDefaultClaudeProfileFromDisk(): string | null {
  try {
    const { ProfileRegistry } = require('../../auth/profile-registry') as {
      ProfileRegistry: new () => {
        getDefaultResolved: () => string | null;
      };
    };
    const registry = new ProfileRegistry();
    const reg = registry.getDefaultResolved();
    if (reg) return reg;
  } catch {
    // fall through to the bare default below
  }
  if (fs.existsSync(path.join(os.homedir(), '.claude'))) return DEFAULT_PROFILE;
  return null;
}

function getPausedCodexAccountIdentities(): Set<string> | null {
  try {
    const accounts = getProviderAccounts('codex');
    if (accounts.length === 0) return null;
    const identities = new Set<string>();
    for (const account of accounts) {
      if (!account.paused) continue;
      identities.add(account.id);
      if (account.email) identities.add(account.email);
    }
    return identities;
  } catch {
    return null;
  }
}

function codexProfileMatchesPausedAccount(
  profileName: string,
  profile: { email?: string; account_id?: string },
  pausedIdentities: Set<string> | null
): boolean {
  if (!pausedIdentities || pausedIdentities.size === 0) return false;
  return [profileName, profile.email, profile.account_id].some(
    (identity): identity is string => typeof identity === 'string' && pausedIdentities.has(identity)
  );
}

/**
 * List all Codex profiles from the registry, plus DEFAULT_PROFILE when the bare
 * ~/.codex/auth.json exists.
 */
export function listCodexProfilesFromDisk(): string[] {
  try {
    const { CodexProfileRegistry } = require('../../codex-auth/codex-profile-registry') as {
      CodexProfileRegistry: new () => {
        listProfiles: () => string[];
        getProfile: (name: string) => { email?: string; account_id?: string };
      };
    };
    const registry = new CodexProfileRegistry();
    const pausedIdentities = getPausedCodexAccountIdentities();
    const profiles = registry
      .listProfiles()
      .filter(
        (name) =>
          !codexProfileMatchesPausedAccount(name, registry.getProfile(name), pausedIdentities)
      );
    if (fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'))) {
      if (!profiles.includes(DEFAULT_PROFILE)) profiles.push(DEFAULT_PROFILE);
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Resolve the default Codex profile. Falls back to DEFAULT_PROFILE when the bare
 * ~/.codex/auth.json exists and no registry default is set.
 */
export function getDefaultCodexProfileFromDisk(): string | null {
  try {
    const { CodexProfileRegistry } = require('../../codex-auth/codex-profile-registry') as {
      CodexProfileRegistry: new () => {
        getDefault: () => string | null;
        getProfile: (name: string) => { email?: string; account_id?: string };
        listProfiles: () => string[];
      };
    };
    const registry = new CodexProfileRegistry();
    const pausedIdentities = getPausedCodexAccountIdentities();
    const def = registry.getDefault();
    if (def && !codexProfileMatchesPausedAccount(def, registry.getProfile(def), pausedIdentities)) {
      return def;
    }
    const fallback = registry
      .listProfiles()
      .find(
        (name) =>
          !codexProfileMatchesPausedAccount(name, registry.getProfile(name), pausedIdentities)
      );
    if (fallback) return fallback;
    if (fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'))) return DEFAULT_PROFILE;
    return null;
  } catch {
    return null;
  }
}
