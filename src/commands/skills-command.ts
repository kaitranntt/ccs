/**
 * Skills Command Handler
 *
 * Wraps `npx skills` to provide per-profile skill management.
 * Uses CLAUDE_CONFIG_DIR to target the correct instance directory.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { initUI, header, ok, info, warn, fail } from '../utils/ui';
import { loadOrCreateUnifiedConfig, mutateUnifiedConfig } from '../config/unified-config-loader';
import { resolveAccountContextPolicy } from '../auth/account-context';
import InstanceManager from '../management/instance-manager';
import SharedManager from '../management/shared-manager';

function showHelp(): void {
  console.log('');
  console.log(header('Per-Profile Skills Management'));
  console.log('');
  console.log('Usage:');
  console.log('  ccs skills <profile> <command> [args...]');
  console.log('');
  console.log('Commands:');
  console.log('  isolate            Enable per-profile skills for this profile');
  console.log('  share              Restore shared skills mode');
  console.log('  add <package>      Add a skill to this profile');
  console.log('  remove [skill]     Remove a skill from this profile');
  console.log('  list               List skills for this profile');
  console.log('  find [query]       Search for available skills');
  console.log('  sync               Sync shared skills into isolated profile');
  console.log('');
  console.log('Examples:');
  console.log('  ccs skills personal isolate');
  console.log('  ccs skills personal add vercel-labs/agent-skills');
  console.log('  ccs skills personal list');
  console.log('  ccs skills personal share');
  console.log('');
}

function runNpxSkills(npxArgs: string[], instancePath: string): Promise<number> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      CLAUDE_CONFIG_DIR: instancePath,
    };

    const child = spawn('npx', ['skills', ...npxArgs], {
      env,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.log(fail(`Failed to run npx skills: ${err.message}`));
      resolve(1);
    });
  });
}

export async function handleSkillsCommand(args: string[]): Promise<void> {
  await initUI();

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  const profileName = args[0];
  const subcommand = args[1];
  const subArgs = args.slice(2);

  // Validate profile exists as an account
  const config = loadOrCreateUnifiedConfig();
  const account = config.accounts[profileName];

  if (!account) {
    console.log(fail(`Profile "${profileName}" is not an account profile.`));
    console.log(info('Skills isolation is only available for account profiles.'));
    console.log(info(`Available accounts: ${Object.keys(config.accounts).join(', ') || '(none)'}`));
    process.exit(1);
  }

  const instanceMgr = new InstanceManager();
  const sharedManager = new SharedManager();

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    showHelp();
    process.exit(0);
  }

  switch (subcommand) {
    case 'isolate': {
      mutateUnifiedConfig((cfg) => {
        if (cfg.accounts[profileName]) {
          cfg.accounts[profileName].skills_mode = 'isolated';
        }
      });

      const policy = resolveAccountContextPolicy({
        ...account,
        skills_mode: 'isolated',
      });
      const instancePath = instanceMgr.getInstancePath(profileName);

      if (!fs.existsSync(instancePath)) {
        await instanceMgr.ensureInstance(profileName, policy);
      } else {
        await sharedManager.syncSkills(instancePath, policy);
      }

      console.log(ok(`Skills isolation enabled for "${profileName}".`));
      console.log(
        info(
          'Shared skills have been symlinked. Use "ccs skills <profile> add" to add profile-specific skills.'
        )
      );
      break;
    }

    case 'share': {
      mutateUnifiedConfig((cfg) => {
        if (cfg.accounts[profileName]) {
          delete cfg.accounts[profileName].skills_mode;
        }
      });

      const policy = resolveAccountContextPolicy({
        ...account,
        skills_mode: undefined,
      });
      const instancePath = instanceMgr.getInstancePath(profileName);

      if (fs.existsSync(instancePath)) {
        await sharedManager.syncSkills(instancePath, policy);
      }

      console.log(ok(`Shared skills mode restored for "${profileName}".`));
      break;
    }

    case 'add': {
      if (subArgs.length === 0) {
        console.log(fail('Missing package name. Usage: ccs skills <profile> add <package>'));
        process.exit(1);
      }

      // Auto-isolate if not already
      if (account.skills_mode !== 'isolated') {
        console.log(info('Auto-enabling skills isolation for this profile...'));
        mutateUnifiedConfig((cfg) => {
          if (cfg.accounts[profileName]) {
            cfg.accounts[profileName].skills_mode = 'isolated';
          }
        });

        const policy = resolveAccountContextPolicy({
          ...account,
          skills_mode: 'isolated',
        });
        const instancePath = instanceMgr.getInstancePath(profileName);

        if (!fs.existsSync(instancePath)) {
          await instanceMgr.ensureInstance(profileName, policy);
        } else {
          await sharedManager.syncSkills(instancePath, policy);
        }
      }

      const instancePath = instanceMgr.getInstancePath(profileName);
      const exitCode = await runNpxSkills(
        ['add', '-g', ...subArgs, '--agent', 'claude-code'],
        instancePath
      );
      process.exit(exitCode);
      break;
    }

    case 'remove': {
      const instancePath = instanceMgr.getInstancePath(profileName);
      const exitCode = await runNpxSkills(
        ['remove', '-g', '--agent', 'claude-code', ...subArgs],
        instancePath
      );
      process.exit(exitCode);
      break;
    }

    case 'list': {
      const instancePath = instanceMgr.getInstancePath(profileName);
      const exitCode = await runNpxSkills(['ls', '-g', '--agent', 'claude-code'], instancePath);
      process.exit(exitCode);
      break;
    }

    case 'find': {
      // Search is global — not profile-specific
      const exitCode = await runNpxSkills(['find', ...subArgs], '');
      process.exit(exitCode);
      break;
    }

    case 'sync': {
      if (account.skills_mode !== 'isolated') {
        console.log(info(`Profile "${profileName}" uses shared skills. Nothing to sync.`));
        process.exit(0);
      }

      const policy = resolveAccountContextPolicy(account);
      const instancePath = instanceMgr.getInstancePath(profileName);

      if (fs.existsSync(instancePath)) {
        await sharedManager.syncSkills(instancePath, policy);
        console.log(ok(`Shared skills synced to "${profileName}".`));
      } else {
        console.log(warn(`Instance for "${profileName}" does not exist yet.`));
      }
      break;
    }

    default: {
      console.log(fail(`Unknown skills command: ${subcommand}`));
      showHelp();
      process.exit(1);
    }
  }

  process.exit(0);
}
