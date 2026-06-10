/**
 * `ccs bar uninstall` — remove CCS Bar.app from ~/Applications
 * and clear the version pin at ~/.ccs/bar/.version.
 *
 * No-op (and no error) when neither the app nor the pin exists.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCcsDir } from '../../config/config-loader-facade';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UninstallDeps {
  getCcsDir: () => string;
  getAppsDir: () => string;
  appName: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarUninstall(
  _args: string[],
  deps: Partial<UninstallDeps> = {}
): Promise<void> {
  const ccsDir = (deps.getCcsDir ?? (() => getCcsDir()))();
  const appsDir = (deps.getAppsDir ?? (() => path.join(os.homedir(), 'Applications')))();
  const appName = deps.appName ?? 'CCS Bar.app';

  const appPath = path.join(appsDir, appName);
  const versionPin = path.join(ccsDir, 'bar', '.version');

  let removed = false;

  // Remove the .app bundle (a directory on macOS).
  if (fs.existsSync(appPath)) {
    try {
      fs.rmSync(appPath, { recursive: true, force: true });
      console.log(`[OK] Removed ${appPath}`);
      removed = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[X] Failed to remove ${appPath}: ${msg}`);
    }
  }

  // Clear the version pin.
  if (fs.existsSync(versionPin)) {
    try {
      fs.unlinkSync(versionPin);
      removed = true;
    } catch {
      // Non-fatal — pin may already be gone.
    }
  }

  if (!removed) {
    console.log('[i] CCS Bar is not installed — nothing to remove.');
  } else {
    console.log('[OK] CCS Bar uninstalled.');
    console.log('[i] Run `ccs bar install` to reinstall.');
  }
}
