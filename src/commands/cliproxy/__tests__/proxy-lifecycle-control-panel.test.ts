/**
 * Tests for printControlPanelAccess: the Control Panel (API Management Center)
 * URL + login-key surface shown by `ccs cliproxy status` / `start`.
 *
 * Why this matters:
 *  - The Control Panel login screen only asks for a "Management Key" with no
 *    hint. Users who don't know the default (`ccs`) cannot get in. This surface
 *    is the fix, so it must print the panel URL on the active port and the
 *    EFFECTIVE key (default `ccs`, or the user's custom management_secret).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { printControlPanelAccess } from '../proxy-lifecycle-subcommand';
import { invalidateConfigCache, mutateConfig } from '../../../config/config-loader-facade';

function createTestHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-control-panel-test-'));
  const ccsDir = path.join(dir, '.ccs');
  fs.mkdirSync(path.join(ccsDir, 'cliproxy', 'auth'), { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'version: 1\n', 'utf8');
  return dir;
}

describe('printControlPanelAccess', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let logSpy: ReturnType<typeof spyOn>;
  let lines: string[];

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateConfigCache();
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      lines.push(String(msg ?? ''));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    invalidateConfigCache();
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it('prints the panel URL on the given port and the default key (ccs)', () => {
    printControlPanelAccess(8317);
    const out = lines.join('\n');
    expect(out).toContain('http://127.0.0.1:8317/management.html');
    expect(out).toContain('Panel login key:');
    expect(out).toContain('ccs');
  });

  it('uses the active port in the URL', () => {
    printControlPanelAccess(9000);
    expect(lines.join('\n')).toContain('http://127.0.0.1:9000/management.html');
  });

  it('prints a custom management_secret when configured', () => {
    mutateConfig((config) => {
      if (!config.cliproxy) {
        config.cliproxy = {};
      }
      if (!config.cliproxy.auth) {
        config.cliproxy.auth = {};
      }
      config.cliproxy.auth.management_secret = 'my-custom-key';
    });
    invalidateConfigCache();

    printControlPanelAccess(8317);
    const out = lines.join('\n');
    expect(out).toContain('Panel login key:');
    expect(out).toContain('my-custom-key');
  });
});
