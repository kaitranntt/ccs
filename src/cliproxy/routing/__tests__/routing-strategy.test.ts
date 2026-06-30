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
    routingTarget = {
      host: '127.0.0.1',
      port: 8317,
      protocol: 'http',
      isRemote: false,
    };
    responseFactory = null;
    originalCcsDir = process.env.CCS_DIR;
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_DIR = scopedConfigDir;
    process.env.CCS_HOME = tempHome;

    ({ runWithScopedConfigDir } = await import('../../../utils/config-manager'));
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
    mock.module('../routing-strategy-http', () => ({
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

    return import(`../routing-strategy?test=${Date.now()}-${Math.random()}`);
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
      const { mutateUnifiedConfig } = await import('../../../config/unified-config-loader');
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

      const { loadUnifiedConfig } = await import('../../../config/unified-config-loader');
      const persisted = loadUnifiedConfig();
      expect(persisted?.cliproxy?.routing?.strategy).toBe('fill-first');
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

  it('normalizes session-affinity booleans and TTL values', async () => {
    await withScopedConfig(async () => {
      const mod = await loadRoutingModule();

      expect(mod.normalizeCliproxySessionAffinityEnabled(true)).toBe(true);
      expect(mod.normalizeCliproxySessionAffinityEnabled('on')).toBe(true);
      expect(mod.normalizeCliproxySessionAffinityEnabled('false')).toBe(false);
      expect(mod.normalizeCliproxySessionAffinityEnabled('maybe')).toBeNull();

      expect(mod.normalizeCliproxySessionAffinityTtl('1h')).toBe('1h');
      expect(mod.normalizeCliproxySessionAffinityTtl('2h30m')).toBe('2h30m');
      expect(mod.normalizeCliproxySessionAffinityTtl('  15m  ')).toBe('15m');
      expect(mod.normalizeCliproxySessionAffinityTtl('0s')).toBeNull();
      expect(mod.normalizeCliproxySessionAffinityTtl('tomorrow')).toBeNull();
    });
  });

  it('reads saved local session-affinity settings when live CLIProxy is unavailable', async () => {
    await withScopedConfig(async () => {
      const { mutateUnifiedConfig } = await import('../../../config/unified-config-loader');
      mutateUnifiedConfig((config) => {
        if (config.cliproxy) {
          config.cliproxy.routing = {
            strategy: 'round-robin',
            session_affinity: true,
            session_affinity_ttl: '2h30m',
          };
        }
      });

      const mod = await loadRoutingModule();
      const state = await mod.readCliproxySessionAffinityState();

      expect(state.enabled).toBe(true);
      expect(state.ttl).toBe('2h30m');
      expect(state.source).toBe('config');
      expect(state.target).toBe('local');
      expect(state.manageable).toBe(true);
      expect(state.reachable).toBe(false);
    });
  });

  it('persists local session-affinity settings even when live CLIProxy is unavailable', async () => {
    await withScopedConfig(async () => {
      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxySessionAffinitySettings({
        enabled: true,
        ttl: '2h',
      });

      expect(result.applied).toBe('config-only');
      expect(result.enabled).toBe(true);
      expect(result.ttl).toBe('2h');

      const { loadUnifiedConfig } = await import('../../../config/unified-config-loader');
      const persisted = loadUnifiedConfig();
      expect(persisted?.cliproxy?.routing?.session_affinity).toBe(true);
      expect(persisted?.cliproxy?.routing?.session_affinity_ttl).toBe('2h');
    });
  });

  it('does not claim live session-affinity application just because local CLIProxy is reachable', async () => {
    await withScopedConfig(async () => {
      responseFactory = async () =>
        new Response(JSON.stringify({ strategy: 'round-robin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxySessionAffinitySettings({
        enabled: true,
        ttl: '30m',
      });

      expect(result.reachable).toBe(true);
      expect(result.applied).toBe('config-only');
      expect(result.message).toContain('does not verify live selector state yet');
    });
  });

  it('reports remote session-affinity management as unsupported', async () => {
    await withScopedConfig(async () => {
      routingTarget = {
        host: 'remote.example.com',
        port: 8080,
        protocol: 'http',
        isRemote: true,
      };

      responseFactory = async () =>
        new Response(JSON.stringify({ strategy: 'round-robin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const mod = await loadRoutingModule();
      const state = await mod.readCliproxySessionAffinityState();

      expect(state.source).toBe('unsupported');
      expect(state.target).toBe('remote');
      expect(state.manageable).toBe(false);
      expect(state.reachable).toBe(true);
      expect(state.enabled).toBeUndefined();

      const result = await mod.applyCliproxySessionAffinitySettings({
        enabled: true,
        ttl: '1h',
      });

      expect(result.applied).toBe('unsupported');
      expect(result.manageable).toBe(false);
    });
  });

  it('reports unsupported remote session-affinity as unreachable when remote routing probe fails', async () => {
    await withScopedConfig(async () => {
      routingTarget = {
        host: 'remote.example.com',
        port: 8080,
        protocol: 'http',
        isRemote: true,
      };
      responseFactory = null;

      const mod = await loadRoutingModule();
      const state = await mod.readCliproxySessionAffinityState();

      expect(state.source).toBe('unsupported');
      expect(state.reachable).toBe(false);
      expect(state.message).toContain('not reachable');
    });
  });

  // PR #1514 fix index 2: for a remote target, readCliproxyRoutingState must NOT
  // present the local pool flag as if it described the remote proxy. It surfaces
  // manageable:false + a message, mirroring the session-affinity remote handling.
  it('marks remote pool routing as not manageable (local flag does not describe the remote proxy)', async () => {
    await withScopedConfig(async () => {
      routingTarget = {
        host: 'remote.example.com',
        port: 8080,
        protocol: 'http',
        isRemote: true,
      };
      responseFactory = async () =>
        new Response(JSON.stringify({ strategy: 'round-robin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      // Enable the LOCAL pool flag — the remote proxy must still report not-manageable.
      const { mutateUnifiedConfig } = await import('../../../config/unified-config-loader');
      mutateUnifiedConfig((config) => {
        if (config.cliproxy) {
          config.cliproxy.pool_routing = { enabled: true, max_retry_credentials: 3 };
        }
      });

      const mod = await loadRoutingModule();
      const state = await mod.readCliproxyRoutingState();

      expect(state.target).toBe('remote');
      expect(state.poolRouting?.manageable).toBe(false);
      expect(state.poolRouting?.message).toContain('remote proxy');
    });
  });

  // PR #1514 fix index 14 (backend): when local pool routing is enabled, the apply
  // result message must carry the pool-override note so API/dashboard consumers see
  // the same caveat the CLI prints.
  it('appends a pool-active override note to local strategy apply when pool routing is on', async () => {
    await withScopedConfig(async () => {
      const { mutateUnifiedConfig } = await import('../../../config/unified-config-loader');
      mutateUnifiedConfig((config) => {
        if (config.cliproxy) {
          config.cliproxy.pool_routing = { enabled: true, max_retry_credentials: 3 };
        }
      });

      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxyRoutingStrategy('round-robin');

      expect(result.message).toContain('Pool routing is active');
      expect(result.message).toContain('ccs cliproxy pool --disable');
    });
  });

  it('appends a pool-active override note to local affinity apply when pool routing is on', async () => {
    await withScopedConfig(async () => {
      const { mutateUnifiedConfig } = await import('../../../config/unified-config-loader');
      mutateUnifiedConfig((config) => {
        if (config.cliproxy) {
          config.cliproxy.pool_routing = { enabled: true, max_retry_credentials: 3 };
        }
      });

      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxySessionAffinitySettings({ enabled: true, ttl: '1h' });

      expect(result.message).toContain('Pool routing is active');
      expect(result.message).toContain('ccs cliproxy pool --disable');
    });
  });

  // Without pool routing, the apply message must NOT carry the override note.
  it('does not append the pool-override note when pool routing is off', async () => {
    await withScopedConfig(async () => {
      const mod = await loadRoutingModule();
      const result = await mod.applyCliproxyRoutingStrategy('fill-first');
      expect(result.message).not.toContain('Pool routing is active');
    });
  });
});
