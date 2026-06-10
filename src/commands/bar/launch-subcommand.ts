/**
 * `ccs bar launch` — ensure web-server is up, write ~/.ccs/bar.json, open the app.
 *
 * bar.json shape (v1):
 *   { baseUrl: string, port: number, authMode: "loopback" }
 *
 * authMode is always "loopback" for v1 (auth-enabled unsupported until v1.1).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCcsDir } from '../../config/config-loader-facade';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BarDiscoveryJson {
  baseUrl: string;
  port: number;
  authMode: 'loopback';
}

export interface DashboardInfo {
  port: number;
  baseUrl: string;
}

export interface LaunchDeps {
  /**
   * Ensure the CCS web-server / dashboard is running.
   * Returns { port, baseUrl } of the running server.
   * Throws if the server cannot be started (degraded path).
   */
  ensureDashboard: () => Promise<DashboardInfo>;
  /** Open the installed .app bundle. Throws if the app is not found. */
  openApp: (appPath: string) => Promise<void>;
  /** Returns path to ~/.ccs (respects CCS_HOME for test isolation). */
  getCcsDir: () => string;
  /** Full path where the .app should be installed, e.g. ~/Applications/CCS Bar.app */
  appInstallPath: string;
}

// ---------------------------------------------------------------------------
// Port discovery helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Read the port recorded in an existing bar.json.
 * Returns null when the file is absent or malformed.
 */
export function resolveBarPort(ccsDir: string): number | null {
  const barJsonPath = path.join(ccsDir, 'bar.json');
  try {
    const raw = fs.readFileSync(barJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BarDiscoveryJson>;
    return typeof parsed.port === 'number' ? parsed.port : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Default production dependencies
// ---------------------------------------------------------------------------

async function defaultEnsureDashboard(): Promise<DashboardInfo> {
  // Reuse the same startup path as `ccs config`:
  // find a free port then start the web-server via startServer().
  const getPort = (await import('get-port')).default;
  const { startServer } = await import('../../web-server');

  const port = await getPort({ port: [3000, 3001, 3002, 8000, 8080] });
  // Bind IPv4 loopback explicitly. Without a host, startServer defaults to
  // 'localhost', which on macOS resolves to ::1 (IPv6) — but bar.json's baseUrl
  // (and the Swift app) use 127.0.0.1, so the app could not reach its own server.
  const { server } = await startServer({ port, host: '127.0.0.1' });

  const addr = server.address();
  const resolvedPort = addr && typeof addr === 'object' ? addr.port : port;
  const baseUrl = `http://127.0.0.1:${resolvedPort}`;
  return { port: resolvedPort, baseUrl };
}

async function defaultOpenApp(appPath: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('open', ['-a', appPath]);
}

function defaultGetCcsDir(): string {
  return getCcsDir();
}

// Fix #5: use os.homedir() to match install-subcommand.ts and uninstall-subcommand.ts.
// process.env.HOME may be unset in restricted environments, and CCS_HOME is the CCS
// data directory (~/.ccs), not the user's home — neither is a safe fallback here.
const DEFAULT_APP_INSTALL_PATH = path.join(os.homedir(), 'Applications', 'CCS Bar.app');

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarLaunch(
  _args: string[],
  deps: Partial<LaunchDeps> = {}
): Promise<void> {
  const ensureDashboard = deps.ensureDashboard ?? defaultEnsureDashboard;
  const openApp = deps.openApp ?? defaultOpenApp;
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const appInstallPath = deps.appInstallPath ?? DEFAULT_APP_INSTALL_PATH;

  // 1. Ensure the web-server/dashboard is running.
  let dashboardInfo: DashboardInfo;
  try {
    dashboardInfo = await ensureDashboard();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not start CCS web-server: ${msg}`);
    console.error('[i] Run `ccs config` to start the dashboard manually.');
    return;
  }

  // 2. Write bar.json — this is the single source of discovery for the Swift app.
  const barJson: BarDiscoveryJson = {
    baseUrl: dashboardInfo.baseUrl,
    port: dashboardInfo.port,
    authMode: 'loopback',
  };

  try {
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), JSON.stringify(barJson, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to write bar.json: ${msg}`);
    return;
  }

  console.log(`[OK] CCS web-server running at ${dashboardInfo.baseUrl}`);
  console.log(`[i]  Discovery file written: ${path.join(ccsDir, 'bar.json')}`);

  // 3. Open the app.
  try {
    await openApp(appInstallPath);
    console.log('[OK] CCS Bar launched.');
  } catch {
    // Degraded path: app not installed or open failed.
    if (!fs.existsSync(appInstallPath)) {
      console.log('[!] CCS Bar app is not installed.');
      console.log('[i] Run `ccs bar install` to install it.');
    } else {
      console.log('[!] Could not open CCS Bar. Try right-clicking and selecting Open.');
      console.log('[i] If Gatekeeper blocks the app, run:');
      console.log(`      xattr -dr com.apple.quarantine "${appInstallPath}"`);
    }
  }
}
