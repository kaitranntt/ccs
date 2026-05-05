/**
 * Auth Commands Type Definitions
 *
 * Shared interfaces for auth command modules.
 */

import ProfileRegistry from '../profile-registry';
import { InstanceManager } from '../../management/instance-manager';

// Re-export for backward compatibility
export { formatRelativeTime } from '../../utils/time';

/**
 * Command arguments parsed from CLI
 */
export interface AuthCommandArgs {
  profileName?: string;
  force?: boolean;
  verbose?: boolean;
  json?: boolean;
  yes?: boolean;
  shareContext?: boolean;
  contextGroup?: string;
  deeperContinuity?: boolean;
  bare?: boolean;
  unknownFlags?: string[];
}

/**
 * Profile output for JSON mode
 */
export interface ProfileOutput {
  name: string;
  type: string;
  is_default: boolean;
  created: string;
  last_used: string | null;
  context_mode?: 'isolated' | 'shared';
  context_group?: string | null;
  continuity_mode?: 'standard' | 'deeper' | null;
  instance_path?: string;
  session_count?: number;
  settings_sync?: {
    state: 'shared' | 'profile-local' | 'missing' | 'unknown';
    profile_settings_path: string;
    shared_settings_path: string;
    root_settings_path: string;
  };
  history?: {
    project_count: number;
    session_count: number;
    projects_path: string;
    projects_shared: boolean;
    deeper_artifacts_shared: boolean;
  };
  plain_ccs_lane?: {
    kind: string;
    label: string;
    config_dir: string;
    project_count: number;
    uses_this_account: boolean;
  };
  bare?: boolean;
}

/**
 * List output for JSON mode
 */
export interface ListOutput {
  version: string;
  profiles: ProfileOutput[];
}

/**
 * Shared context passed to command handlers
 */
export interface CommandContext {
  registry: ProfileRegistry;
  instanceMgr: InstanceManager;
  version: string;
}

/**
 * Parse command arguments from raw args array
 */
export function parseArgs(args: string[]): AuthCommandArgs {
  let profileName: string | undefined;
  let contextGroup: string | undefined;
  const unknownFlags = new Set<string>();
  const knownBooleanFlags = new Set([
    '--force',
    '--verbose',
    '--json',
    '--yes',
    '-y',
    '--share-context',
    '--deeper-continuity',
    '--bare',
  ]);
  const knownValueFlags = new Set(['--context-group']);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--context-group') {
      const next = args[i + 1];
      if (!next || next.startsWith('-')) {
        contextGroup = '';
        continue;
      }

      contextGroup = next;
      i++;
      continue;
    }

    if (arg.startsWith('--context-group=')) {
      contextGroup = arg.slice('--context-group='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      const normalizedFlag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      const isKnownFlag =
        knownBooleanFlags.has(normalizedFlag) || knownValueFlags.has(normalizedFlag);
      if (!isKnownFlag) {
        unknownFlags.add(normalizedFlag);
        // Best effort: unknown flags often take a value token.
        // Skip one following non-flag token to avoid mis-parsing profile name.
        const next = args[i + 1];
        if (!arg.includes('=') && next && !next.startsWith('-')) {
          i++;
        }
      }
      continue;
    }

    if (!profileName) {
      profileName = arg;
    }
  }

  return {
    profileName,
    force: args.includes('--force'),
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    yes: args.includes('--yes') || args.includes('-y'),
    shareContext: args.includes('--share-context'),
    deeperContinuity: args.includes('--deeper-continuity'),
    bare: args.includes('--bare'),
    contextGroup,
    unknownFlags: [...unknownFlags],
  };
}
