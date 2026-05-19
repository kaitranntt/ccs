/**
 * codex-auth login command.
 * Spawns `codex login` with CODEX_HOME pinned to the profile dir.
 * Auto-creates profile if it doesn't exist yet.
 * Updates registry with email/plan from JWT after successful login.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { createLogger } from '../../services/logging';
import { initUI, info, ok } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { resolveCodexProfileDir, ensureSharedConfigSymlink } from '../index';
import { decodeAccountIdentity } from '../codex-account-identity';
import { detectCodexCli } from '../../targets/codex-detector';
import { parseArgs, rejectUnsupportedOptions, getProfileNameError } from './types';
import type { CodexProfileMetadata } from '../types';
import type { CodexCommandContext } from './types';

const logger = createLogger('codex-auth:cmd:login');

export async function handleLoginCodex(ctx: CodexCommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  rejectUnsupportedOptions(parsed, 'ccsx auth login <name>');

  const { profileName } = parsed;

  if (!profileName) {
    console.log('Usage: ccsx auth login <name>');
    exitWithError('Profile name required', ExitCode.PROFILE_ERROR);
    return;
  }

  const nameError = getProfileNameError(profileName);
  if (nameError) {
    exitWithError(nameError, ExitCode.PROFILE_ERROR);
    return;
  }

  const { registry } = ctx;
  const profileDir = resolveCodexProfileDir(profileName);

  // Auto-create profile if missing
  if (!registry.hasProfile(profileName)) {
    console.log(info(`Auto-creating profile ${profileName}`));
    ensureProfileDirReady(profileDir);
    registry.createProfile(profileName, {
      created: new Date().toISOString(),
      last_used: null,
    });
  }

  const codexCli = detectCodexCli();
  if (!codexCli) {
    console.log('');
    console.log('Install:');
    console.log('  npm i -g @openai/codex');
    console.log('  # or follow https://github.com/openai/codex#install');
    console.log('');
    console.log(`After installing, re-run:`);
    console.log(`  ccsx auth login ${profileName}`);
    exitWithError('codex CLI not found', ExitCode.BINARY_ERROR);
    return;
  }

  // Ensure profile dir exists (may have been deleted)
  if (!fs.existsSync(profileDir)) {
    ensureProfileDirReady(profileDir);
  }

  const authJsonPath = path.join(profileDir, 'auth.json');
  const authJsonExisted = fs.existsSync(authJsonPath);

  console.log(info(`Launching codex login for profile: ${profileName}`));
  console.log(`  CODEX_HOME=${profileDir}`);
  console.log('');

  const exitCode = await new Promise<number>((resolve) => {
    const child = childProcess.spawn(codexCli, ['login'], {
      stdio: 'inherit',
      env: { ...process.env, CODEX_HOME: profileDir },
      windowsHide: true,
    });

    child.on('error', (err) => {
      process.stderr.write(`[X] Failed to execute codex: ${err.message}\n`);
      logger.warn('codex-auth.login.spawn-error', 'Spawn failed', { error: err.message });
      resolve(ExitCode.BINARY_ERROR);
    });

    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });

  if (exitCode === 0 && fs.existsSync(authJsonPath)) {
    const identity = decodeAccountIdentity(authJsonPath);
    const now = new Date().toISOString();
    const metadataUpdate: Partial<CodexProfileMetadata> = { last_used: now };
    if (identity.email !== undefined) metadataUpdate.email = identity.email;
    if (identity.plan_type !== undefined) metadataUpdate.plan_type = identity.plan_type;
    if (identity.account_id !== undefined) metadataUpdate.account_id = identity.account_id;
    registry.updateProfile(profileName, metadataUpdate);
    const emailStr = identity.email ?? '<unknown>';
    const planStr = identity.plan_type ? ` (plan: ${identity.plan_type})` : '';
    console.log(ok(`Logged in as ${emailStr}${planStr}`));
    console.log(`  Profile: ${profileName}`);
    console.log(`  Updated: ${now}`);
  } else if (exitCode === 0) {
    process.stderr.write(
      '[!] codex login exited cleanly but no auth.json. Skipping registry update.\n'
    );
  } else {
    if (!authJsonExisted) {
      process.stderr.write(
        `[!] Login cancelled or failed. Profile ${profileName} remains unauthenticated.\n`
      );
    } else {
      process.stderr.write('[!] Login failed. Previous credentials may still be valid.\n');
    }
    process.exit(ExitCode.AUTH_ERROR);
  }
}

function ensureProfileDirReady(profileDir: string): void {
  try {
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    ensureSharedConfigSymlink(profileDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('codex-auth.login.config-repair-failed', 'Config repair failed', {
      profileDir,
      error: msg,
    });
    exitWithError(`Failed to prepare profile config.toml: ${msg}`, ExitCode.CONFIG_ERROR);
  }
}
