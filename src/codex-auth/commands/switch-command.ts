/**
 * codex-auth switch command.
 * Sets the persistent default Codex profile in the registry.
 */

import { initUI, ok } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { parseArgs, rejectUnsupportedOptions, getProfileNameError } from './types';
import type { CodexCommandContext } from './types';

export async function handleSwitchCodex(ctx: CodexCommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  rejectUnsupportedOptions(parsed, 'ccsx auth switch <name>');

  const { profileName } = parsed;

  if (!profileName) {
    console.log('Usage: ccsx auth switch <name>');
    exitWithError('Profile name required', ExitCode.PROFILE_ERROR);
    return;
  }

  const nameError = getProfileNameError(profileName);
  if (nameError) {
    exitWithError(nameError, ExitCode.PROFILE_ERROR);
    return;
  }

  const { registry } = ctx;

  if (!registry.hasProfile(profileName)) {
    const available = registry.listProfiles();
    const availableStr = available.length > 0 ? available.join(', ') : '<none>';
    exitWithError(
      `Profile not found: ${profileName}. Available: ${availableStr}`,
      ExitCode.PROFILE_ERROR
    );
    return;
  }

  registry.setDefault(profileName);

  const meta = registry.getProfile(profileName);
  const emailStr = meta.email ? `\n    Email: ${meta.email}` : '';
  const planStr = meta.plan_type ? `\n    Plan : ${meta.plan_type}` : '';

  console.log(ok(`Default Codex profile: ${profileName}`));
  if (emailStr) process.stdout.write(emailStr + '\n');
  if (planStr) process.stdout.write(planStr + '\n');
  console.log('');
  console.log('[i] This is the persistent default. To use a different profile in the');
  console.log(`    current shell only, run: eval "$(ccsx auth use <other>)"`);
}
