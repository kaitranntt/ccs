import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'bun:test';
import { ensureDockerCliproxyAuth } from '../../../src/docker/docker-bootstrap';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../../src/config/config-loader-facade';
import {
  CCS_CONTROL_PANEL_SECRET,
  CCS_INTERNAL_API_KEY,
} from '../../../src/cliproxy/config/config-generator';

const originalCcsHome = process.env.CCS_HOME;
const tempDirs: string[] = [];

function useTempCcsHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ccs-docker-auth-'));
  tempDirs.push(dir);
  process.env.CCS_HOME = dir;
  return dir;
}

afterEach(() => {
  if (originalCcsHome === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = originalCcsHome;
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('docker bootstrap auth', () => {
  it('generates per-install CLIProxy secrets when Docker config has only defaults', () => {
    useTempCcsHome();

    const changed = ensureDockerCliproxyAuth();
    const config = loadOrCreateUnifiedConfig();

    expect(changed).toBe(true);
    expect(config.cliproxy.auth?.api_key).toBeTruthy();
    expect(config.cliproxy.auth?.management_secret).toBeTruthy();
    expect(config.cliproxy.auth?.api_key).not.toBe(CCS_INTERNAL_API_KEY);
    expect(config.cliproxy.auth?.management_secret).not.toBe(CCS_CONTROL_PANEL_SECRET);
    expect(config.cliproxy.auth?.api_key).not.toBe(config.cliproxy.auth?.management_secret);
  });

  it('preserves custom CLIProxy auth values for Docker deployments', () => {
    useTempCcsHome();
    mutateConfig((config) => {
      config.cliproxy.auth = {
        api_key: 'custom-api-key',
        management_secret: 'custom-management-secret',
      };
    });

    const changed = ensureDockerCliproxyAuth();
    const config = loadOrCreateUnifiedConfig();

    expect(changed).toBe(false);
    expect(config.cliproxy.auth?.api_key).toBe('custom-api-key');
    expect(config.cliproxy.auth?.management_secret).toBe('custom-management-secret');
  });
});
