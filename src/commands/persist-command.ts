/**
 * Persist Command Handler
 *
 * Writes a profile's environment variables to ~/.claude/settings.json
 * for native Claude Code usage (IDEs, extensions, etc.).
 *
 * Supports all profile types: API, CLIProxy, Copilot.
 * Account-based profiles are not supported (use CLAUDE_CONFIG_DIR).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initUI, header, subheader, color, dim, ok, fail, warn, info } from '../utils/ui';
import { InteractivePrompt } from '../utils/prompt';
import ProfileDetector, {
  ProfileDetectionResult,
  loadSettingsFromFile,
  CLIPROXY_PROFILES,
} from '../auth/profile-detector';
import { getEffectiveEnvVars, CLIPROXY_DEFAULT_PORT } from '../cliproxy/config-generator';
import { generateCopilotEnv } from '../copilot/copilot-executor';
import { expandPath } from '../utils/helpers';

interface PersistCommandArgs {
  profile?: string;
  yes?: boolean;
  listBackups?: boolean;
  restore?: string | boolean;
}

interface ResolvedEnv {
  env: Record<string, string>;
  profileType: string;
  warning?: string;
}

/** Parse command line arguments */
function parseArgs(args: string[]): PersistCommandArgs {
  const result: PersistCommandArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      // Will be handled in main function
    } else if (arg === '--list-backups') {
      result.listBackups = true;
    } else if (arg === '--restore') {
      // Check if next arg is a timestamp (not a flag)
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.restore = nextArg;
        i++; // Skip next arg
      } else {
        result.restore = true; // Use latest
      }
    } else if (!arg.startsWith('-') && !result.profile) {
      result.profile = arg;
    }
  }
  return result;
}

