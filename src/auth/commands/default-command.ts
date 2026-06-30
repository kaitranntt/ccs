/**
 * Default Command Handler
 *
 * Sets or clears the default profile.
 */

import { initUI, color, dim, ok, fail } from '../../utils/ui';

import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { CommandContext, parseArgs, rejectUnsupportedAuthOptions } from './types';
import { isUnifiedMode } from '../../config/config-loader-facade';

/**
 * Handle the default command (set default profile)
 */
export async function handleDefault(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  const { profileName } = parsed;
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth default <profile>',
  });

  if (!profileName) {
    console.log('');
    console.log(`Usage: ${color('ccs auth default <profile>', 'command')}`);
    exitWithError('Profile name is required', ExitCode.PROFILE_ERROR);
  }

  try {
    // Use unified or legacy based on config mode
    if (isUnifiedMode()) {
      ctx.registry.setDefaultUnified(profileName);
    } else {
      ctx.registry.setDefaultProfile(profileName);
    }

    console.log(ok(`Default profile set: ${profileName}`));
    console.log('');
    console.log('Now you can use:');
    console.log(
      `  ${color('ccs "your prompt"', 'command')}  ${dim(`# Uses ${profileName} profile`)}`
    );
    console.log('');
  } catch (error) {
    exitWithError((error as Error).message, ExitCode.PROFILE_ERROR);
  }
}

/**
 * Handle the reset-default command (clear the custom default)
 */
export async function handleResetDefault(ctx: CommandContext, args: string[] = []): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth reset-default',
  });

  try {
    // Use unified or legacy based on config mode
    if (isUnifiedMode()) {
      ctx.registry.clearDefaultUnified();
    } else {
      ctx.registry.clearDefaultProfile();
    }

    console.log(ok('Default profile cleared'));
    console.log('');
    console.log('CCS will now use the original behavior:');
    console.log(`  ${dim('# Uses your primary Claude account')}`);
    console.log(`  ${color('ccs "your prompt"', 'command')}`);
    console.log('');
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }
}
