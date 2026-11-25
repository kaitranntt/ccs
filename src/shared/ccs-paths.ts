import { AsyncLocalStorage } from 'async_hooks';
import * as os from 'os';
import * as path from 'path';

let _globalConfigDir: string | undefined;
const configScopeStorage = new AsyncLocalStorage<{ ccsHome?: string; ccsDir?: string }>();

function normalizeScopedPath(dir: string | undefined): string | undefined {
  return dir ? path.resolve(dir) : undefined;
}

export async function runWithScopedConfig<T>(
  scope: { ccsHome?: string; ccsDir?: string },
  fn: () => Promise<T> | T
): Promise<T> {
  return await configScopeStorage.run(
    {
      ccsHome: normalizeScopedPath(scope.ccsHome),
      ccsDir: normalizeScopedPath(scope.ccsDir),
    },
    fn
  );
}

export async function runWithScopedCcsHome<T>(
  ccsHome: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return await runWithScopedConfig({ ccsHome }, fn);
}

export async function runWithScopedConfigDir<T>(
  ccsDir: string,
  fn: () => Promise<T> | T
): Promise<T> {
  return await runWithScopedConfig({ ccsDir }, fn);
}

/**
 * Set global config directory from --config-dir CLI flag.
 * Must be called before any config loading.
 * Pass undefined to clear (useful for tests).
 */
export function setGlobalConfigDir(dir: string | undefined): void {
  _globalConfigDir = dir ? path.resolve(dir) : undefined;
}

/**
 * Get the CCS home directory (respects CCS_HOME env var for test isolation)
 * @returns Home directory path
 */
export function getCcsHome(): string {
  const scopedHome = configScopeStorage.getStore()?.ccsHome;
  if (scopedHome) {
    return scopedHome;
  }
  return process.env.CCS_HOME || os.homedir();
}

/**
 * Resolve the CCS directory with source information.
 * Single source of truth for precedence logic.
 */
function _resolveCcsDir(): { source: string; dir: string } {
  const scopedConfig = configScopeStorage.getStore();
  if (scopedConfig?.ccsDir) return { source: 'scoped:CCS_DIR', dir: scopedConfig.ccsDir };
  if (scopedConfig?.ccsHome)
    return { source: 'scoped:CCS_HOME', dir: path.join(scopedConfig.ccsHome, '.ccs') };
  if (_globalConfigDir) return { source: '--config-dir', dir: _globalConfigDir };
  if (process.env.CCS_DIR) return { source: 'CCS_DIR', dir: path.resolve(process.env.CCS_DIR) };
  if (process.env.CCS_HOME)
    return { source: 'CCS_HOME', dir: path.join(path.resolve(process.env.CCS_HOME), '.ccs') };
  return { source: 'default', dir: path.join(os.homedir(), '.ccs') };
}

/**
 * Get the CCS directory path.
 * Precedence: --config-dir flag > CCS_DIR env > CCS_HOME env (legacy, appends .ccs) > ~/.ccs default
 * @returns Path to CCS config directory
 */
export function getCcsDir(): string {
  return _resolveCcsDir().dir;
}

/**
 * Get which source determined the CCS directory (for diagnostics).
 * @returns [source_label, resolved_path] tuple
 */
export function getCcsDirSource(): [string, string] {
  const r = _resolveCcsDir();
  return [r.source, r.dir];
}

/**
 * Get the CCS directory as a user-facing display path.
 * Keeps the default path concise while preserving explicit overrides.
 */
export function getCcsDirDisplay(): string {
  return getCcsPathDisplay();
}

/**
 * Get a CCS path as a user-facing display path.
 * Keeps the default location concise while preserving explicit overrides.
 */
export function getCcsPathDisplay(...segments: string[]): string {
  const [source, dir] = getCcsDirSource();
  if (source === 'default') {
    return process.platform === 'win32'
      ? path.win32.join('%USERPROFILE%\\.ccs', ...segments)
      : path.posix.join('~/.ccs', ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  return path.join(dir, ...segments);
}

/**
 * Cloud sync folder patterns for security warning.
 */
const CLOUD_SYNC_PATTERNS = [
  'Dropbox',
  'OneDrive',
  'Google Drive',
  'iCloud Drive',
  'iCloudDrive',
  'pCloud',
  'MEGA',
  'Box Sync',
];

/**
 * Check if a path is under a cloud-synced folder.
 * @returns Detected service name or null
 */
export function detectCloudSyncPath(dir: string): string | null {
  const normalized = dir.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/');
  for (const pattern of CLOUD_SYNC_PATTERNS) {
    const patternLower = pattern.toLowerCase();
    // Exact path segment match to avoid false positives (e.g., "megauser" != "MEGA")
    if (segments.some((s) => s === patternLower)) return pattern;
  }
  return null;
}

/**
 * Get CCS hooks directory (respects CCS_HOME for test isolation)
 * @returns Path to hooks directory
 */
export function getCcsHooksDir(): string {
  return path.join(getCcsDir(), 'hooks');
}

/**
 * Get config file path (legacy JSON path)
 * @deprecated Use getActiveConfigPath() for mode-aware config path
 */
export function getConfigPath(): string {
  return process.env.CCS_CONFIG || path.join(getCcsDir(), 'config.json');
}

export function getRecommendedBrowserUserDataDir(): string {
  return path.join(getCcsDir(), 'browser', 'chrome-user-data');
}