/** Get Claude settings.json path */
function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/** Read existing Claude settings.json */
function readClaudeSettings(): Record<string, unknown> {
  const settingsPath = getClaudeSettingsPath();
  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to parse settings.json: ${(error as Error).message}`);
  }
}

/**
 * Write settings back to settings.json
 * Note: mode 0o600 only applies when creating a new file.
 * Existing file permissions are preserved (acceptable behavior).
 */
function writeClaudeSettings(settings: Record<string, unknown>): void {
  const settingsPath = getClaudeSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
}

/** Create backup of settings.json */
function createBackup(): string {
  const settingsPath = getClaudeSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    throw new Error('No settings.json to backup');
  }
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    '_' +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const backupPath = `${settingsPath}.backup.${timestamp}`;
  fs.copyFileSync(settingsPath, backupPath);
  return backupPath;
}

interface BackupFile {
  path: string;
  timestamp: string;
  date: Date;
}

/** Get all backup files sorted by date (newest first) */
function getBackupFiles(): BackupFile[] {
  const settingsPath = getClaudeSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const backupPattern = /^settings\.json\.backup\.(\d{8}_\d{6})$/;
  const files = fs
    .readdirSync(dir)
    .filter((f) => backupPattern.test(f))
    .map((f) => {
      const match = f.match(backupPattern);
      if (!match) return null;
      const timestamp = match[1];
      // Parse YYYYMMDD_HHMMSS
      const year = parseInt(timestamp.slice(0, 4));
      const month = parseInt(timestamp.slice(4, 6)) - 1;
      const day = parseInt(timestamp.slice(6, 8));
      const hour = parseInt(timestamp.slice(9, 11));
      const min = parseInt(timestamp.slice(11, 13));
      const sec = parseInt(timestamp.slice(13, 15));
      return {
        path: path.join(dir, f),
        timestamp,
        date: new Date(year, month, day, hour, min, sec),
      };
    })
    .filter((f): f is BackupFile => f !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first
  return files;
}

/** Mask API key for display (show first 4 and last 4 chars) */
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return '****';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** Resolve env vars for a profile */
async function resolveProfileEnvVars(
  profileName: string,
  profileResult: ProfileDetectionResult
): Promise<ResolvedEnv> {
  switch (profileResult.type) {
    case 'settings': {
      // API profile - load from settings file
      let env: Record<string, string> = {};
      if (profileResult.env) {
        env = profileResult.env;
      } else if (profileResult.settingsPath) {
        env = loadSettingsFromFile(expandPath(profileResult.settingsPath));
      }
      if (Object.keys(env).length === 0) {
        throw new Error(`Profile '${profileName}' has no env vars configured`);
      }
      return { env, profileType: 'API' };
    }
    case 'cliproxy': {
      // CLIProxy profile - generate env vars
      const provider =
        profileResult.provider || (profileName as (typeof CLIPROXY_PROFILES)[number]);
      const port = profileResult.port || CLIPROXY_DEFAULT_PORT;
      const env = getEffectiveEnvVars(provider, port, profileResult.settingsPath) as Record<
        string,
        string
      >;
      return {
        env,
        profileType: 'CLIProxy',
        warning: 'CLIProxy must be running for this profile to work',
      };
    }
    case 'copilot': {
      // Copilot profile - generate env vars
      if (!profileResult.copilotConfig) {
        throw new Error('Copilot configuration not found');
      }
      const env = generateCopilotEnv(profileResult.copilotConfig);
      return {
        env,
        profileType: 'Copilot',
        warning: 'copilot-api daemon must be running for this profile to work',
      };
    }
    case 'account': {
      throw new Error(
        `Account profiles use CLAUDE_CONFIG_DIR isolation, not env vars.\n` +
          `Use 'ccs ${profileName}' to run with this profile instead.`
      );
    }
    case 'default': {
      throw new Error(
        'Default profile has no env vars to persist.\n' +
          'Specify a profile name: ccs persist <profile>'
      );
    }
    default: {
      throw new Error(`Unknown profile type: ${profileResult.type}`);
    }
  }
}

/** Handle --list-backups flag */
async function handleListBackups(): Promise<void> {
  await initUI();
  const backups = getBackupFiles();
  if (backups.length === 0) {
    console.log(info('No backups found'));
    return;
  }
  console.log(header('Available Backups'));
  console.log('');
  backups.forEach((b, i) => {
    const dateStr = b.date.toLocaleString();
    const marker = i === 0 ? color(' (latest)', 'success') : '';
    console.log(`  ${color(b.timestamp, 'command')}  ${dim(dateStr)}${marker}`);
  });
  console.log('');
  console.log(dim('To restore: ccs persist --restore [timestamp]'));
}

/** Handle --restore [timestamp] flag */
async function handleRestore(timestamp: string | boolean, yes: boolean): Promise<void> {
  await initUI();
  const backups = getBackupFiles();
  if (backups.length === 0) {
    console.log(fail('No backups found'));
    process.exit(1);
  }
  // Find backup to restore
  let backup: BackupFile;
  if (timestamp === true) {
    // Use latest
    backup = backups[0];
  } else {
    const found = backups.find((b) => b.timestamp === timestamp);
    if (!found) {
      console.log(fail(`Backup not found: ${timestamp}`));
      console.log('');
      console.log('Available backups:');
      backups.slice(0, 5).forEach((b) => console.log(`  ${b.timestamp}`));
      process.exit(1);
    }
    backup = found;
  }
  console.log(header('Restore Backup'));
  console.log('');
  console.log(`Backup: ${color(backup.timestamp, 'command')}`);
  console.log(`Date:   ${backup.date.toLocaleString()}`);
  console.log('');
  console.log(warn('This will replace ~/.claude/settings.json'));
  console.log('');
  if (!yes) {
    const proceed = await InteractivePrompt.confirm('Proceed with restore?', { default: false });
    if (!proceed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }
  // Copy backup over settings.json
  fs.copyFileSync(backup.path, getClaudeSettingsPath());
  console.log(ok(`Restored from backup: ${backup.timestamp}`));
}

/** Show help for persist command */
async function showHelp(): Promise<void> {
  await initUI();
  console.log(header('CCS Persist Command'));
  console.log('');
  console.log(subheader('Usage'));
  console.log(`  ${color('ccs persist', 'command')} <profile> [options]`);
  console.log(`  ${color('ccs persist', 'command')} --list-backups`);
  console.log(`  ${color('ccs persist', 'command')} --restore [timestamp]`);
  console.log('');
  console.log(subheader('Description'));
  console.log("  Writes a profile's environment variables directly to");
  console.log('  ~/.claude/settings.json for native Claude Code usage.');
  console.log('');
  console.log('  This allows Claude Code to use the profile without CCS,');
  console.log('  enabling compatibility with IDEs and extensions.');
  console.log('');
  console.log(subheader('Options'));
  console.log(`  ${color('--yes, -y', 'command')}         Skip confirmation prompts (auto-backup)`);
  console.log(`  ${color('--help, -h', 'command')}        Show this help message`);
  console.log('');
  console.log(subheader('Backup Management'));
  console.log(`  ${color('--list-backups', 'command')}    List available backup files`);
  console.log(`  ${color('--restore', 'command')}         Restore from the most recent backup`);
  console.log(
    `  ${color('--restore <ts>', 'command')}    Restore from specific backup (e.g., 20260110_205324)`
  );
  console.log('');
  console.log(subheader('Supported Profile Types'));
  console.log(`  ${color('API profiles', 'command')}      glm, glmt, kimi, custom API profiles`);
  console.log(`  ${color('CLIProxy', 'command')}          gemini, codex, agy, qwen, kiro, ghcp`);
  console.log(`  ${color('Copilot', 'command')}           copilot (requires copilot-api daemon)`);
  console.log(`  ${dim('Account-based')}     Not supported (uses CLAUDE_CONFIG_DIR)`);
  console.log('');
  console.log(subheader('Examples'));
  console.log(`  ${dim('# Persist GLM profile')}`);
  console.log(`  ${color('ccs persist glm', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with auto-confirmation')}`);
  console.log(`  ${color('ccs persist gemini --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# List all backups')}`);
  console.log(`  ${color('ccs persist --list-backups', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Restore latest backup')}`);
  console.log(`  ${color('ccs persist --restore', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Restore specific backup')}`);
  console.log(`  ${color('ccs persist --restore 20260110_205324', 'command')}`);
  console.log('');
  console.log(subheader('Notes'));
  console.log('  [i] CLIProxy profiles require the proxy to be running.');
  console.log('  [i] Copilot profiles require copilot-api daemon.');
  console.log('  [i] Backups are saved as ~/.claude/settings.json.backup.YYYYMMDD_HHMMSS');
  console.log('');
}

/** Main persist command handler */
export async function handlePersistCommand(args: string[]): Promise<void> {
  // Check for help first
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    await showHelp();
    return;
  }
  const parsedArgs = parseArgs(args);
  // Handle --list-backups
  if (parsedArgs.listBackups) {
    await handleListBackups();
    return;
  }
  // Handle --restore
  if (parsedArgs.restore) {
    await handleRestore(parsedArgs.restore, parsedArgs.yes ?? false);
    return;
  }
  await initUI();
  if (!parsedArgs.profile) {
    console.log(fail('Profile name is required'));
    console.log('');
    console.log('Usage:');
    console.log(`  ${color('ccs persist <profile>', 'command')}`);
    console.log('');
    console.log('Run for help:');
    console.log(`  ${color('ccs persist --help', 'command')}`);
    process.exit(1);
  }
  // Detect profile
  const detector = new ProfileDetector();
  let profileResult: ProfileDetectionResult;
  try {
    profileResult = detector.detectProfileType(parsedArgs.profile);
  } catch (error) {
    const err = error as Error & { availableProfiles?: string };
    console.log(fail(`Profile not found: ${parsedArgs.profile}`));
    console.log('');
    if (err.availableProfiles) {
      console.log(err.availableProfiles);
    }
    process.exit(1);
  }
  // Resolve env vars
  let resolved: ResolvedEnv;
  try {
    resolved = await resolveProfileEnvVars(parsedArgs.profile, profileResult);
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }
  // Display what will be written
  console.log(header(`Persist Profile: ${parsedArgs.profile}`));
  console.log('');
  console.log(`Profile type: ${color(resolved.profileType, 'command')}`);
  console.log('');
  console.log('The following env vars will be written to ~/.claude/settings.json:');
  console.log('');
  // Display env vars (mask sensitive values)
  const envKeys = Object.keys(resolved.env);
  if (envKeys.length === 0) {
    console.log(fail('Profile has no environment variables to persist'));
    process.exit(1);
  }
  const maxKeyLen = Math.max(...envKeys.map((k) => k.length));
  for (const [key, value] of Object.entries(resolved.env)) {
    const paddedKey = key.padEnd(maxKeyLen + 2);
    const displayValue =
      key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')
        ? maskApiKey(value)
        : value;
    console.log(`  ${color(paddedKey, 'command')} = ${displayValue}`);
  }
  console.log('');
  // Show warning if applicable
  if (resolved.warning) {
    console.log(warn(resolved.warning));
    console.log('');
  }
  // Warning about modification
  console.log(warn('This will modify ~/.claude/settings.json'));
  console.log(dim('    Existing hooks and other settings will be preserved.'));
  console.log('');
  // Check if settings.json exists for backup
  const settingsPath = getClaudeSettingsPath();
  const settingsExist = fs.existsSync(settingsPath);
  // Backup prompt (unless --yes)
  if (settingsExist) {
    let createBackupFlag: boolean = parsedArgs.yes === true; // Auto-backup with --yes
    if (!parsedArgs.yes) {
      createBackupFlag = await InteractivePrompt.confirm('Create backup before modifying?', {
        default: true,
      });
    }
    if (createBackupFlag) {
      try {
        const backupPath = createBackup();
        console.log(ok(`Backup created: ${backupPath.replace(os.homedir(), '~')}`));
        console.log('');
      } catch (error) {
        console.log(fail(`Failed to create backup: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  }
  // Proceed confirmation (unless --yes)
  if (!parsedArgs.yes) {
    const proceed = await InteractivePrompt.confirm('Proceed with persist?', { default: true });
    if (!proceed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }
  // Read existing settings and merge
  const existingSettings = readClaudeSettings();
  const existingEnv = (existingSettings.env as Record<string, string>) || {};
  const mergedSettings = {
    ...existingSettings,
    env: {
      ...existingEnv,
      ...resolved.env,
    },
  };
  // Write merged settings
  try {
    writeClaudeSettings(mergedSettings);
  } catch (error) {
    console.log(fail(`Failed to write settings: ${(error as Error).message}`));
    process.exit(1);
  }
  console.log('');
  console.log(ok(`Profile '${parsedArgs.profile}' written to ~/.claude/settings.json`));
  console.log('');
  console.log(info('Claude Code will now use this profile by default.'));
  console.log(dim('    To revert, restore the backup or edit settings.json manually.'));
  console.log('');
}
