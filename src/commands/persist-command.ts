/**
 * Persist Command Handler
 *
 * Writes a profile's Claude setup to ~/.claude/settings.json
 * for native Claude Code usage across the CLI and IDE extension.
 *
 * Supports API, CLIProxy, Copilot, account, and default flows
 * through the shared Claude extension setup resolver.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as lockfile from 'proper-lockfile';
import { initUI, header, subheader, color, dim, ok, fail, warn, info } from '../utils/ui';
import { InteractivePrompt } from '../utils/prompt';
import ProfileDetector from '../auth/profile-detector';
import { getClaudeConfigDir, getClaudeSettingsPath } from '../utils/claude-config-path';
import { extractOption, hasAnyFlag } from './arg-extractor';
import { resolveClaudeExtensionSetup } from '../shared/claude-extension-setup';

interface PersistCommandArgs {
  profile?: string;
  yes?: boolean;
  listBackups?: boolean;
  restore?: string | boolean;
  permissionMode?: PermissionMode;
  dangerouslySkipPermissions?: boolean;
  parseError?: string;
}

interface ResolvedEnv {
  env: Record<string, string>;
  clearEnvKeys: string[];
  profileType: string;
  warnings?: string[];
  notes?: string[];
}

const PERSIST_KNOWN_FLAGS = [
  '--yes',
  '-y',
  '--list-backups',
  '--restore',
  '--permission-mode',
  '--dangerously-skip-permissions',
  '--auto-approve',
  '--help',
  '-h',
] as const;

const VALID_PERMISSION_MODES = ['default', 'plan', 'acceptEdits', 'bypassPermissions'] as const;
const PERSIST_LOCK_STALE_MS = 10000;
const PERSIST_LOCK_RETRIES = 5;
const PERSIST_LOCK_RETRY_MIN_MS = 100;
const PERSIST_LOCK_RETRY_MAX_MS = 500;

type PermissionMode = (typeof VALID_PERMISSION_MODES)[number];

function isPermissionMode(value: string): value is PermissionMode {
  return VALID_PERMISSION_MODES.includes(value as PermissionMode);
}

function isKnownPersistFlagToken(token: string): boolean {
  return PERSIST_KNOWN_FLAGS.some((flag) => token === flag || token.startsWith(`${flag}=`));
}

function resolvePermissionMode(parsedArgs: PersistCommandArgs): PermissionMode | undefined {
  if (!parsedArgs.dangerouslySkipPermissions) {
    return parsedArgs.permissionMode;
  }

  if (parsedArgs.permissionMode && parsedArgs.permissionMode !== 'bypassPermissions') {
    throw new Error(
      '--dangerously-skip-permissions conflicts with --permission-mode. Use bypassPermissions or remove one flag.'
    );
  }

  return 'bypassPermissions';
}

/** Parse command line arguments */
function parseArgs(args: string[]): PersistCommandArgs {
  const result: PersistCommandArgs = {
    yes: hasAnyFlag(args, ['--yes', '-y']),
    listBackups: hasAnyFlag(args, ['--list-backups']),
  };

  const restoreOption = extractOption(args, ['--restore']);
  if (restoreOption.found) {
    result.restore = restoreOption.missingValue ? true : restoreOption.value || true;
  }

  const permissionModeOption = extractOption(restoreOption.remainingArgs, ['--permission-mode'], {
    knownFlags: PERSIST_KNOWN_FLAGS,
  });
  if (permissionModeOption.found) {
    if (permissionModeOption.missingValue) {
      result.parseError = 'Missing value for --permission-mode';
    } else if (permissionModeOption.value) {
      if (!isPermissionMode(permissionModeOption.value)) {
        result.parseError = `Invalid --permission-mode "${permissionModeOption.value}". Valid modes: ${VALID_PERMISSION_MODES.join(', ')}`;
      } else {
        result.permissionMode = permissionModeOption.value;
      }
    }
  }

  result.dangerouslySkipPermissions = hasAnyFlag(permissionModeOption.remainingArgs, [
    '--dangerously-skip-permissions',
    '--auto-approve',
  ]);

  const unknownFlags = permissionModeOption.remainingArgs.filter(
    (arg) => arg.startsWith('-') && !isKnownPersistFlagToken(arg)
  );
  if (!result.parseError && unknownFlags.length > 0) {
    const unknownList = unknownFlags.map((flag) => `"${flag}"`).join(', ');
    result.parseError = `Unknown option(s): ${unknownList}. Run 'ccs persist --help' for usage.`;
  }

  if (!result.parseError && result.listBackups && result.restore) {
    result.parseError = '--list-backups cannot be used with --restore';
  }

  if (
    !result.parseError &&
    (result.listBackups || result.restore) &&
    (result.permissionMode || result.dangerouslySkipPermissions)
  ) {
    result.parseError =
      'Permission flags are not valid with backup operations. Use them only with ccs persist <profile>.';
  }

  for (const arg of permissionModeOption.remainingArgs) {
    if (!arg.startsWith('-')) {
      result.profile = arg;
      break;
    }
  }
  return result;
}

