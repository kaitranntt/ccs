/**
 * Remove Command Handler
 *
 * Removes a saved profile and its instance directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { initUI, color, ok, info } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';

import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { CommandContext, parseArgs, rejectUnsupportedAuthOptions } from './types';
import { isUnifiedMode } from '../../config/config-loader-facade';

/**
 * Handle the remove command
 */
export async function handleRemove(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  const { profileName, yes } = parsed;
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth remove <profile> [--yes]',
  });

  if (!profileName) {
    console.log('');
    console.log(`Usage: ${color('ccs auth remove <profile> [--yes]', 'command')}`);
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  // Check existence in both legacy and unified
  const existsLegacy = ctx.registry.hasProfile(profileName);
  const existsUnified = ctx.registry.hasAccountUnified(profileName);

  if (!existsLegacy && !existsUnified) {
    exitWithError(`Profile not found: ${profileName}`, ExitCode.PROFILE_ERROR);
  }

  try {
    // Get instance path and session count for impact display
    const instancePath = ctx.instanceMgr.getInstancePath(profileName);
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

    // Display impact
    console.log('');
    console.log(`Profile '${color(profileName, 'command')}' will be permanently deleted.`);
    console.log(`  Instance path: ${instancePath}`);
    console.log(`  Sessions: ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}`);
    console.log('');

    // Interactive confirmation (or --yes flag)
    const confirmed =
      yes || (await InteractivePrompt.confirm('Delete this profile?', { default: false })); // Default to NO (safe)

    if (!confirmed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }

    // Delete instance
    await ctx.instanceMgr.deleteInstance(profileName);

    // Delete profile from appropriate config
    if (isUnifiedMode() && existsUnified) {
      ctx.registry.removeAccountUnified(profileName);
    }
    if (existsLegacy) {
      ctx.registry.deleteProfile(profileName);
    }

    console.log(ok(`Profile removed: ${profileName}`));
    console.log('');
  } catch (error) {
    exitWithError(`Failed to remove profile: ${(error as Error).message}`, ExitCode.GENERAL_ERROR);
  }
}
