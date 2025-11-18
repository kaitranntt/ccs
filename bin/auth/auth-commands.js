'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ProfileRegistry = require('./profile-registry');
const InstanceManager = require('../management/instance-manager');
const { colored } = require('../utils/helpers');
const { detectClaudeCli } = require('../utils/claude-detector');
const { InteractivePrompt } = require('../utils/prompt');
const CCS_VERSION = require('../../package.json').version;

/**
 * Auth Commands (Simplified)
 *
 * CLI interface for CCS multi-account management.
 * Commands: create, list, show, remove, default
 *
 * Login-per-profile model: Each profile is an isolated Claude instance.
 * Users login directly in each instance (no credential copying).
 */
class AuthCommands {
  constructor() {
    this.registry = new ProfileRegistry();
    this.instanceMgr = new InstanceManager();
  }

  /**
   * Show help for auth commands
   */
  showHelp() {
    console.log(colored('CCS Concurrent Account Management', 'bold'));
    console.log('');
    console.log(colored('Usage:', 'cyan'));
    console.log(`  ${colored('ccs auth', 'yellow')} <command> [options]`);
    console.log('');
    console.log(colored('Commands:', 'cyan'));
    console.log(`  ${colored('create <profile>', 'yellow')}        Create new profile and login`);
    console.log(`  ${colored('list', 'yellow')}                   List all saved profiles`);
    console.log(`  ${colored('show <profile>', 'yellow')}         Show profile details`);
    console.log(`  ${colored('remove <profile>', 'yellow')}       Remove saved profile`);
    console.log(`  ${colored('default <profile>', 'yellow')}      Set default profile`);
    console.log('');
    console.log(colored('Examples:', 'cyan'));
    console.log(`  ${colored('ccs auth create work', 'yellow')}                     # Create & login to work profile`);
    console.log(`  ${colored('ccs auth default work', 'yellow')}                    # Set work as default`);
    console.log(`  ${colored('ccs auth list', 'yellow')}                            # List all profiles`);
    console.log(`  ${colored('ccs work "review code"', 'yellow')}                   # Use work profile`);
    console.log(`  ${colored('ccs "review code"', 'yellow')}                        # Use default profile`);
    console.log('');
    console.log(colored('Options:', 'cyan'));
    console.log(`  ${colored('--force', 'yellow')}                   Allow overwriting existing profile (create)`);
    console.log(`  ${colored('--yes, -y', 'yellow')}                 Skip confirmation prompts (remove)`);
    console.log(`  ${colored('--json', 'yellow')}                    Output in JSON format (list, show)`);
    console.log(`  ${colored('--verbose', 'yellow')}                 Show additional details (list)`);
    console.log('');
    console.log(colored('Note:', 'cyan'));
    console.log(`  By default, ${colored('ccs', 'yellow')} uses Claude CLI defaults from ~/.claude/`);
    console.log(`  Use ${colored('ccs auth default <profile>', 'yellow')} to change the default profile.`);
    console.log('');
  }

