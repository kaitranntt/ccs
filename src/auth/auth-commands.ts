/**
 * Auth Commands (Facade)
 *
 * CLI interface for CCS multi-account management.
 * Commands: create, list, show, remove, default, reset-default
 *
 * Login-per-profile model: Each profile is an isolated Claude instance.
 * Users login directly in each instance (no credential copying).
 *
 * Implementation Note: This is a facade that delegates to modular command handlers.
 * See ./commands/ for individual command implementations.
 */

import ProfileRegistry from './profile-registry';
import { InstanceManager } from '../management/instance-manager';
import { initUI, header, subheader, color, dim, warn, fail } from '../utils/ui';
import { MAX_CONTEXT_GROUP_LENGTH } from './account-context';
import packageJson from '../../package.json';

// Import command handlers from modular structure
import {
  type CommandContext,
  handleCreate,
  handleBackup,
  handleList,
  handleShow,
  handleRemove,
  handleDefault,
  handleResetDefault,
} from './commands';

/**
 * Auth Commands Class (Facade)
 *
 * Maintains class API for backward compatibility while delegating
 * to modular command handlers.
 */
class AuthCommands {
  private registry: ProfileRegistry;
  private instanceMgr: InstanceManager;
  private readonly version: string = packageJson.version;

  constructor() {
    this.registry = new ProfileRegistry();
    this.instanceMgr = new InstanceManager();
  }

  /**
   * Get command context for handlers
   */
  private getContext(): CommandContext {
    return {
      registry: this.registry,
      instanceMgr: this.instanceMgr,
      version: this.version,
    };
  }

  /**
   * Show help for auth commands
   */
  async showHelp(): Promise<void> {
    await initUI();

    console.log(header('CCS Concurrent Account Management'));
    console.log('');
    console.log(subheader('Usage'));
    console.log(`  ${color('ccs auth', 'command')} <command> [options]`);
    console.log('');
    console.log(subheader('Commands'));
    console.log(`  ${color('create <profile>', 'command')}        Create new profile and login`);
    console.log(
      `  ${color('backup <profile>', 'command')}        Backup local continuity for an account`
    );
    console.log(`  ${color('list', 'command')}                   List all saved profiles`);
    console.log(`  ${color('show <profile>', 'command')}         Show profile details`);
    console.log(`  ${color('remove <profile>', 'command')}       Remove saved profile`);
    console.log(`  ${color('default <profile>', 'command')}      Set default profile`);
    console.log(
      `  ${color('reset-default', 'command')}          Clear default (restore original CCS)`
    );
    console.log('');
    console.log(subheader('Examples'));
    console.log(`  ${dim('# Create two isolated accounts and choose one explicitly at runtime')}`);
    console.log(`  ${color('ccs auth create work', 'command')}`);
    console.log(`  ${color('ccs auth create personal', 'command')}`);
    console.log(`  ${color('ccs work "review code"', 'command')}`);
    console.log(`  ${color('ccs personal "write tests"', 'command')}`);
    console.log('');
    console.log(
      `  ${dim('# Optional: share local project history while credentials stay isolated')}`
    );
    console.log(`  ${color('ccs auth create work2 --share-context', 'command')}`);
    console.log('');
    console.log(`  ${dim('# Share context only within a specific group')}`);
    console.log(
      `  ${color('ccs auth create backup --share-context --context-group sprint-a', 'command')}`
    );
    console.log('');
    console.log(`  ${dim('# Advanced: deeper shared continuity for session history artifacts')}`);
    console.log(
      `  ${color('ccs auth create backup --share-context --context-group sprint-a --deeper-continuity', 'command')}`
    );
    console.log('');
    console.log(`  ${dim('# Create clean profile without shared commands/skills/agents')}`);
    console.log(`  ${color('ccs auth create sandbox --bare', 'command')}`);
    console.log('');
    console.log(`  ${dim('# Set work as default')}`);
    console.log(`  ${color('ccs auth default work', 'command')}`);
    console.log('');
    console.log(`  ${dim('# Backup the local continuity lane for an account or plain ccs')}`);
    console.log(`  ${color('ccs auth backup work', 'command')}`);
    console.log(
      `  ${color('ccs auth backup default', 'command')}  ${dim('# backup plain ccs lane')}`
    );
    console.log('');
    console.log(`  ${dim('# Restore original CCS behavior')}`);
    console.log(`  ${color('ccs auth reset-default', 'command')}`);
    console.log('');
    console.log(`  ${dim('# List all profiles')}`);
    console.log(`  ${color('ccs auth list', 'command')}`);
    console.log('');
    console.log(subheader('Options'));
    console.log(
      `  ${color('--force', 'command')}                   Allow overwriting existing profile (create)`
    );
    console.log(
      `  ${color('--share-context', 'command')}           Share project workspace context across accounts`
    );
    console.log(
      `  ${color('--context-group <name>', 'command')}    Share context only within a named group`
    );
    console.log(
      `  ${color('--deeper-continuity', 'command')}       Advanced shared mode: sync additional continuity artifacts`
    );
    console.log(
      `  ${color('--bare', 'command')}                    Create clean profile without shared symlinks (no CK/commands/skills)`
    );
    console.log(
      `  ${color('--yes, -y', 'command')}                 Skip confirmation prompts (remove)`
    );
    console.log(
      `  ${color('--json', 'command')}                    Output in JSON format (list, show)`
    );
    console.log(
      `  ${color('--verbose', 'command')}                 Show additional details (list)`
    );
    console.log('');
    console.log(subheader('Note'));
    console.log(
      `  By default, ${color('ccs', 'command')} uses Claude CLI defaults from ~/.claude/`
    );
    console.log(
      `  Recommended two-account route: create ${color('work', 'command')} and ${color('personal', 'command')}, then run the profile you want.`
    );
    console.log(
      `  Use ${color('ccs auth default <profile>', 'command')} to change the default profile.`
    );
    console.log(`  Account logins, tokens, and .anthropic stay isolated for every profile.`);
    console.log(
      `  Non-bare account profiles share basic ${color('settings.json', 'path')} with ${color('~/.claude/settings.json', 'path')}; ${color('ccs auth show <profile>', 'command')} shows the link state.`
    );
    console.log(
      `  History sync is opt-in: both accounts need shared mode and the same ${color('context_group', 'path')}.`
    );
    console.log(
      `  ${color('--deeper-continuity', 'command')} requires shared mode and syncs session-env/file-history/todos/shell-snapshots.`
    );
    console.log(
      `  To make future plain ${color('ccs', 'command')} resume with an account, set ${color('ccs auth default <profile>', 'command')}; back up the current native lane first with ${color('ccs auth backup default', 'command')}.`
    );
    console.log(
      `  Existing profiles: open ${color('ccs config', 'command')} -> Accounts -> Edit Context.`
    );
    console.log(`  Shared context groups are normalized (trim + lowercase) and spaces become "-".`);
    console.log(
      `  ${color('context_group', 'path')} must be non-empty and <= ${MAX_CONTEXT_GROUP_LENGTH} chars in shared mode.`
    );
    console.log('');
  }

