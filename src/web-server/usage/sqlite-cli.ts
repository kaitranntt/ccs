import { execFile } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const SQLITE_JSON_MAX_BUFFER = 10 * 1024 * 1024;

// Trusted system paths per platform. These are fixed, non-user-writable
// locations managed by the OS or a system package manager.
// PATH-hijack threat model: we never resolve from $PATH; we only accept
// binaries whose realpath resolves under one of these prefixes.
const TRUSTED_SQLITE_PATHS_UNIX = [
  '/usr/bin/sqlite3',
  '/usr/local/bin/sqlite3',
  '/opt/homebrew/bin/sqlite3',
];

// Windows has no single canonical system install path for sqlite3
// (winget, Chocolatey, and Scoop all use different locations). An empty
// list means Windows falls through to the CCS_SQLITE_BIN env-var path.
const TRUSTED_SQLITE_PATHS_WINDOWS: string[] = [];

// Trusted path prefixes used to validate env-var overrides. A realpath that
// does not start with one of these prefixes is rejected to prevent users or
// CI from pointing CCS_SQLITE_BIN at a writable/untrusted location.
const TRUSTED_PREFIX_UNIX = [
  '/usr/bin/',
  '/usr/local/bin/',
  '/usr/sbin/',
  '/usr/local/sbin/',
  '/opt/homebrew/',
  '/opt/local/', // MacPorts
  '/nix/store/', // Nix / NixOS immutable store
  '/run/current-system/', // NixOS system activation symlink target
  '/snap/', // Snap packages
];

const TRUSTED_PREFIX_WINDOWS = [
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
  'C:\\Windows\\System32\\',
  'C:\\Windows\\SysWOW64\\',
  'C:\\ProgramData\\chocolatey\\bin\\', // Chocolatey managed bin dir
];

export type SqliteJsonRow = Record<string, unknown>;

function isCommandMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const nodeError = error as Error & { code?: string };
  return nodeError.code === 'ENOENT' || /not found/i.test(nodeError.message);
}

function getPlatformTrustedPaths(): string[] {
  return process.platform === 'win32' ? TRUSTED_SQLITE_PATHS_WINDOWS : TRUSTED_SQLITE_PATHS_UNIX;
}

function getPlatformTrustedPrefixes(): string[] {
  return process.platform === 'win32' ? TRUSTED_PREFIX_WINDOWS : TRUSTED_PREFIX_UNIX;
}

/**
 * Validate a CCS_SQLITE_BIN override path.
 *
 * Security invariant: the resolved (symlink-expanded) path must start with
 * at least one trusted prefix. This prevents pointing at a binary in a
 * user-writable location such as /tmp, $HOME/.local, or a relative PATH
 * entry, which would reintroduce the PATH-hijack vector closed in #1347.
 *
 * Returns the validated path on success, or throws with an explanation.
 */
function validateEnvOverridePath(rawPath: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch {
    throw new Error(
      `CCS_SQLITE_BIN path "${rawPath}" could not be resolved: file not found or inaccessible`
    );
  }

  // Verify executable bit (or file existence on Windows where X_OK is unreliable).
  try {
    if (process.platform === 'win32') {
      fs.accessSync(resolved, fs.constants.F_OK);
    } else {
      fs.accessSync(resolved, fs.constants.X_OK);
    }
  } catch {
    throw new Error(`CCS_SQLITE_BIN path "${resolved}" is not executable`);
  }

  const normalizedResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;

  const trusted = getPlatformTrustedPrefixes().some((prefix) => {
    const normalizedPrefix = process.platform === 'win32' ? prefix.toLowerCase() : prefix;
    return normalizedResolved.startsWith(normalizedPrefix);
  });

  if (!trusted) {
    throw new Error(
      `CCS_SQLITE_BIN path "${resolved}" does not resolve under a trusted system prefix. ` +
        `Paths under user-writable locations (e.g. /tmp, $HOME/.local) are rejected ` +
        `to prevent PATH-hijack attacks.`
    );
  }

  return resolved;
}

/**
 * Resolve the sqlite3 binary to use.
 *
 * Resolution order:
 * 1. CCS_SQLITE_BIN env var override (validated against trusted prefixes)
 * 2. First accessible path from the platform's hardcoded trusted list
 * 3. Throw "sqlite3 command not available"
 */
function resolveTrustedSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const envOverride = env['CCS_SQLITE_BIN'];
  if (envOverride && envOverride.trim().length > 0) {
    // May throw — caller surfaces the error.
    return validateEnvOverridePath(envOverride.trim());
  }

  const trustedPath = getPlatformTrustedPaths().find((candidate) => {
    try {
      // Resolve symlinks so the check is on the real binary.
      const real = fs.realpathSync(candidate);
      fs.accessSync(real, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

  if (!trustedPath) {
    throw new Error('sqlite3 command not available');
  }

  // Return the realpath to avoid double-hop symlink confusion at exec time.
  return fs.realpathSync(trustedPath);
}

export async function querySqliteJson(
  dbPath: string,
  sql: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<SqliteJsonRow[]> {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  let sqlitePath: string;
  try {
    sqlitePath = resolveTrustedSqlitePath(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }

  try {
    const { stdout } = await execFileAsync(sqlitePath, ['-json', dbPath, sql], {
      maxBuffer: SQLITE_JSON_MAX_BUFFER,
    });
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }

    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as SqliteJsonRow[]) : [];
  } catch (error) {
    if (isCommandMissing(error)) {
      throw new Error('sqlite3 command not available');
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`sqlite3 query failed for ${dbPath}: ${message}`);
  }
}

// Export internals for unit testing — not part of the public API.
export { resolveTrustedSqlitePath, validateEnvOverridePath, getPlatformTrustedPrefixes };
