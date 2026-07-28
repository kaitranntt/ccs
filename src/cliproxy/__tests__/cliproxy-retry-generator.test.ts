/**
 * CLIProxy request-retry config — generator tests.
 *
 * Covers:
 *   1. Unset retry config produces today's exact request-retry/max-retry-interval bytes (0/0).
 *   2. Configured retry values are emitted verbatim into the generated CLIProxy config.yaml.
 *   3. Invalid persisted values (negative/non-integer) fall back to 0, matching the
 *      unset default (defensive: a corrupt config.yaml must not crash the generator).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

function createTestHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-retry-test-'));
  const ccsDir = path.join(dir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'version: 1\n', 'utf8');
  return dir;
}

describe('CLIProxy retry config — generator', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function regenerate(tag: string): string {
    return path.join(tempHome, '.ccs', 'cliproxy', `config-${tag}.yaml`);
  }

  it("unset retry config emits request-retry: 0 and max-retry-interval: 0 (today's default)", async () => {
    const { regenerateConfig } = await import(`../config/generator?crgen1=${Date.now()}`);
    const configPath = regenerate('unset');
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    regenerateConfig(8317, { configPath, authDir });

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('request-retry: 0');
    expect(content).toContain('max-retry-interval: 0');
  });

  it('unset retry config produces byte-identical output to an explicit 0/0 config', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?crgen2a=${Date.now()}`
    );
    const { regenerateConfig } = await import(`../config/generator?crgen2a=${Date.now()}`);

    const unsetPath = regenerate('unset-baseline');
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(unsetPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });
    regenerateConfig(8317, { configPath: unsetPath, authDir });
    const unsetContent = fs.readFileSync(unsetPath, 'utf-8');

    mutateConfig((cfg: { cliproxy?: { retry?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.retry = { request_retry: 0, max_retry_interval: 0 };
    });
    invalidateConfigCache();

    const explicitPath = regenerate('explicit-zero');
    regenerateConfig(8317, { configPath: explicitPath, authDir });
    const explicitContent = fs.readFileSync(explicitPath, 'utf-8');

    const stripTimestamp = (s: string) => s.replace(/# Generated: .+/g, '# Generated: TIMESTAMP');
    expect(stripTimestamp(explicitContent)).toBe(stripTimestamp(unsetContent));
  });

  it('configured retry values are emitted into the generated config', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?crgen3=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { retry?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.retry = { request_retry: 3, max_retry_interval: 30 };
    });
    invalidateConfigCache();

    const { regenerateConfig } = await import(`../config/generator?crgen3=${Date.now()}`);
    const configPath = regenerate('configured');
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    regenerateConfig(8317, { configPath, authDir });

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('request-retry: 3');
    expect(content).toContain('max-retry-interval: 30');
  });

  it('only request_retry set falls back to 0 for max_retry_interval', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?crgen4=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { retry?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.retry = { request_retry: 5 };
    });
    invalidateConfigCache();

    const { regenerateConfig } = await import(`../config/generator?crgen4=${Date.now()}`);
    const configPath = regenerate('partial');
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    regenerateConfig(8317, { configPath, authDir });

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('request-retry: 5');
    expect(content).toContain('max-retry-interval: 0');
  });

  it('a negative persisted request_retry falls back to 0 (defensive, does not throw)', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?crgen5=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { retry?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.retry = { request_retry: -1, max_retry_interval: 2.5 };
    });
    invalidateConfigCache();

    const { regenerateConfig } = await import(`../config/generator?crgen5=${Date.now()}`);
    const configPath = regenerate('invalid');
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    expect(() => regenerateConfig(8317, { configPath, authDir })).not.toThrow();

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('request-retry: 0');
    expect(content).toContain('max-retry-interval: 0');
  });
});
