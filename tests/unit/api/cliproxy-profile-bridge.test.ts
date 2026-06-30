import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getEffectiveApiKey } from '../../../src/cliproxy/auth/auth-token-manager';
import {
  resolveCliproxyBridgeMetadata,
  resolveCliproxyBridgeProfile,
  suggestCliproxyBridgeName,
} from '../../../src/api/services/cliproxy-profile-bridge';
import { invalidateConfigCache } from '../../../src/config/config-loader-facade';
import { clearConfigCache } from '../../../src/cliproxy/config/base-config-loader';

describe('cliproxy-profile-bridge', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-bridge-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    invalidateConfigCache();
    clearConfigCache();

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  function writeBackendConfig(backend: 'original' | 'plus'): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 1', 'cliproxy:', `  backend: ${backend}`, ''].join('\n'),
      'utf8'
    );
    invalidateConfigCache();
    clearConfigCache();
  }

  it('resolves routed profile payload for a local original-backend CLIProxy provider', () => {
    const bridge = resolveCliproxyBridgeProfile('gemini');

    expect(bridge.name).toBe('gemini-api');
    expect(bridge.baseUrl).toBe('http://127.0.0.1:8317/');
    expect(bridge.routePath).toBe('/');
    expect(bridge.models.default.length).toBeGreaterThan(0);
  });

  it('suggests a unique name when the default bridge settings file already exists', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'gemini-api.settings.json'), '{}\n');

    expect(suggestCliproxyBridgeName('gemini')).toBe('gemini-api-2');
  });

  it('detects CLIProxy-backed profile metadata and normalizes localhost loopback URLs', () => {
    writeBackendConfig('plus');
    const metadata = resolveCliproxyBridgeMetadata({
      env: {
        ANTHROPIC_BASE_URL: 'http://localhost:8317/api/provider/gemini',
        ANTHROPIC_AUTH_TOKEN: getEffectiveApiKey(),
      },
    });

    expect(metadata?.provider).toBe('gemini');
    expect(metadata?.usesCurrentTarget).toBe(true);
    expect(metadata?.usesCurrentAuthToken).toBe(true);
  });
});
