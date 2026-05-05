/**
 * Create Command Handler
 *
 * Creates a new profile and prompts for login in an isolated Claude instance.
 */

import { spawn, ChildProcess } from 'child_process';
import { initUI, header, color, fail, warn, info, infoBox, warnBox } from '../../utils/ui';
import { getClaudeCliInfo } from '../../utils/claude-detector';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripClaudeCodeEnv,
} from '../../utils/shell-executor';

import { ProfileMetadata } from '../../types';
import {
  resolveCreateAccountContext,
  policyToAccountContextMetadata,
  formatAccountContextPolicy,
  isValidAccountProfileName,
  resolveAccountContextPolicy,
} from '../account-context';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { CommandContext, parseArgs } from './types';
import { stripAmbientProviderCredentials } from './create-command-env';
import { isUnifiedMode } from '../../config/config-loader-facade';

function sanitizeProfileNameForInstance(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

/**
 * Handle the create command
 */
export async function handleCreate(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const { profileName, force, shareContext, contextGroup, deeperContinuity, bare, unknownFlags } =
    parseArgs(args);

  if (unknownFlags && unknownFlags.length > 0) {
    const unknownList = unknownFlags.map((flag) => `"${flag}"`).join(', ');
    console.log(fail(`Unknown option(s): ${unknownList}`));
    console.log('');
    console.log(
      `Usage: ${color('ccs auth create <profile> [--force] [--bare] [--share-context] [--context-group <name>] [--deeper-continuity]', 'command')}`
    );
    console.log(`Help:  ${color('ccs auth --help', 'command')}`);
    console.log('');
    exitWithError(`Unknown option(s): ${unknownList}`, ExitCode.PROFILE_ERROR);
  }

  if (!profileName) {
    console.log(fail('Profile name is required'));
    console.log('');
    console.log(
      `Usage: ${color('ccs auth create <profile> [--force] [--bare] [--share-context] [--context-group <name>] [--deeper-continuity]', 'command')}`
    );
    console.log('');
    console.log('Example:');
    console.log(`  ${color('ccs auth create work', 'command')}`);
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  if (!isValidAccountProfileName(profileName)) {
    const error =
      'Invalid profile name. Use letters/numbers/dash/underscore and start with a letter.';
    console.log(fail(error));
    console.log('');
    exitWithError(error, ExitCode.PROFILE_ERROR);
  }

  // Check if profile already exists (check both legacy and unified)
  const existsLegacy = ctx.registry.hasProfile(profileName);
  const existsUnified = ctx.registry.hasAccountUnified(profileName);
  if (!force && (existsLegacy || existsUnified)) {
    console.log(fail(`Profile already exists: ${profileName}`));
    console.log(`    Use ${color('--force', 'command')} to overwrite`);
    exitWithError(`Profile already exists: ${profileName}`, ExitCode.PROFILE_ERROR);
  }

  const normalizedName = sanitizeProfileNameForInstance(profileName);
  const collidingName = Object.keys(ctx.registry.getAllProfilesMerged()).find(
    (name) => name !== profileName && sanitizeProfileNameForInstance(name) === normalizedName
  );

  if (collidingName) {
    const error = `Profile "${profileName}" conflicts with existing profile "${collidingName}" on filesystem.`;
    console.log(fail(error));
    console.log('');
    exitWithError(error, ExitCode.PROFILE_ERROR);
  }

  const resolvedContext = resolveCreateAccountContext({
    shareContext: !!shareContext,
    contextGroup,
    deeperContinuity: !!deeperContinuity,
  });

  if (resolvedContext.error) {
    console.log(fail(resolvedContext.error));
    console.log('');
    exitWithError(resolvedContext.error, ExitCode.PROFILE_ERROR);
  }

  const contextPolicy = resolvedContext.policy;
  const contextMetadata = policyToAccountContextMetadata(contextPolicy);
  const useUnifiedConfig = isUnifiedMode();
  const profileExistedBeforeCreate = existsLegacy || existsUnified;
  const createdUnifiedProfile = useUnifiedConfig && !existsUnified;
  const createdLegacyProfile = !useUnifiedConfig && !existsLegacy;
  const previousLegacyProfile: ProfileMetadata | undefined = existsLegacy
    ? ctx.registry.getProfile(profileName)
    : undefined;
  const previousUnifiedProfile = existsUnified
    ? ctx.registry.getAllAccountsUnified()[profileName]
    : undefined;
  const previousBare =
    previousLegacyProfile?.bare === true || previousUnifiedProfile?.bare === true;
  const effectiveBare = bare === true || (profileExistedBeforeCreate && previousBare);
  const previousContextPolicy =
    profileExistedBeforeCreate && (previousUnifiedProfile || previousLegacyProfile)
      ? resolveAccountContextPolicy(previousUnifiedProfile || previousLegacyProfile)
      : undefined;

  const claudeInfo = getClaudeCliInfo();
  if (!claudeInfo) {
    console.log(fail('Claude CLI not found'));
    console.log('');
    console.log('Please install Claude CLI first:');
    console.log(`  ${color('https://claude.ai/download', 'path')}`);
    exitWithError('Claude CLI not found', ExitCode.BINARY_ERROR);
  }

  let rollbackCompleted = false;
  const rollbackMetadata = (): void => {
    try {
      if (useUnifiedConfig) {
        if (createdUnifiedProfile) {
          if (ctx.registry.hasAccountUnified(profileName)) {
            ctx.registry.removeAccountUnified(profileName);
          }
        } else if (previousUnifiedProfile) {
          ctx.registry.updateAccountUnified(profileName, previousUnifiedProfile);
        }
      } else {
        if (createdLegacyProfile) {
          if (ctx.registry.hasProfile(profileName)) {
            ctx.registry.deleteProfile(profileName);
          }
        } else if (previousLegacyProfile) {
          ctx.registry.updateProfile(profileName, previousLegacyProfile);
        }
      }
    } catch {
      // Best-effort rollback to avoid leaving stale accounts after failed login.
    }
  };

  const rollbackFailedCreate = async (): Promise<void> => {
    if (rollbackCompleted) {
      return;
    }
    rollbackCompleted = true;

    rollbackMetadata();

    if (!profileExistedBeforeCreate) {
      try {
        await ctx.instanceMgr.deleteInstance(profileName);
      } catch {
        // Best-effort cleanup.
      }
      return;
    }

    if (previousContextPolicy) {
      try {
        await ctx.instanceMgr.ensureInstance(profileName, previousContextPolicy, {
          bare: previousBare,
        });
      } catch {
        // Best-effort rollback for context mode/group.
      }
    }
  };

  try {
    // Create instance directory
    console.log(info(`Creating profile: ${profileName}`));
    const instancePath = await ctx.instanceMgr.ensureInstance(profileName, contextPolicy, {
      bare: effectiveBare,
    });

    // Create/update profile entry based on config mode
    if (useUnifiedConfig) {
      // Use unified config (config.yaml)
      if (existsUnified) {
        ctx.registry.updateAccountUnified(profileName, {
          context_mode: contextMetadata.context_mode,
          context_group: contextMetadata.context_group,
          ...(effectiveBare ? { bare: true } : {}),
        });
        ctx.registry.touchAccountUnified(profileName);
      } else {
        ctx.registry.createAccountUnified(profileName, {
          ...contextMetadata,
          ...(effectiveBare ? { bare: true } : {}),
        });
      }
    } else {
      // Use legacy profiles.json
      if (existsLegacy) {
        ctx.registry.updateProfile(profileName, {
          type: 'account',
          context_mode: contextMetadata.context_mode,
          context_group: contextMetadata.context_group,
          ...(effectiveBare ? { bare: true } : {}),
        });
      } else {
        ctx.registry.createProfile(profileName, {
          type: 'account',
          context_mode: contextMetadata.context_mode,
          context_group: contextMetadata.context_group,
          ...(effectiveBare ? { bare: true } : {}),
        });
      }
    }

    console.log(info(`Instance directory: ${instancePath}`));
    console.log('');
    const launchDescription =
      contextPolicy.mode === 'shared'
        ? contextPolicy.continuityMode === 'deeper'
          ? `Starting Claude with shared context group "${contextPolicy.group || 'default'}" (deeper continuity)...`
          : `Starting Claude with shared context group "${contextPolicy.group || 'default'}"...`
        : 'Starting Claude in isolated instance...';
    console.log(warn(launchDescription));
    console.log(warn('You will be prompted to login with your account.'));
    console.log('');

    const { path: claudeCli, needsShell } = claudeInfo;
    const childEnv = stripAmbientProviderCredentials(
      stripClaudeCodeEnv({ ...process.env, CLAUDE_CONFIG_DIR: instancePath })
    );

    // Execute Claude in isolated instance (will auto-prompt for login if no credentials)
    // On Windows, .cmd/.bat/.ps1 files need shell: true to execute properly
    let child: ChildProcess;
    try {
      if (needsShell) {
        const cmdString = escapeShellArg(claudeCli);
        child = spawn(cmdString, {
          stdio: 'inherit',
          windowsHide: true,
          shell: getWindowsEscapedCommandShell(),
          env: childEnv,
        });
      } else {
        child = spawn(claudeCli, [], {
          stdio: 'inherit',
          windowsHide: true,
          env: childEnv,
        });
      }
    } catch (error) {
      await rollbackFailedCreate();
      exitWithError(
        `Failed to execute Claude CLI: ${(error as Error).message}`,
        ExitCode.BINARY_ERROR
      );
    }

    child.on('exit', async (code: number | null) => {
      if (code === 0) {
        console.log('');
        console.log(
          infoBox(
            `Profile:  ${profileName}\n` +
              `Instance: ${instancePath}\n` +
              `Type:     account\n` +
              `Context:  ${formatAccountContextPolicy(contextPolicy)}\n` +
              `Tokens:   isolated per account\n` +
              `Settings: ${effectiveBare ? 'profile-local (bare)' : 'shared with ~/.claude/settings.json'}` +
              (effectiveBare ? '\nMode:     bare (no shared symlinks)' : ''),
            'Profile Created'
          )
        );
        console.log('');
        console.log(header('Usage'));
        console.log(`  ${color(`ccs ${profileName} "your prompt here"`, 'command')}`);
        console.log('');
        console.log(
          'To keep two accounts separate, create another account and run either profile by name:'
        );
        console.log(`  ${color('ccs auth create personal', 'command')}`);
        console.log(
          `  ${color(`ccs ${profileName}`, 'command')} / ${color('ccs personal', 'command')}`
        );
        console.log('');
        console.log(
          warnBox(
            `Running the command below will SWITCH your default\n` +
              `CCS account to "${profileName}". After this, running\n` +
              `"ccs" without a profile name will use this account.\n\n` +
              `  ${color(`ccs auth default ${profileName}`, 'command')}\n\n` +
              `To restore the original default, run:\n` +
              `  ${color('ccs auth reset-default', 'command')}`,
            'Set as Default?'
          )
        );
        console.log('');
        process.exit(0);
      } else {
        await rollbackFailedCreate();

        console.log('');
        console.log(fail('Login failed or cancelled'));
        console.log('');
        console.log('To retry:');
        console.log(`  ${color(`ccs auth create ${profileName} --force`, 'command')}`);
        console.log('');
        exitWithError('Login failed or cancelled', ExitCode.AUTH_ERROR);
      }
    });

    child.on('error', async (err: Error) => {
      await rollbackFailedCreate();
      exitWithError(`Failed to execute Claude CLI: ${err.message}`, ExitCode.BINARY_ERROR);
    });
  } catch (error) {
    await rollbackFailedCreate();
    exitWithError(`Failed to create profile: ${(error as Error).message}`, ExitCode.GENERAL_ERROR);
  }
}
