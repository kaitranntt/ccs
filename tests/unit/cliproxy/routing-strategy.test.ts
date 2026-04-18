import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('cliproxy routing strategy service', () => {
  let tempHome = '';
  let scopedConfigDir = '';
  let originalCcsDir: string | undefined;
  let originalCcsHome: string | undefined;
  let runWithScopedConfigDir: <T>(ccsDir: string, fn: () => Promise<T> | T) => Promise<T>;
  let routingTarget = {
    host: '127.0.0.1',
    port: 8317,
    protocol: 'http' as const,
    isRemote: false,
  };
  let responseFactory: (() => Promise<Response>) | null = null;

  beforeEach(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-routing-strategy-'));
    scopedConfigDir = path.join(tempHome, '.ccs');
    originalCcsDir = process.env.CCS_DIR;
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_DIR = scopedConfigDir;
    process.env.CCS_HOME = tempHome;

    ({ runWithScopedConfigDir } = await import('../../../src/utils/config-manager'));
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  async function withScopedConfig<T>(fn: () => Promise<T> | T): Promise<T> {
    return await runWithScopedConfigDir(scopedConfigDir, fn);
  }

  async function loadRoutingModule() {
    mock.module('../../../src/cliproxy/routing-strategy-http', () => ({
      getCliproxyRoutingTarget: () => routingTarget,
      fetchCliproxyRoutingResponse: () => {
        if (!responseFactory) {
          throw new Error('routing unavailable');
        }
        return responseFactory();
      },
      getRoutingErrorMessage: async (response: Response, fallback: string) => {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        return body?.error || fallback;
      },
    }));

    return import(`../../../src/cliproxy/routing-strategy?test=${Date.now()}-${Math.random()}`);
  }

  it('normalizes canonical and shorthand strategy values', async () => {
    await withScopedConfig(async () => {
      const mod = await loadRoutingModule();

      expect(mod.normalizeCliproxyRoutingStrategy('round-robin')).toBe('round-robin');
      expect(mod.normalizeCliproxyRoutingStrategy('RR')).toBe('round-robin');
      expect(mod.normalizeCliproxyRoutingStrategy('fillfirst')).toBe('fill-first');
      expect(mod.normalizeCliproxyRoutingStrategy('ff')).toBe('fill-first');
      expect(mod.normalizeCliproxyRoutingStrategy('nope')).toBeNull();
    });
  });

  it('falls back to the saved local default when live CLIProxy is unavailable', async () => {
    await withScopedConfig(async () => {
      const { mutateUnifiedConfig } = await import('../../../src/config/unified-config-loader');
      mutateUnifiedConfig((config) => {
        if (config.cliproxy) {
          config.cliproxy.routing = { strategy: 'fill-first' };
        }
      });

      const mod = await loadRoutingModule();
      const state = await mod.readCliproxyRoutingState();

      expect(state.strategy).toBe('fill-first');
      expect(state.source).toBe('config');
      expect(state.target).toBe('local');
      expect(state.reachable).toBe(false);
    });
  });

  it('persists the local startup default even when the live proxy is down', async () => {
    await withScopedConfig(async () => {
      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxyRoutingStrategy('fill-first');

      expect(result.applied).toBe('config-only');
      expect(result.strategy).toBe('fill-first');

      const configPath = path.join(scopedConfigDir, 'cliproxy', 'config.yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      expect(configContent).toContain('routing:');
      expect(configContent).toContain('strategy: fill-first');
    });
  });

  it('reads and writes remote strategy without mutating the local default', async () => {
    await withScopedConfig(async () => {
      routingTarget = {
        host: 'remote.example.com',
        port: 8080,
        protocol: 'http',
        isRemote: true,
      };

      let methodCount = 0;
      responseFactory = async () => {
        methodCount += 1;
        return new Response(JSON.stringify({ strategy: 'fill-first' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const mod = await loadRoutingModule();
      const readState = await mod.readCliproxyRoutingState();
      const writeState = await mod.applyCliproxyRoutingStrategy('fill-first');

      expect(readState.strategy).toBe('fill-first');
      expect(readState.target).toBe('remote');
      expect(writeState.applied).toBe('live');
      expect(mod.getConfiguredCliproxyRoutingStrategy()).toBe('round-robin');
      expect(methodCount).toBe(2);
    });
  });
});