  /**
   * Create new profile - delegates to create-command.ts
   */
  async handleCreate(args: string[]): Promise<void> {
    return handleCreate(this.getContext(), args);
  }

  async handleBackup(args: string[]): Promise<void> {
    return handleBackup(this.getContext(), args);
  }

  /**
   * List all profiles - delegates to list-command.ts
   */
  async handleList(args: string[]): Promise<void> {
    return handleList(this.getContext(), args);
  }

  /**
   * Show profile details - delegates to show-command.ts
   */
  async handleShow(args: string[]): Promise<void> {
    return handleShow(this.getContext(), args);
  }

  /**
   * Remove profile - delegates to remove-command.ts
   */
  async handleRemove(args: string[]): Promise<void> {
    return handleRemove(this.getContext(), args);
  }

  /**
   * Set default profile - delegates to default-command.ts
   */
  async handleDefault(args: string[]): Promise<void> {
    return handleDefault(this.getContext(), args);
  }

  /**
   * Reset default profile - delegates to default-command.ts
   */
  async handleResetDefault(): Promise<void> {
    return handleResetDefault(this.getContext());
  }

  /**
   * Route auth command to appropriate handler
   */
  async route(args: string[]): Promise<void> {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
      await this.showHelp();
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
        await initUI();
        console.log(warn('Command "save" is deprecated'));
        console.log(`    Use: ${color('ccs auth create <profile>', 'command')} instead`);
        console.log('');
        await this.handleCreate(commandArgs);
        break;

      case 'list':
        await this.handleList(commandArgs);
        break;

      case 'backup':
        await this.handleBackup(commandArgs);
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

      case 'reset-default':
        await this.handleResetDefault();
        break;

      case 'current':
        await initUI();
        console.log(warn('Command "current" has been removed'));
        console.log('');
        console.log('Each profile has its own login in an isolated instance.');
        console.log(`Use ${color('ccs auth list', 'command')} to see all profiles.`);
        console.log('');
        break;

      case 'cleanup':
        await initUI();
        console.log(warn('Command "cleanup" has been removed'));
        console.log('');
        console.log('No cleanup needed - no separate vault files.');
        console.log(`Use ${color('ccs auth list', 'command')} to see all profiles.`);
        console.log('');
        break;

      default:
        await initUI();
        console.log(fail(`Unknown command: ${command}`));
        console.log('');
        console.log('Run for help:');
        console.log(`  ${color('ccs auth --help', 'command')}`);
        process.exit(1);
    }
  }
}

export default AuthCommands;
