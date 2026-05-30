/**
 * codex-auth import-default command.
 *
 * Migrates legacy ~/.codex/auth.json into a named profile (non-destructive).
 * Implements C3 torn-write protection: read-with-retry + JWT-shape validation
 * + current-user Codex-running detection + atomic write.
 *
 * Usage: ccsx auth import-default <name> [--with-history] [--force] [--force-while-running]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { createLogger } from '../../services/logging';
import { ok } from '../../utils/ui';
import { initUI } from '../../utils/ui';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import { resolveCodexProfileDir, ensureSharedConfigSymlink, decodeIdToken } from '../index';
import { hasStructurallyValidIdToken } from '../decode-id-token';
import { parseArgs, rejectUnsupportedOptions, getProfileNameError } from './types';
import type { CodexCommandContext } from './types';

const logger = createLogger('codex-auth:cmd:import-default');

// Maximum retries for torn-write detection (C3)
const MAX_READ_RETRIES = 3;
const RETRY_DELAY_MS = 100;

// CLIProxy format marker (reject these with a clear message)
const CLIPROXY_TYPE_MARKER = 'type';
const IMPORT_DEFAULT_USAGE =
  'ccsx auth import-default <name> [--with-history] [--force] [--force-while-running]';

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detect a running Codex CLI process from the current user's process table
 * (best-effort, never throws). Returns the PID string if found, null otherwise.
 */
function detectCodexRunning(): string | null {
  try {
    const result = childProcess.spawnSync(
      'ps',
      ['-A', '-o', 'pid=', '-o', 'uid=', '-o', 'command='],
      {
        encoding: 'utf8',
        timeout: 2000,
      }
    );
    if (result.status !== 0 || !result.stdout || result.stdout.trim().length === 0) {
      return null;
    }

    return selectCodexPidFromPsOutput(result.stdout);
  } catch {
    return null;
  }
}

function selectCodexPidFromPsOutput(stdout: string): string | null {
  const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/);
    if (!match) continue;
    const [, pid, uid, command] = match;
    if (!pid || !uid || !command || pid === String(process.pid)) continue;
    if (currentUid !== null && uid !== String(currentUid)) continue;
    if (isLikelyCodexProcessCommand(command)) return pid;
  }
  return null;
}

function isLikelyCodexProcessCommand(command: string): boolean {
  const executable = firstCommandToken(command);
  if (isCodexExecutableToken(executable)) {
    return true;
  }

  const normalized = command.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/@openai/codex/')) {
    return true;
  }

  return command.split(/\s+/).some((token) => {
    const tokenName = executableTokenBasename(token);
    return tokenName === 'codex.js' || isCodexExecutableName(tokenName);
  });
}