function formatDisplayPath(filePath: string): string {
  const defaultClaudeDir = path.join(os.homedir(), '.claude');
  const claudeDir = getClaudeConfigDir();

  // Keep real path when user overrides Claude directory.
  if (path.resolve(claudeDir) !== path.resolve(defaultClaudeDir)) {
    return filePath;
  }

  if (filePath === claudeDir) {
    return '~/.claude';
  }

  const claudePrefix = `${claudeDir}${path.sep}`;
  if (filePath.startsWith(claudePrefix)) {
    return filePath.replace(claudePrefix, '~/.claude/');
  }

  return filePath;
}

function getClaudeSettingsDisplayPath(): string {
  return formatDisplayPath(getClaudeSettingsPath());
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isSymlinkAsync(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

function getNoFollowFlag(): number {
  const candidate = (fs.constants as Record<string, number>)['O_NOFOLLOW'];
  if (process.platform !== 'win32' && typeof candidate === 'number') {
    return candidate;
  }
  return 0;
}

function createSymlinkReadError(filePath: string): NodeJS.ErrnoException {
  const error = new Error(
    `Refusing to read symlinked file for security: ${formatDisplayPath(filePath)}`
  ) as NodeJS.ErrnoException;
  error.code = 'ELOOP';
  return error;
}

async function readFileUtf8NoFollow(filePath: string): Promise<string> {
  if (await isSymlinkAsync(filePath)) {
    throw createSymlinkReadError(filePath);
  }

  const noFollowFlag = getNoFollowFlag();
  const flags = fs.constants.O_RDONLY | noFollowFlag;
  const handle = await fs.promises.open(filePath, flags);
  try {
    // Best-effort fallback for platforms without O_NOFOLLOW (notably Windows).
    // Re-check symlink status after open to reduce check-then-use windows.
    if (noFollowFlag === 0 && (await isSymlinkAsync(filePath))) {
      throw createSymlinkReadError(filePath);
    }

    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error('Path is not a regular file');
    }

    if (noFollowFlag === 0) {
      const latestStats = await fs.promises.stat(filePath);
      if (latestStats.dev !== stats.dev || latestStats.ino !== stats.ino) {
        throw new Error('Path changed during secure read');
      }
    }

    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

function parseSettingsObject(content: string, sourceLabel: string): Record<string, unknown> {
  if (!content.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must contain a JSON object, not an array or primitive`);
  }
  return parsed as Record<string, unknown>;
}

async function withPersistSettingsLock<T>(operation: () => Promise<T>): Promise<T> {
  const settingsPath = getClaudeSettingsPath();
  const settingsDir = path.dirname(settingsPath);
  await fs.promises.mkdir(settingsDir, { recursive: true });

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(settingsDir, {
      stale: PERSIST_LOCK_STALE_MS,
      retries: {
        retries: PERSIST_LOCK_RETRIES,
        minTimeout: PERSIST_LOCK_RETRY_MIN_MS,
        maxTimeout: PERSIST_LOCK_RETRY_MAX_MS,
      },
      realpath: false,
    });
  } catch (error) {
    throw new Error(
      `Failed to lock Claude settings directory (${formatDisplayPath(settingsDir)}): ${(error as Error).message}`
    );
  }

  try {
    return await operation();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Best-effort release.
      }
    }
  }
}

/** Read existing Claude settings.json with validation */
async function readClaudeSettings(): Promise<Record<string, unknown>> {
  const settingsPath = getClaudeSettingsPath();
  try {
    const content = await readFileUtf8NoFollow(settingsPath);
    return parseSettingsObject(content, 'settings.json');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return {};
    }
    if (nodeError.code === 'ELOOP') {
      throw new Error('settings.json is a symlink - refusing to read for security');
    }
    throw new Error(`Failed to parse settings.json: ${(error as Error).message}`);
  }
}

/** Write settings back to settings.json with atomic replace semantics. */
async function writeClaudeSettings(settings: Record<string, unknown>): Promise<void> {
  const settingsPath = getClaudeSettingsPath();
  if (await isSymlinkAsync(settingsPath)) {
    throw new Error('settings.json is a symlink - refusing to write for security');
  }

  const settingsDir = path.dirname(settingsPath);
  await fs.promises.mkdir(settingsDir, { recursive: true });

  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpPath = path.join(settingsDir, `settings.json.tmp-${nonce}`);
  const flags =
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | getNoFollowFlag();

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tmpPath, flags, 0o600);
    await handle.writeFile(JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8' });
    await handle.sync();
  } finally {
    if (handle) {
      await handle.close();
    }
  }

  try {
    await fs.promises.rename(tmpPath, settingsPath);
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  try {
    await fs.promises.chmod(settingsPath, 0o600);
  } catch {
    // Best-effort permission hardening.
  }
}

/** Maximum number of backups to keep (oldest are deleted) */
const MAX_BACKUPS = 10;

/** Create backup of settings.json with proper permissions and rotation */
async function createBackup(): Promise<string> {
  const settingsPath = getClaudeSettingsPath();
  if (!(await pathExists(settingsPath))) {
    throw new Error('No settings.json to backup');
  }

  const settingsContent = await readFileUtf8NoFollow(settingsPath);

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

  const flags =
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | getNoFollowFlag();

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(backupPath, flags, 0o600);
    await handle.writeFile(settingsContent, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    if (handle) {
      await handle.close();
    }
  }

  try {
    await fs.promises.chmod(backupPath, 0o600);
  } catch {
    // Best-effort permission hardening.
  }

  // Cleanup: Rotate old backups (keep only MAX_BACKUPS)
  cleanupOldBackups();
  return backupPath;
}

/** Remove old backups keeping only MAX_BACKUPS most recent */
function cleanupOldBackups(): void {
  const backups = getBackupFiles();
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
      } catch (error) {
        console.log(
          warn(
            `Failed to delete old backup ${formatDisplayPath(backup.path)}: ${(error as Error).message}`
          )
        );
      }
    }
  }
}

interface BackupFile {
  path: string;
  timestamp: string;
  date: Date;
}

function parseBackupTimestamp(timestamp: string): Date | null {
  const year = parseInt(timestamp.slice(0, 4), 10);
  const month = parseInt(timestamp.slice(4, 6), 10);
  const day = parseInt(timestamp.slice(6, 8), 10);
  const hour = parseInt(timestamp.slice(9, 11), 10);
  const minute = parseInt(timestamp.slice(11, 13), 10);
  const second = parseInt(timestamp.slice(13, 15), 10);
  const date = new Date(year, month - 1, day, hour, minute, second);

  if (date.getFullYear() !== year) return null;
  if (date.getMonth() !== month - 1) return null;
  if (date.getDate() !== day) return null;
  if (date.getHours() !== hour) return null;
  if (date.getMinutes() !== minute) return null;
  if (date.getSeconds() !== second) return null;

  return date;
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
      const date = parseBackupTimestamp(timestamp);
      if (!date) return null;
      return {
        path: path.join(dir, f),
        timestamp,
        date,
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

const SENSITIVE_ENV_PARTS = new Set([
  'TOKEN',
  'KEY',
  'SECRET',
  'PASSWORD',
  'PASS',
  'AUTH',
  'CREDENTIAL',
  'PRIVATE',
  'ACCESS',
  'REFRESH',
  'APIKEY',
]);

function splitSensitiveKeyParts(key: string): string[] {
  const withCamelCaseBoundaries = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return withCamelCaseBoundaries
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function isSensitiveEnvKey(key: string): boolean {
  const parts = splitSensitiveKeyParts(key);
  if (parts.some((part) => SENSITIVE_ENV_PARTS.has(part))) {
    return true;
  }

  const compact = parts.join('');
  return (
    compact.includes('TOKEN') ||
    compact.includes('APIKEY') ||
    compact.includes('ACCESSKEY') ||
    compact.includes('AUTHKEY') ||
    compact.includes('SECRET') ||
    compact.includes('PASSWORD') ||
    compact.includes('CREDENTIAL')
  );
}

/** Resolve shared Claude settings payload for a profile */
async function resolveProfileEnvVars(profileName: string): Promise<ResolvedEnv> {
  const setup = await resolveClaudeExtensionSetup(profileName);
  const typeLabel: Record<string, string> = {
    settings: 'API',
    cliproxy: 'CLIProxy',
    copilot: 'Copilot',
    account: 'Account',
    default: 'Default',
  };

  return {
    env: setup.extensionEnv,
    clearEnvKeys: setup.removeEnvKeys,
    profileType: typeLabel[setup.profileType] ?? setup.profileType,
    warnings: setup.warnings,
    notes: setup.notes,
  };
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
  console.log(warn(`This will replace ${getClaudeSettingsDisplayPath()}`));
  console.log('');
  if (!yes) {
    const proceed = await InteractivePrompt.confirm('Proceed with restore?', { default: false });
    if (!proceed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }

  let parsedBackupSettings: Record<string, unknown>;
  try {
    const backupContent = await readFileUtf8NoFollow(backup.path);
    parsedBackupSettings = parseSettingsObject(backupContent, 'Backup file');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      console.log(fail('Backup was deleted during restore'));
      process.exit(1);
    }
    if (nodeError.code === 'ELOOP') {
      console.log(fail('Backup file is a symlink - refusing to restore for security'));
      process.exit(1);
    }
    console.log(fail(`Backup file is corrupted: ${(error as Error).message}`));
    process.exit(1);
  }

  try {
    await withPersistSettingsLock(async () => {
      const settingsPath = getClaudeSettingsPath();
      if (await isSymlinkAsync(settingsPath)) {
        throw new Error('settings.json is a symlink - refusing to restore for security');
      }

      let rollbackBackupPath: string | null = null;
      if (await pathExists(settingsPath)) {
        rollbackBackupPath = await createBackup();
      }

      try {
        await writeClaudeSettings(parsedBackupSettings);
      } catch (error) {
        const writeError = error as Error;
        if (rollbackBackupPath) {
          try {
            const rollbackContent = await readFileUtf8NoFollow(rollbackBackupPath);
            const rollbackSettings = parseSettingsObject(rollbackContent, 'Rollback backup');
            await writeClaudeSettings(rollbackSettings);
          } catch (rollbackError) {
            throw new Error(
              `Restore failed: ${writeError.message}. Rollback also failed: ${(rollbackError as Error).message}. Manual recovery backup: ${formatDisplayPath(rollbackBackupPath)}`
            );
          }
        }
        throw new Error(`Restore failed: ${writeError.message}`);
      }
    });
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }

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
  console.log("  Writes a profile's Claude setup directly to");
  console.log(`  ${getClaudeSettingsDisplayPath()} for native Claude Code usage.`);
  console.log('');
  console.log('  This is the preferred shared-settings path for Claude Code');
  console.log('  and the Claude IDE extension when you want one profile everywhere.');
  console.log('');
  console.log(subheader('Options'));
  console.log(`  ${color('--yes, -y', 'command')}         Skip confirmation prompts (auto-backup)`);
  console.log(
    `  ${color('--permission-mode <mode>', 'command')}  Set default permission mode in settings.json`
  );
  console.log(
    `  ${color('--dangerously-skip-permissions', 'command')}  Persist auto-approve (bypassPermissions)`
  );
  console.log(`  ${color('--auto-approve', 'command')}  Alias for --dangerously-skip-permissions`);
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
  console.log(`  ${color('API profiles', 'command')}      glm, km, custom API profiles`);
  console.log(`  ${color('CLIProxy', 'command')}          gemini, agy, qwen, kiro, ghcp`);
  console.log(`  ${color('Copilot', 'command')}           copilot (requires copilot-api daemon)`);
  console.log(
    `  ${color('Account profiles', 'command')}  work, personal, client (persists CLAUDE_CONFIG_DIR)`
  );
  console.log(
    `  ${color('default', 'command')}           Clears CCS-managed overrides or inherits mapped continuity`
  );
  console.log('');
  console.log(subheader('Examples'));
  console.log(`  ${dim('# Persist GLM profile')}`);
  console.log(`  ${color('ccs persist glm', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with auto-confirmation')}`);
  console.log(`  ${color('ccs persist gemini --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with default permission mode')}`);
  console.log(`  ${color('ccs persist glm --permission-mode acceptEdits', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with auto-approve enabled')}`);
  console.log(`  ${color('ccs persist glm --dangerously-skip-permissions', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist an account profile for IDE/native Claude use')}`);
  console.log(`  ${color('ccs persist work --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Reset to native Claude defaults (clear CCS-managed overrides)')}`);
  console.log(`  ${color('ccs persist default --yes', 'command')}`);
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
  console.log(
    '  [i] Codex CLIProxy profiles are native Codex-only: use ccsxp or ccs codex --target codex.'
  );
  console.log('  [i] Copilot profiles require copilot-api daemon.');
  console.log(
    '  [i] Account/default flows remove stale ANTHROPIC_* overrides before applying new setup.'
  );
  console.log(
    '  [i] For IDE-local settings.json snippets, use: ccs env <profile> --format claude-extension'
  );
  console.log(
    `  [i] Backups are saved as ${getClaudeSettingsDisplayPath()}.backup.YYYYMMDD_HHMMSS`
  );
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
  if (parsedArgs.parseError) {
    throw new Error(parsedArgs.parseError);
  }
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
  const resolvedPermissionMode = resolvePermissionMode(parsedArgs);
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
  try {
    detector.detectProfileType(parsedArgs.profile);
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
    resolved = await resolveProfileEnvVars(parsedArgs.profile);
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }
  // Display what will be written
  console.log(header(`Persist Profile: ${parsedArgs.profile}`));
  console.log('');
  console.log(`Profile type: ${color(resolved.profileType, 'command')}`);
  console.log('');
  const envKeys = Object.keys(resolved.env);
  if (envKeys.length > 0) {
    console.log(`The following env vars will be written to ${getClaudeSettingsDisplayPath()}:`);
    console.log('');
    const maxKeyLen = Math.max(...envKeys.map((k) => k.length));
    for (const [key, value] of Object.entries(resolved.env)) {
      const paddedKey = key.padEnd(maxKeyLen + 2);
      const displayValue = isSensitiveEnvKey(key) ? maskApiKey(value) : value;
      console.log(`  ${color(paddedKey, 'command')} = ${displayValue}`);
    }
    console.log('');
  } else {
    console.log(info('No new env vars will be added.'));
    console.log(dim('    CCS-managed transport overrides will be removed if present.'));
    console.log('');
  }
  if (resolved.clearEnvKeys.length > 0) {
    console.log('Managed env keys replaced/cleared on write:');
    console.log(`  ${dim(resolved.clearEnvKeys.join(', '))}`);
    console.log('');
  }
  if (resolvedPermissionMode) {
    console.log(`Default permission mode: ${color(resolvedPermissionMode, 'command')}`);
    if (resolvedPermissionMode === 'bypassPermissions') {
      console.log(warn('Auto-approve enabled: Claude will skip permission prompts by default.'));
    }
    console.log('');
  }
  if (resolved.warnings?.length) {
    for (const message of resolved.warnings) {
      console.log(warn(message));
    }
    console.log('');
  }
  if (resolved.notes?.length) {
    for (const note of resolved.notes) {
      console.log(info(note));
    }
    console.log('');
  }
  // Warning about modification
  console.log(warn(`This will modify ${getClaudeSettingsDisplayPath()}`));
  console.log(dim('    Existing hooks and other settings will be preserved.'));
  console.log(
    dim('    Existing managed profile env keys will be replaced to avoid stale routing.')
  );
  console.log('');
  // Check if settings.json exists for backup
  const settingsPath = getClaudeSettingsPath();
  const settingsExist = fs.existsSync(settingsPath);
  let createBackupFlag = false;
  // Track backup path for error recovery guidance
  let createdBackupPath: string | null = null;
  // Backup prompt (unless --yes)
  if (settingsExist) {
    createBackupFlag = parsedArgs.yes === true; // Auto-backup with --yes
    if (!parsedArgs.yes) {
      createBackupFlag = await InteractivePrompt.confirm('Create backup before modifying?', {
        default: true,
      });
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
  try {
    await withPersistSettingsLock(async () => {
      if (createBackupFlag && (await pathExists(settingsPath))) {
        try {
          createdBackupPath = await createBackup();
          console.log(ok(`Backup created: ${formatDisplayPath(createdBackupPath)}`));
          console.log('');
        } catch (error) {
          throw new Error(`Failed to create backup: ${(error as Error).message}`);
        }
      }

      // Read existing settings and merge
      const existingSettings = await readClaudeSettings();
      // Validate existing env is an object (not array/primitive)
      const rawEnv = existingSettings.env;
      let existingEnv: Record<string, string> = {};
      if (rawEnv !== undefined) {
        if (rawEnv === null) {
          console.log(warn('Existing env in settings.json is null - it will be replaced'));
        } else if (typeof rawEnv !== 'object' || Array.isArray(rawEnv)) {
          console.log(warn('Existing env in settings.json is not an object - it will be replaced'));
        } else {
          existingEnv = rawEnv as Record<string, string>;
        }
      }

      const preservedEnv = { ...existingEnv };
      for (const key of resolved.clearEnvKeys) {
        delete preservedEnv[key];
      }

      const mergedSettings: Record<string, unknown> = {
        ...existingSettings,
        env: {
          ...preservedEnv,
          ...resolved.env,
        },
      };

      if (resolvedPermissionMode) {
        const rawPermissions = existingSettings.permissions;
        let existingPermissions: Record<string, unknown> = {};
        if (rawPermissions !== undefined) {
          if (rawPermissions === null) {
            console.log(
              warn('Existing permissions in settings.json is null - it will be replaced')
            );
          } else if (typeof rawPermissions !== 'object' || Array.isArray(rawPermissions)) {
            console.log(
              warn('Existing permissions in settings.json is not an object - it will be replaced')
            );
          } else {
            existingPermissions = rawPermissions as Record<string, unknown>;
          }
        }
        mergedSettings.permissions = {
          ...existingPermissions,
          defaultMode: resolvedPermissionMode,
        };
      }

      await writeClaudeSettings(mergedSettings);
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('Failed to create backup:')) {
      console.log(fail(message));
    } else {
      console.log(fail(`Failed to write settings: ${message}`));
    }
    if (createdBackupPath) {
      console.log('');
      console.log(info(`A backup was created before this error:`));
      console.log(`    ${formatDisplayPath(createdBackupPath)}`);
      console.log(dim('    To restore: ccs persist --restore'));
    }
    process.exit(1);
  }
  console.log('');
  console.log(ok(`Profile '${parsedArgs.profile}' written to ${getClaudeSettingsDisplayPath()}`));
  console.log('');
  console.log(info('Claude Code will now use this profile by default.'));
  console.log(dim('    To revert, restore the backup or edit settings.json manually.'));
  console.log('');
}
