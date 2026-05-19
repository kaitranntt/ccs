/**
 * Detail view renderer for `ccsx auth show <name>`.
 * Extracted from show-command.ts to keep files under 200 lines.
 */

import * as fs from 'fs';
import * as path from 'path';
import { table } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { resolveCodexProfileDir } from '../codex-profile-paths';
import { decodeAccountIdentity } from '../codex-account-identity';
import type { CodexCommandContext, CodexProfileOutput } from './types';

export function showProfileDetail(
  profileName: string,
  ctx: CodexCommandContext,
  json: boolean
): void {
  const { registry } = ctx;

  if (!registry.hasProfile(profileName)) {
    exitWithError(`Profile not found: ${profileName}`, ExitCode.PROFILE_ERROR);
    return;
  }

  const meta = registry.getProfile(profileName);
  const profileDir = resolveCodexProfileDir(profileName);
  const authJsonPath = path.join(profileDir, 'auth.json');
  const configTomlPath = path.join(profileDir, 'config.toml');

  const authExists = fs.existsSync(authJsonPath);
  let authMtime: string | null = null;
  let identity = {
    email: undefined as string | undefined,
    plan_type: undefined as string | undefined,
    account_id: undefined as string | undefined,
  };
  let authState = 'missing';

  if (authExists) {
    try {
      const stat = fs.statSync(authJsonPath);
      authMtime = stat.mtime.toISOString();
      identity = decodeAccountIdentity(authJsonPath) as typeof identity;
      authState = `present (mtime: ${new Date(authMtime).toLocaleString()})`;
    } catch {
      authState = 'present (unreadable)';
    }
  }

  // Inspect config.toml symlink
  let configTarget: string | null = null;
  try {
    const lstat = fs.lstatSync(configTomlPath);
    if (lstat.isSymbolicLink()) {
      configTarget = fs.readlinkSync(configTomlPath);
    } else {
      configTarget = `${configTomlPath} (regular file, not symlink)`;
    }
  } catch {
    configTarget = null;
  }

  const isDefault = registry.getDefault() === profileName;
  const isActive = process.env.CCS_CODEX_PROFILE === profileName;
  const states: string[] = [];
  if (isDefault) states.push('default');
  if (isActive) states.push('active');
  const stateStr = states.join(',');
  const accountId = meta.account_id ?? identity.account_id ?? null;
  const email = meta.email ?? identity.email ?? null;
  const plan = meta.plan_type ?? identity.plan_type ?? null;

  if (json) {
    const out: CodexProfileOutput = {
      name: profileName,
      is_default: isDefault,
      is_active: isActive,
      created: meta.created,
      last_used: meta.last_used ?? null,
      email,
      plan,
      account_id: accountId,
      profile_dir: profileDir,
      auth_json_exists: authExists,
      auth_json_mtime: authMtime,
      config_toml_link_target: configTarget,
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const badge = stateStr ? ` (${stateStr})` : '';
  console.log(`Codex Profile: ${profileName}${badge}`);
  console.log('');

  const rows: [string, string][] = [
    ['Name', profileName],
    ['Profile dir', profileDir],
    ['config.toml', configTarget ? `-> ${configTarget}  (symlink)` : '(not linked)'],
    ['auth.json', authState],
    ['Email', email ?? (authExists ? '<invalid>' : '<unknown>')],
    ['Plan', plan ?? (authExists ? '<invalid>' : '<unknown>')],
    ['Account ID', accountId ?? '-'],
    ['Created', new Date(meta.created).toLocaleString()],
    ['Last used', meta.last_used ? new Date(meta.last_used).toLocaleString() : 'never'],
    ['CODEX_HOME (env)', process.env.CODEX_HOME ?? 'unset'],
    ['CCS_CODEX_PROFILE', process.env.CCS_CODEX_PROFILE ?? 'unset'],
  ];

  console.log(table(rows, { colWidths: [20, 55] }));

  // H4: warn if config.toml is a regular file (not symlink)
  if (configTarget && configTarget.includes('regular file')) {
    process.stderr.write(
      `[!] config.toml is a regular file, not a symlink. Config changes won't propagate.\n`
    );
    process.stderr.write(`    Run: ccsx auth create ${profileName} --force\n`);
  }
}