  /**
   * Create new profile and prompt for login
   * @param {Array} args - Command arguments
   */
  async handleCreate(args) {
    const profileName = args.find(arg => !arg.startsWith('--'));
    const force = args.includes('--force');

    if (!profileName) {
      console.error('[X] Profile name is required');
      console.log('');
      console.log(`Usage: ${colored('ccs auth create <profile> [--force]', 'yellow')}`);
      console.log('');
      console.log('Example:');
      console.log(`  ${colored('ccs auth create work', 'yellow')}`);
      process.exit(1);
    }

    // Check if profile already exists
    if (!force && this.registry.hasProfile(profileName)) {
      console.error(`[X] Profile already exists: ${profileName}`);
      console.log(`    Use ${colored('--force', 'yellow')} to overwrite`);
      process.exit(1);
    }

    try {
      // Create instance directory
      console.log(`[i] Creating profile: ${profileName}`);
      const instancePath = this.instanceMgr.ensureInstance(profileName);

      // Create/update profile entry
      if (this.registry.hasProfile(profileName)) {
        this.registry.updateProfile(profileName, {
          type: 'account'
        });
      } else {
        this.registry.createProfile(profileName, {
          type: 'account'
        });
      }

      console.log(`[i] Instance directory: ${instancePath}`);
      console.log('');
      console.log(colored('[i] Starting Claude in isolated instance...', 'yellow'));
      console.log(colored('[i] You will be prompted to login with your account.', 'yellow'));
      console.log('');

      // Detect Claude CLI
      const claudeCli = detectClaudeCli();
      if (!claudeCli) {
        console.error('[X] Claude CLI not found');
        console.log('');
        console.log('Please install Claude CLI first:');
        console.log('  https://claude.ai/download');
        process.exit(1);
      }

      // Execute Claude in isolated instance (will auto-prompt for login if no credentials)
      const child = spawn(claudeCli, [], {
        stdio: 'inherit',
        env: { ...process.env, CLAUDE_CONFIG_DIR: instancePath }
      });

      child.on('exit', (code) => {
        if (code === 0) {
          console.log('');
          console.log(colored('[OK] Profile created successfully', 'green'));
          console.log('');
          console.log(`  Profile: ${profileName}`);
          console.log(`  Instance: ${instancePath}`);
          console.log('');
          console.log('Usage:');
          console.log(`  ${colored(`ccs ${profileName} "your prompt here"`, 'yellow')}        # Use this specific profile`);
          console.log('');
          console.log('To set as default (so you can use just "ccs"):');
          console.log(`  ${colored(`ccs auth default ${profileName}`, 'yellow')}`);
          console.log('');
          process.exit(0);
        } else {
          console.log('');
          console.error('[X] Login failed or cancelled');
          console.log('');
          console.log('To retry:');
          console.log(`  ${colored(`ccs auth create ${profileName} --force`, 'yellow')}`);
          console.log('');
          process.exit(1);
        }
      });

      child.on('error', (err) => {
        console.error(`[X] Failed to execute Claude CLI: ${err.message}`);
        process.exit(1);
      });

    } catch (error) {
      console.error(`[X] Failed to create profile: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * List all saved profiles
   * @param {Array} args - Command arguments
   */
  async handleList(args) {
    const verbose = args.includes('--verbose');
    const json = args.includes('--json');

    try {
      const profiles = this.registry.getAllProfiles();
      const defaultProfile = this.registry.getDefaultProfile();
      const profileNames = Object.keys(profiles);

      // JSON output mode
      if (json) {
        const output = {
          version: CCS_VERSION,
          profiles: profileNames.map(name => {
            const profile = profiles[name];
            const isDefault = name === defaultProfile;
            const instancePath = this.instanceMgr.getInstancePath(name);

            return {
              name: name,
              type: profile.type || 'account',
              is_default: isDefault,
              created: profile.created,
              last_used: profile.last_used || null,
              instance_path: instancePath
            };
          })
        };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      // Human-readable output
      if (profileNames.length === 0) {
        console.log(colored('No account profiles found', 'yellow'));
        console.log('');
        console.log('To create your first profile:');
        console.log(`  ${colored('ccs auth create <profile>', 'yellow')}  # Create and login to profile`);
        console.log('');
        console.log('Example:');
        console.log(`  ${colored('ccs auth create work', 'yellow')}`);
        console.log('');
        return;
      }

      console.log(colored('Saved Account Profiles:', 'bold'));
      console.log('');

      // Sort by last_used (descending), then alphabetically
      const sorted = profileNames.sort((a, b) => {
        const aProfile = profiles[a];
        const bProfile = profiles[b];

        // Default first
        if (a === defaultProfile) return -1;
        if (b === defaultProfile) return 1;

        // Then by last_used
        if (aProfile.last_used && bProfile.last_used) {
          return new Date(bProfile.last_used) - new Date(aProfile.last_used);
        }
        if (aProfile.last_used) return -1;
        if (bProfile.last_used) return 1;

        // Then alphabetically
        return a.localeCompare(b);
      });

      sorted.forEach(name => {
        const profile = profiles[name];
        const isDefault = name === defaultProfile;
        const indicator = isDefault ? colored('[*]', 'green') : '[ ]';

        console.log(`${indicator} ${colored(name, 'cyan')}${isDefault ? colored(' (default)', 'green') : ''}`);

        console.log(`    Type: ${profile.type || 'account'}`);

        if (verbose) {
          console.log(`    Created: ${new Date(profile.created).toLocaleString()}`);
          if (profile.last_used) {
            console.log(`    Last used: ${new Date(profile.last_used).toLocaleString()}`);
          }
        }

        console.log('');
      });

      console.log(`Total profiles: ${profileNames.length}`);
      console.log('');

    } catch (error) {
      console.error(`[X] Failed to list profiles: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Show details for a specific profile
   * @param {Array} args - Command arguments
   */
  async handleShow(args) {
    const profileName = args.find(arg => !arg.startsWith('--'));
    const json = args.includes('--json');

    if (!profileName) {
      console.error('[X] Profile name is required');
      console.log('');
      console.log(`Usage: ${colored('ccs auth show <profile> [--json]', 'yellow')}`);
      process.exit(1);
    }

    try {
      const profile = this.registry.getProfile(profileName);
      const defaultProfile = this.registry.getDefaultProfile();
      const isDefault = profileName === defaultProfile;
      const instancePath = this.instanceMgr.getInstancePath(profileName);

      // Count sessions
      let sessionCount = 0;
      try {
        const sessionsDir = path.join(instancePath, 'session-env');
        if (fs.existsSync(sessionsDir)) {
          const files = fs.readdirSync(sessionsDir);
          sessionCount = files.filter(f => f.endsWith('.json')).length;
        }
      } catch (e) {
        // Ignore errors counting sessions
      }

      // JSON output mode
      if (json) {
        const output = {
          name: profileName,
          type: profile.type || 'account',
          is_default: isDefault,
          created: profile.created,
          last_used: profile.last_used || null,
          instance_path: instancePath,
          session_count: sessionCount
        };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      // Human-readable output
      console.log(colored(`Profile: ${profileName}`, 'bold'));
      console.log('');
      console.log(`  Type: ${profile.type || 'account'}`);
      console.log(`  Default: ${isDefault ? 'Yes' : 'No'}`);
      console.log(`  Instance: ${instancePath}`);
      console.log(`  Created: ${new Date(profile.created).toLocaleString()}`);

      if (profile.last_used) {
        console.log(`  Last used: ${new Date(profile.last_used).toLocaleString()}`);
      } else {
        console.log(`  Last used: Never`);
      }

      console.log('');

    } catch (error) {
      console.error(`[X] ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Remove a saved profile
   * @param {Array} args - Command arguments
   */
  async handleRemove(args) {
    const profileName = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));

    if (!profileName) {
      console.error('[X] Profile name is required');
      console.log('');
      console.log(`Usage: ${colored('ccs auth remove <profile> [--yes]', 'yellow')}`);
      process.exit(1);
    }

    if (!this.registry.hasProfile(profileName)) {
      console.error(`[X] Profile not found: ${profileName}`);
      process.exit(1);
    }

    try {
      // Get instance path and session count for impact display
      const instancePath = this.instanceMgr.getInstancePath(profileName);
      let sessionCount = 0;

      try {
        const sessionsDir = path.join(instancePath, 'session-env');
        if (fs.existsSync(sessionsDir)) {
          const files = fs.readdirSync(sessionsDir);
          sessionCount = files.filter(f => f.endsWith('.json')).length;
        }
      } catch (e) {
        // Ignore errors counting sessions
      }

      // Display impact
      console.log('');
      console.log(`Profile '${colored(profileName, 'cyan')}' will be permanently deleted.`);
      console.log(`  Instance path: ${instancePath}`);
      console.log(`  Sessions: ${sessionCount} conversation${sessionCount !== 1 ? 's' : ''}`);
      console.log('');

      // Interactive confirmation (or --yes flag)
      const confirmed = await InteractivePrompt.confirm(
        'Delete this profile?',
        { default: false } // Default to NO (safe)
      );

      if (!confirmed) {
        console.log('[i] Cancelled');
        process.exit(0);
      }

      // Delete instance
      this.instanceMgr.deleteInstance(profileName);

      // Delete profile
      this.registry.deleteProfile(profileName);

      console.log(colored('[OK] Profile removed successfully', 'green'));
      console.log(`    Profile: ${profileName}`);
      console.log('');

    } catch (error) {
      console.error(`[X] Failed to remove profile: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Set default profile
   * @param {Array} args - Command arguments
   */
  async handleDefault(args) {
    const profileName = args.find(arg => !arg.startsWith('--'));

    if (!profileName) {
      console.error('[X] Profile name is required');
      console.log('');
      console.log(`Usage: ${colored('ccs auth default <profile>', 'yellow')}`);
      process.exit(1);
    }

    try {
      this.registry.setDefaultProfile(profileName);

      console.log(colored('[OK] Default profile set', 'green'));
      console.log(`    Profile: ${profileName}`);
      console.log('');
      console.log('Now you can use:');
      console.log(`  ${colored('ccs "your prompt"', 'yellow')}  # Uses ${profileName} profile`);
      console.log('');

    } catch (error) {
      console.error(`[X] ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Route auth command to appropriate handler
   * @param {Array} args - Command arguments
   */
  async route(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
      this.showHelp();
      return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    switch (command) {
      case 'create':
        await this.handleCreate(commandArgs);
        break;

      case 'save':
        // Deprecated - redirect to create
        console.log(colored('[!] Command "save" is deprecated', 'yellow'));
        console.log(`    Use: ${colored('ccs auth create <profile>', 'yellow')} instead`);
        console.log('');
        await this.handleCreate(commandArgs);
        break;

      case 'list':
        await this.handleList(commandArgs);
        break;

      case 'show':
        await this.handleShow(commandArgs);
        break;

      case 'remove':
        await this.handleRemove(commandArgs);
        break;

      case 'default':
        await this.handleDefault(commandArgs);
        break;

      case 'current':
        console.log(colored('[!] Command "current" has been removed', 'yellow'));
        console.log('');
        console.log('Each profile has its own login in an isolated instance.');
        console.log('Use "ccs auth list" to see all profiles.');
        console.log('');
        break;

      case 'cleanup':
        console.log(colored('[!] Command "cleanup" has been removed', 'yellow'));
        console.log('');
        console.log('No cleanup needed - no separate vault files.');
        console.log('Use "ccs auth list" to see all profiles.');
        console.log('');
        break;

      default:
        console.error(`[X] Unknown command: ${command}`);
        console.log('');
        console.log('Run for help:');
        console.log(`  ${colored('ccs auth --help', 'yellow')}`);
        process.exit(1);
    }
  }
}

module.exports = AuthCommands;