function firstCommandToken(command: string): string {
  const trimmed = command.trim();
  const quoted = trimmed.match(/^"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  return trimmed.split(/\s+/)[0] ?? '';
}

function isCodexExecutableToken(token: string): boolean {
  return isCodexExecutableName(executableTokenBasename(token));
}

function executableTokenBasename(token: string): string {
  return path.basename(token.replace(/^["']|["']$/g, '').replace(/\\/g, '/')).toLowerCase();
}

function isCodexExecutableName(name: string): boolean {
  return ['codex', 'codex.exe', 'codex.cmd', 'codex.ps1'].includes(name);
}

/**
 * Read and validate auth.json with retry on torn-write (C3).
 * Returns parsed auth JSON or throws on persistent failure.
 */
async function readAuthJsonSafe(authSrcPath: string): Promise<Record<string, unknown>> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_READ_RETRIES; attempt++) {
    try {
      const buf = fs.readFileSync(authSrcPath, 'utf8');
      const parsed = JSON.parse(buf) as Record<string, unknown>;

      // Reject cliproxy-format auth files
      if (
        typeof parsed[CLIPROXY_TYPE_MARKER] === 'string' &&
        (parsed[CLIPROXY_TYPE_MARKER] === 'codex' ||
          parsed[CLIPROXY_TYPE_MARKER] === 'anthropic' ||
          parsed[CLIPROXY_TYPE_MARKER] === 'gemini')
      ) {
        throw new Error(
          `CLIPROXY_FORMAT: Source is a CLIProxy auth file (type="${parsed[CLIPROXY_TYPE_MARKER]}"); use \`ccs cliproxy ...\` instead.`
        );
      }

      // Validate JWT shape: must have tokens.id_token with a parseable JWT payload.
      const tokens = parsed['tokens'] as Record<string, unknown> | undefined;
      if (tokens) {
        const idToken = tokens['id_token'];
        if (typeof idToken === 'string' && idToken.length > 0) {
          if (!hasStructurallyValidIdToken(idToken)) {
            // Torn write mid-JWT — retry
            throw new Error('TORN_JWT: id_token payload is not parseable');
          }
        }
      }

      return parsed;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('CLIPROXY_FORMAT:')) {
        throw err; // never retry CLIProxy format rejection
      }
      lastErr = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        'codex-auth.import-default.torn-read',
        `Read attempt ${attempt + 1}/${MAX_READ_RETRIES} failed: ${lastErr.message}`
      );
      if (attempt < MAX_READ_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Failed to read a valid auth.json after ${MAX_READ_RETRIES} attempts: ${lastErr?.message ?? 'unknown'}`
  );
}

/**
 * Atomic copy: write to tmp.<pid>.<rand>, fsync, rename to dest.
 * Preserves 0600 permissions.
 */
function atomicWriteFile(dest: string, content: string): void {
  const tmpPath = `${dest}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600 });
    // fsync via close-and-reopen pattern (Bun/Node doesn't expose fd fsync easily)
    const fd = fs.openSync(tmpPath, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpPath, dest);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

/**
 * Copy a file if it exists; silently skip if not.
 * Returns 'copied' | 'missing'.
 */
function copyIfPresent(src: string, dest: string): 'copied' | 'missing' {
  if (!fs.existsSync(src)) return 'missing';
  const content = fs.readFileSync(src, 'utf8');
  atomicWriteFile(dest, content);
  return 'copied';
}

/**
 * Recursively copy a directory if it exists.
 * Returns count of files copied, or -1 if dir missing.
 */
function copyDirIfPresent(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return -1;
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  let count = 0;
  for (const entry of fs.readdirSync(srcDir)) {
    const srcEntry = path.join(srcDir, entry);
    const destEntry = path.join(destDir, entry);
    const stat = fs.lstatSync(srcEntry);
    if (stat.isDirectory()) {
      count += copyDirIfPresent(srcEntry, destEntry);
    } else if (stat.isFile()) {
      fs.copyFileSync(srcEntry, destEntry);
      count++;
    }
  }
  return count;
}

// ── main command ──────────────────────────────────────────────────────────────

export interface ImportDefaultArgs {
  name: string;
  withHistory: boolean;
  force: boolean;
  forceWhileRunning: boolean;
}

function parseImportDefaultArgs(rawArgs: string[]): ImportDefaultArgs | null {
  // --with-history, --force, --force-while-running are distinct flags
  const parsed = parseArgs(rawArgs);
  const unknownFlags = parsed.unknownFlags?.filter(
    (flag) => flag !== '--with-history' && flag !== '--force-while-running'
  );
  rejectUnsupportedOptions({ ...parsed, unknownFlags }, IMPORT_DEFAULT_USAGE, { force: true });

  const withHistory = rawArgs.includes('--with-history');
  const forceWhileRunning = rawArgs.includes('--force-while-running');

  if (!parsed.profileName) return null;

  return {
    name: parsed.profileName,
    withHistory,
    force: parsed.force ?? false,
    forceWhileRunning,
  };
}

export async function handleImportDefaultCodex(
  ctx: CodexCommandContext,
  rawArgs: string[]
): Promise<void> {
  await initUI();

  const args = parseImportDefaultArgs(rawArgs);
  if (!args) {
    console.log(`Usage: ${IMPORT_DEFAULT_USAGE}`);
    exitWithError('Profile name required', ExitCode.PROFILE_ERROR);
    return;
  }

  const nameError = getProfileNameError(args.name);
  if (nameError) {
    exitWithError(nameError, ExitCode.PROFILE_ERROR);
    return;
  }

  // Resolve legacy Codex home — LEGACY_CODEX_HOME env allows test hermeticity (D decision)
  const legacyCodexHome = process.env['LEGACY_CODEX_HOME'] ?? path.join(os.homedir(), '.codex');
  const legacyAuthPath = path.join(legacyCodexHome, 'auth.json');

  // Check legacy auth.json exists
  if (!fs.existsSync(legacyAuthPath)) {
    console.log(`  Use \`ccsx auth login ${args.name}\` to authenticate a new profile instead.`);
    exitWithError('No legacy auth.json', ExitCode.PROFILE_ERROR);
    return;
  }

  const { registry } = ctx;

  // Profile collision check
  if (registry.hasProfile(args.name) && !args.force) {
    console.log(`  Use --force to overwrite (a .bak-<ts> backup will be created).`);
    exitWithError('Profile already exists', ExitCode.PROFILE_ERROR);
    return;
  }

  // Detect Codex running (C3)
  const codexPid = detectCodexRunning();
  if (codexPid && !args.forceWhileRunning) {
    process.stderr.write(
      `[!] Codex appears to be running (PID ${codexPid}). A token refresh may be in flight.\n`
    );
    process.stderr.write(
      `    Quit Codex first, then re-run import-default. Or pass --force-while-running to proceed anyway.\n`
    );
    exitWithError('Codex is running', ExitCode.PROFILE_ERROR);
    return;
  }
  if (codexPid && args.forceWhileRunning) {
    process.stderr.write(
      `[!] Proceeding with Codex running (--force-while-running). Be aware a refresh may race.\n`
    );
  }

  // Read + validate source (C3 torn-write protection)
  let authData: Record<string, unknown>;
  try {
    authData = await readAuthJsonSafe(legacyAuthPath);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('CLIPROXY_FORMAT:')) {
      exitWithError(err.message, ExitCode.PROFILE_ERROR);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    exitWithError(msg, ExitCode.GENERAL_ERROR);
    return;
  }

  const profileDir = resolveCodexProfileDir(args.name);

  // Create dir
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });

  const destAuthPath = path.join(profileDir, 'auth.json');

  // Backup existing auth.json if --force overwrite
  if (args.force && fs.existsSync(destAuthPath)) {
    const bakPath = `${destAuthPath}.bak-${Date.now()}`;
    fs.copyFileSync(destAuthPath, bakPath);
    process.stderr.write(`[i] Backed up existing auth.json to ${path.basename(bakPath)}\n`);
  }

  // Atomic write (C3)
  atomicWriteFile(destAuthPath, JSON.stringify(authData, null, 2));
  logger.stage('dispatch', 'codex-auth.import-default.copied', 'Copied auth.json to profile', {
    name: args.name,
    dest: destAuthPath,
  });

  // Optional: copy history + sessions (D8 default false)
  let historyStatus: string;
  let sessionsStatus: string;

  if (args.withHistory) {
    const legacyHistoryPath = path.join(legacyCodexHome, 'history.jsonl');
    const destHistoryPath = path.join(profileDir, 'history.jsonl');
    const historyCopied = copyIfPresent(legacyHistoryPath, destHistoryPath);
    historyStatus = historyCopied === 'copied' ? 'copied' : 'not present';

    const legacySessionsDir = path.join(legacyCodexHome, 'sessions');
    const destSessionsDir = path.join(profileDir, 'sessions');
    const sessionCount = copyDirIfPresent(legacySessionsDir, destSessionsDir);
    sessionsStatus = sessionCount >= 0 ? `copied ${sessionCount} files` : 'not present';
  } else {
    historyStatus = 'not requested';
    sessionsStatus = 'not requested';
  }

  // Ensure shared config symlink (reuse Phase 1 helper)
  try {
    ensureSharedConfigSymlink(profileDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('codex-auth.import-default.symlink-failed', 'Symlink creation failed', {
      profileDir,
      error: msg,
    });
    exitWithError(`Failed to prepare profile config.toml: ${msg}`, ExitCode.CONFIG_ERROR);
    return;
  }

  // Decode email for display (best-effort)
  const tokens = authData['tokens'] as Record<string, unknown> | undefined;
  const idToken = typeof tokens?.['id_token'] === 'string' ? tokens['id_token'] : null;
  const identity = idToken ? decodeIdToken(idToken) : {};
  const emailDisplay = identity.email ?? '(unknown)';

  // Register in registry
  if (registry.hasProfile(args.name)) {
    registry.updateProfile(args.name, {
      last_used: new Date().toISOString(),
      email: identity.email,
      plan_type: identity.plan_type ?? null,
      account_id: identity.account_id,
    });
  } else {
    registry.createProfile(args.name, {
      created: new Date().toISOString(),
      last_used: new Date().toISOString(),
      email: identity.email,
      plan_type: identity.plan_type ?? null,
      account_id: identity.account_id,
    });
  }

  // Print summary
  console.log(ok(`Imported legacy ${legacyAuthPath} -> profile '${args.name}'`));
  console.log(`  Email   : ${emailDisplay}`);
  console.log(`  History : ${historyStatus}`);
  console.log(`  Sessions: ${sessionsStatus}`);
  console.log(`  Next    : ccsx auth switch ${args.name}`);
}
