import { initUI, header, color, ok, table } from '../../utils/ui';
import { resolveAccountContextPolicy } from '../account-context';
import {
  isSharedResourceMode,
  resolveSharedResourcePolicy,
  sharedResourceModeToMetadata,
  type SharedResourceMode,
} from '../shared-resource-policy';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { CommandContext, parseArgs, rejectUnsupportedAuthOptions } from './types';

function formatMode(mode: SharedResourceMode): string {
  return mode === 'profile-local' ? 'profile-local' : 'shared';
}

function modeDescription(mode: SharedResourceMode): string {
  return mode === 'profile-local'
    ? 'profile-local resources; plugins/settings/commands/skills/agents are not linked from ~/.claude'
    : 'shared resources from ~/.claude; plugins/settings/commands/skills/agents are linked into the account';
}

export async function handleResources(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args, { allowMode: true });
  const { profileName, mode, json } = parsed;
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth resources <profile> [--mode shared|profile-local] [--json]',
    allowMode: true,
  });

  if (!profileName) {
    console.log('');
    console.log(
      `Usage: ${color('ccs auth resources <profile> [--mode shared|profile-local] [--json]', 'command')}`
    );
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  const profiles = ctx.registry.getAllProfilesMerged();
  const currentProfile = profiles[profileName];
  if (!currentProfile || currentProfile.type !== 'account') {
    exitWithError(`Profile not found: ${profileName}`, ExitCode.PROFILE_ERROR);
  }

  const currentPolicy = resolveSharedResourcePolicy(currentProfile);

  if (mode === '') {
    exitWithError(
      'Missing value for --mode: expected shared|profile-local',
      ExitCode.PROFILE_ERROR
    );
  }

  if (mode !== undefined && !isSharedResourceMode(mode)) {
    exitWithError(
      'Invalid shared resource mode: expected shared|profile-local',
      ExitCode.PROFILE_ERROR
    );
  }

  if (mode === undefined) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            name: profileName,
            shared_resource_mode: currentPolicy.mode,
            shared_resource_inferred: currentPolicy.inferred,
            bare: currentPolicy.profileLocal ? true : undefined,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(header(`Shared Resources: ${profileName}`));
    console.log('');
    console.log(
      table(
        [
          ['Mode', formatMode(currentPolicy.mode)],
          ['Effective', modeDescription(currentPolicy.mode)],
        ],
        { colWidths: [14, 70] }
      )
    );
    console.log('');
    return;
  }

  const existsUnified = ctx.registry.hasAccountUnified(profileName);
  const existsLegacy = ctx.registry.hasProfile(profileName);
  const previousUnified = existsUnified
    ? ctx.registry.getAllAccountsUnified()[profileName]
    : undefined;
  const previousLegacy = existsLegacy ? ctx.registry.getProfile(profileName) : undefined;
  const contextPolicy = resolveAccountContextPolicy(currentProfile);
  const selectedMode: SharedResourceMode = mode;
  const metadata = sharedResourceModeToMetadata(selectedMode);

  try {
    if (existsUnified) {
      ctx.registry.updateAccountUnified(profileName, metadata);
    }
    if (existsLegacy) {
      ctx.registry.updateProfile(profileName, metadata);
    }

    await ctx.instanceMgr.ensureInstance(profileName, contextPolicy, {
      bare: selectedMode === 'profile-local',
    });
  } catch (error) {
    if (existsUnified && previousUnified) {
      ctx.registry.updateAccountUnified(profileName, {
        ...previousUnified,
        shared_resource_mode: previousUnified.shared_resource_mode,
        bare: previousUnified.bare,
      });
    }
    if (existsLegacy && previousLegacy) {
      ctx.registry.updateProfile(profileName, {
        ...previousLegacy,
        shared_resource_mode: previousLegacy.shared_resource_mode,
        bare: previousLegacy.bare,
      });
    }
    throw error;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          name: profileName,
          shared_resource_mode: selectedMode,
          shared_resource_inferred: false,
          bare: selectedMode === 'profile-local' ? true : undefined,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(ok(`Shared resources for "${profileName}" set to ${formatMode(selectedMode)}`));
  console.log('');
  console.log(modeDescription(selectedMode));
  console.log('');
}
