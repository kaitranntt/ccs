import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'bun:test';
import { ensureDockerCliproxyAuth } from '../../../src/docker/docker-bootstrap';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../../src/config/config-loader-facade';
import {
  CCS_CONTROL_PANEL_SECRET,
  CCS_INTERNAL_API_KEY,
  generateConfig,
  regenerateConfig,
} from '../../../src/cliproxy/config/config-generator';
import { CLIPROXY_DEFAULT_PORT } from '../../../src/cliproxy/config/port-manager';
import { getConfigPathForPort } from '../../../src/cliproxy/config/path-resolver';
import {
  DOCKER_BOOTSTRAP_STATE_FILENAME,
  DOCKER_LEGACY_API_KEY,
  getDockerBootstrapStatePath,
  parseDockerLegacyKeyGraceDays,
  readDockerBootstrapState,
} from '../../../src/docker/docker-key-rotation';

const originalCcsHome = process.env.CCS_HOME;
const originalGraceDays = process.env.CCS_DOCKER_LEGACY_KEY_GRACE_DAYS;
const originalRestoreLegacyKey = process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY;
const originalEnableLegacyKeyAuth = process.env.CCS_DOCKER_ENABLE_LEGACY_KEY_AUTH;
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
  if (originalGraceDays === undefined) {
    delete process.env.CCS_DOCKER_LEGACY_KEY_GRACE_DAYS;
  } else {
    process.env.CCS_DOCKER_LEGACY_KEY_GRACE_DAYS = originalGraceDays;
  }
  if (originalRestoreLegacyKey === undefined) {
    delete process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY;
  } else {
    process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY = originalRestoreLegacyKey;
  }
  if (originalEnableLegacyKeyAuth === undefined) {
    delete process.env.CCS_DOCKER_ENABLE_LEGACY_KEY_AUTH;
  } else {
    process.env.CCS_DOCKER_ENABLE_LEGACY_KEY_AUTH = originalEnableLegacyKeyAuth;
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
    expect(readDockerBootstrapState().state?.legacyKeyGrace).toBeUndefined();
  });

  it('keeps fresh generated CLIProxy config free of the legacy key', () => {
    useTempCcsHome();

    ensureDockerCliproxyAuth();
    const configPath = generateConfig('gemini', CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(content).not.toContain(DOCKER_LEGACY_API_KEY);
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
    expect(readDockerBootstrapState().state?.legacyKeyGrace).toBeUndefined();
  });

  it('tracks legacy key grace but does not enable it in config by default', () => {
    useTempCcsHome();
    mutateConfig((config) => {
      config.cliproxy.auth = {
        api_key: CCS_INTERNAL_API_KEY,
        management_secret: CCS_CONTROL_PANEL_SECRET,
      };
    });

    const changed = ensureDockerCliproxyAuth();
    const config = loadOrCreateUnifiedConfig();
    const configPath = regenerateConfig(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');
    const state = readDockerBootstrapState().state;

    expect(changed).toBe(true);
    expect(config.cliproxy.auth?.api_key).not.toBe(CCS_INTERNAL_API_KEY);
    expect(state?.legacyKeyGrace?.legacyKey).toBe(CCS_INTERNAL_API_KEY);
    expect(state?.legacyKeyGrace?.replacementKey).toBe(config.cliproxy.auth?.api_key);
    expect(content).toContain(`"${config.cliproxy.auth?.api_key}"`);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });

  it('honors CCS_DOCKER_LEGACY_KEY_GRACE_DAYS for upgrade expiry', () => {
    useTempCcsHome();
    process.env.CCS_DOCKER_LEGACY_KEY_GRACE_DAYS = '1';
    mutateConfig((config) => {
      config.cliproxy.auth = { api_key: CCS_INTERNAL_API_KEY };
    });

    ensureDockerCliproxyAuth();
    const state = readDockerBootstrapState().state;
    const startedAt = Date.parse(state?.legacyKeyGrace?.startedAt ?? '');
    const expiresAt = Date.parse(state?.legacyKeyGrace?.expiresAt ?? '');

    expect(parseDockerLegacyKeyGraceDays()).toBe(1);
    expect(expiresAt - startedAt).toBe(24 * 60 * 60 * 1000);
  });

  it('drops the legacy key when the grace window has already expired', () => {
    useTempCcsHome();
    process.env.CCS_DOCKER_LEGACY_KEY_GRACE_DAYS = '0';
    mutateConfig((config) => {
      config.cliproxy.auth = { api_key: CCS_INTERNAL_API_KEY };
    });

    ensureDockerCliproxyAuth();
    const configPath = regenerateConfig(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(content).not.toContain(CCS_INTERNAL_API_KEY);
  });

  it('does not auto-add the legacy key for custom generated-looking API keys', () => {
    useTempCcsHome();
    const generatedLookingCustomKey = 'A'.repeat(43);
    mutateConfig((config) => {
      config.cliproxy.auth = {
        api_key: generatedLookingCustomKey,
        management_secret: 'custom-management-secret',
      };
    });
    generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

    const changed = ensureDockerCliproxyAuth();
    const content = readFileSync(getConfigPathForPort(CLIPROXY_DEFAULT_PORT), 'utf8');

    expect(changed).toBe(false);
    expect(content).toContain(`"${generatedLookingCustomKey}"`);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });

  it('restores the legacy key for already-broken random-key installs when explicitly requested', () => {
    useTempCcsHome();
    process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY = '1';
    const generatedKey = 'A'.repeat(43);
    mutateConfig((config) => {
      config.cliproxy.auth = {
        api_key: generatedKey,
        management_secret: 'custom-management-secret',
      };
    });
    generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

    const changed = ensureDockerCliproxyAuth();
    const configPath = regenerateConfig(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(changed).toBe(true);
    expect(content).toContain(`"${generatedKey}"`);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });

  it('restores the legacy key after an earlier run wrote a no-grace marker', () => {
    useTempCcsHome();
    const generatedKey = 'C'.repeat(43);
    mutateConfig((config) => {
      config.cliproxy.auth = {
        api_key: generatedKey,
        management_secret: 'custom-management-secret',
      };
    });
    generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

    expect(ensureDockerCliproxyAuth()).toBe(false);
    expect(readDockerBootstrapState().state?.legacyKeyGrace).toBeUndefined();

    process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY = '1';
    const changed = ensureDockerCliproxyAuth();
    const configPath = regenerateConfig(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(changed).toBe(true);
    expect(content).toContain(`"${generatedKey}"`);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });

  it('recovers safely from a corrupted marker file during broken-install recovery', () => {
    useTempCcsHome();
    process.env.CCS_DOCKER_RESTORE_LEGACY_API_KEY = '1';
    const generatedKey = 'B'.repeat(43);
    mutateConfig((config) => {
      config.cliproxy.auth = { api_key: generatedKey };
    });
    generateConfig('gemini', CLIPROXY_DEFAULT_PORT);
    mkdirSync(join(getDockerBootstrapStatePath(), '..'), { recursive: true });
    writeFileSync(getDockerBootstrapStatePath(), '{not-json');

    ensureDockerCliproxyAuth();
    const configPath = regenerateConfig(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(getDockerBootstrapStatePath()).toContain(DOCKER_BOOTSTRAP_STATE_FILENAME);
    expect(readDockerBootstrapState().corrupted).toBe(false);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });

  it('does not treat human custom keys as broken Docker-generated keys', () => {
    useTempCcsHome();
    mutateConfig((config) => {
      config.cliproxy.auth = { api_key: 'custom-human-key' };
    });
    generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

    const changed = ensureDockerCliproxyAuth();
    const configPath = getConfigPathForPort(CLIPROXY_DEFAULT_PORT);
    const content = readFileSync(configPath, 'utf8');

    expect(changed).toBe(true);
    expect(content).not.toContain(`"${CCS_INTERNAL_API_KEY}"`);
  });
});
