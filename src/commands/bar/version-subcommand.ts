/**
 * `ccs bar --version` / `ccs bar version`
 *
 * Prints the CCS CLI version alongside the installed CCS Bar app version
 * (read from ~/.ccs/bar/.version, if present).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getVersion } from '../../utils/version';
import { getCcsDir } from '../../config/config-loader-facade';

function readInstalledBarVersion(ccsDir: string): string | null {
  const versionFile = path.join(ccsDir, 'bar', '.version');
  try {
    const content = fs.readFileSync(versionFile, 'utf8').trim();
    return content || null;
  } catch {
    return null;
  }
}

export async function handleBarVersion(): Promise<void> {
  const cliVersion = getVersion();
  const ccsDir = getCcsDir();
  const barVersion = readInstalledBarVersion(ccsDir);

  // Finding #13: label each line unambiguously — CLI version vs installed Bar app version.
  console.log(`[i] CCS CLI v${cliVersion}`);
  if (barVersion) {
    console.log(`[i] CCS Bar app: v${barVersion}`);
  } else {
    console.log('[i] CCS Bar app: not installed (run `ccs bar install`)');
  }

  process.exit(0);
}
