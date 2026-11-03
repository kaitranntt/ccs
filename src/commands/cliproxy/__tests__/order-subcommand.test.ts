/**
 * Tests for handleOrderSubcommand presentation + reset behavior.
 *
 * Why these matter:
 *  - File-mode SHOW must render from the shared resolver (selector pick order +
 *    drift), not an alphabetical re-sort. Otherwise the displayed order is the
 *    inverse of what CLIProxy actually drains whenever residual on-disk
 *    priorities exist (e.g. left by a prior managed order), and the drift
 *    warning the manual/tier branch shows is silently dropped.
 *  - `--reset` must actually strip residual priorities from the auth files, not
 *    just delete the stored config. With the proxy STOPPED the field is removed
 *    by a direct atomic write; the running-proxy PATCH path is covered at the
 *    clearDrainOrderPriorities unit level (drain-order.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { invalidateConfigCache as resetUnifiedConfigCache } from '../../../config/config-loader-facade';

mock.module('../../../cliproxy/proxy/proxy-detector', () => ({
  detectRunningProxy: async () => ({ running: false, verified: false }),
  waitForProxyHealthy: async () => ({ running: false, verified: false }),
  reclaimOrphanedProxy: () => {},
}));

describe('handleOrderSubcommand', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalNoColor: string | undefined;
  let logSpy: ReturnType<typeof spyOn>;
  let lines: string[];

  function authDir(): string {
    return path.join(tempHome, '.ccs', 'cliproxy', 'auth');
  }

  function writeAuthFile(fileName: string, fields: Record<string, unknown> = {}): void {
    fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(authDir(), fileName),
      JSON.stringify({ type: 'claude', email: fileName, ...fields }, null, 2),
      { mode: 0o600 }
    );
  }

  function writeAgyAuthFile(fileName: string, fields: Record<string, unknown> = {}): void {
    fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(authDir(), fileName),
      JSON.stringify({ type: 'antigravity', email: fileName, ...fields }, null, 2),
      { mode: 0o600 }
    );
  }

  function readAuthFile(fileName: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(authDir(), fileName), 'utf-8')) as Record<
      string,
      unknown
    >;
  }

  async function loadRegistry() {
    return import(`../../../cliproxy/accounts/registry?order-subcommand-reg=${Date.now()}`);
  }

  async function configureBackend(backend: 'original' | 'plus', version: string): Promise<void> {
    const { mutateConfig, invalidateConfigCache } = await import(
      '../../../config/config-loader-facade'
    );
    mutateConfig((cfg) => {
      if (!cfg.cliproxy) cfg.cliproxy = {};
      cfg.cliproxy.backend = backend;
    });
    invalidateConfigCache();
    const verPath = path.join(tempHome, '.ccs', 'cliproxy', 'bin', backend, '.version');
    fs.mkdirSync(path.dirname(verPath), { recursive: true });
    fs.writeFileSync(verPath, version.trim() + '\n', 'utf-8');
  }

  async function registerClaude(): Promise<{
    registerAccount: (provider: string, tokenFile: string, email: string) => unknown;
    saveDrainOrderConfig: (provider: string, config: unknown) => boolean;
  }> {
    return import(`../../../cliproxy/accounts/registry?order-subcommand=${Date.now()}`);
  }

  async function runOrderSubcommand(args: string[]): Promise<void> {
    const { handleOrderSubcommand } = await import(
      `../order-subcommand?order-subcommand=${Date.now()}`
    );
    await handleOrderSubcommand(args);
  }

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-order-subcommand-'));
    originalCcsHome = process.env.CCS_HOME;
    originalNoColor = process.env.NO_COLOR;
    process.env.CCS_HOME = tempHome;
    resetUnifiedConfigCache();
    process.env.NO_COLOR = '1';
    process.exitCode = 0;
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') lines.push(msg);
    });
  });

  afterEach(() => {
    resetUnifiedConfigCache();
    logSpy.mockRestore();
    process.exitCode = 0;
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe('file-mode show with residual priorities', () => {
    it('renders selector pick order (priority desc) and flags drift instead of alphabetical order', async () => {
      // Explicit below-minimum version to prove show is ungated on old binaries.
      await configureBackend('original', '6.6.105');
      writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 1 });
      writeAuthFile('claude-b.json', { email: 'b@x.com', priority: 5 });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');

      await runOrderSubcommand(['claude']);
      expect(process.exitCode).toBe(0);

      const output = lines.join('\n');
      // b@x.com (priority 5) must appear before a@x.com (priority 1).
      const idxB = output.indexOf('b@x.com');
      const idxA = output.indexOf('a@x.com');
      expect(idxB).toBeGreaterThanOrEqual(0);
      expect(idxA).toBeGreaterThan(idxB);

      // Drift surfaced (same as the manual/tier branch), and the mode label no
      expect(output).toContain('Drift detected');
      expect(output).toContain('residual priorities present');
      expect(output).not.toContain('no priority set');
      // [priority: N] annotations preserved.
      expect(output).toContain('[priority: 5]');
      expect(output).toContain('[priority: 1]');
    });

    it('keeps the plain "no priority set" label and no drift when there are no residuals', async () => {
      // Explicit below-minimum version on Plus to prove show is ungated on old binaries.
      await configureBackend('plus', '6.6.105-0');
      writeAuthFile('claude-a.json', { email: 'a@x.com' });
      writeAuthFile('claude-b.json', { email: 'b@x.com' });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');

      await runOrderSubcommand(['claude']);
      expect(process.exitCode).toBe(0);

      const output = lines.join('\n');
      expect(output).toContain('no priority set');
      expect(output).not.toContain('Drift detected');
    });
  });

  describe('--reset clears residual priorities (proxy stopped -> direct write)', () => {
    it('preserves quota policy ownership when a remote reset is refused', async () => {
      writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 4 });
      const registry = await loadRegistry();
      registry.registerAccount('claude', 'claude-a.json', 'a@x.com');
      registry.saveDrainOrderConfig('claude', { mode: 'quota' });
      const { mutateConfig, invalidateConfigCache } = await import(
        '../../../config/config-loader-facade'
      );
      mutateConfig((config) => {
        config.cliproxy_server = {
          ...config.cliproxy_server!,
          remote: { ...config.cliproxy_server!.remote, enabled: true, host: 'proxy.example.test' },
        };
      });
      invalidateConfigCache();
      await runOrderSubcommand(['claude', '--reset']);
      expect(process.exitCode).toBe(1);
      expect(registry.loadDrainOrderConfig('claude')?.mode).toBe('quota');
      expect(readAuthFile('claude-a.json').priority).toBe(4);
      expect(fs.existsSync(path.join(tempHome, '.ccs', 'cache', 'claude-pool-order.json'))).toBe(
        false
      );
    });

    it('removes the priority field from auth files and reports per-file results', async () => {
      // Explicit below-minimum version to prove reset is ungated on old binaries.
      await configureBackend('original', '6.6.105');
      writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 4 });
      writeAuthFile('claude-b.json', { email: 'b@x.com' }); // already clear

      const { registerAccount, saveDrainOrderConfig } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');
      saveDrainOrderConfig('claude', { mode: 'manual', orderedIds: ['a@x.com', 'b@x.com'] });

      await runOrderSubcommand(['claude', '--reset']);
      expect(process.exitCode).toBe(0);

      // Residual priority is actually gone from disk (not just config deleted).
      expect('priority' in readAuthFile('claude-a.json')).toBe(false);

      const output = lines.join('\n');
      expect(output).toContain('reset to file order');
      // Honest per-file reporting, and it no longer claims residuals remain.
      expect(output).toContain('Cleared residual priority from 1 auth file');
      expect(output).not.toContain('CLIProxy will continue using them');
    });

    it('reports already-clear files and still resets when no priorities exist', async () => {
      // Explicit below-minimum version on Plus to prove reset is ungated on old binaries.
      await configureBackend('plus', '6.6.105-0');
      writeAuthFile('claude-a.json', { email: 'a@x.com' });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');

      await runOrderSubcommand(['claude', '--reset']);
      expect(process.exitCode).toBe(0);

      const output = lines.join('\n');
      expect(output).toContain('reset to file order');
      expect(output).toContain('no priority set');
    });
  });

  describe('binary version capability gate (#1724)', () => {
    const cases: Array<{
      backend: 'original' | 'plus';
      belowMinVersion: string;
      atMinVersion: string;
      backendLabel: string;
      requiredMinVersion: string;
    }> = [
      {
        backend: 'original',
        belowMinVersion: '6.6.105',
        atMinVersion: '6.6.106',
        backendLabel: 'CLIProxy',
        requiredMinVersion: '6.6.106',
      },
      {
        backend: 'plus',
        belowMinVersion: '6.6.105-0',
        atMinVersion: '6.6.107-0',
        backendLabel: 'CLIProxy Plus',
        requiredMinVersion: '6.6.107-0',
      },
    ];

    for (const {
      backend,
      belowMinVersion,
      atMinVersion,
      backendLabel,
      requiredMinVersion,
    } of cases) {
      describe(`${backend} backend`, () => {
        it(`refuses --set below minimum version (${belowMinVersion}) without mutating files`, async () => {
          await configureBackend(backend, belowMinVersion);
          writeAuthFile('claude-a.json', { email: 'a@x.com' });
          writeAuthFile('claude-b.json', { email: 'b@x.com' });

          const { registerAccount, loadDrainOrderConfig } = await loadRegistry();
          registerAccount('claude', 'claude-a.json', 'a@x.com');
          registerAccount('claude', 'claude-b.json', 'b@x.com');

          await runOrderSubcommand(['claude', '--set', 'a@x.com,b@x.com']);

          expect(process.exitCode).toBe(1);
          const output = lines.join('\n');
          expect(output).toContain('[X]');
          expect(output).toContain(
            `${backendLabel} v${belowMinVersion} does not support drain-order priorities (requires v${requiredMinVersion} or newer).`
          );
          expect(output).toContain(
            `Run 'ccs cliproxy --latest' to update, then restart with 'ccs cliproxy restart'.`
          );
          expect(output).not.toContain('Set priorities');
          expect('priority' in readAuthFile('claude-a.json')).toBe(false);
          expect('priority' in readAuthFile('claude-b.json')).toBe(false);
          expect(loadDrainOrderConfig('claude')).toBeUndefined();
        });

        it(`refuses --by-tier below minimum version (${belowMinVersion}) without mutating files`, async () => {
          await configureBackend(backend, belowMinVersion);
          writeAgyAuthFile('antigravity-a.json', { email: 'a@x.com' });
          writeAgyAuthFile('antigravity-b.json', { email: 'b@x.com' });

          const { registerAccount, setAccountTier, loadDrainOrderConfig } = await loadRegistry();
          registerAccount('agy', 'antigravity-a.json', 'a@x.com');
          registerAccount('agy', 'antigravity-b.json', 'b@x.com');
          setAccountTier('agy', 'a@x.com', 'pro');
          setAccountTier('agy', 'b@x.com', 'free');

          await runOrderSubcommand(['agy', '--by-tier']);

          expect(process.exitCode).toBe(1);
          const output = lines.join('\n');
          expect(output).toContain('[X]');
          expect(output).toContain(
            `${backendLabel} v${belowMinVersion} does not support drain-order priorities (requires v${requiredMinVersion} or newer).`
          );
          expect(output).toContain(
            `Run 'ccs cliproxy --latest' to update, then restart with 'ccs cliproxy restart'.`
          );
          expect(output).not.toContain('Set priorities');
          expect('priority' in readAuthFile('antigravity-a.json')).toBe(false);
          expect('priority' in readAuthFile('antigravity-b.json')).toBe(false);
          expect(loadDrainOrderConfig('agy')).toBeUndefined();
        });

        it(`applies and persists --set at minimum version (${atMinVersion})`, async () => {
          await configureBackend(backend, atMinVersion);
          writeAuthFile('claude-a.json', { email: 'a@x.com' });
          writeAuthFile('claude-b.json', { email: 'b@x.com' });

          const { registerAccount, loadDrainOrderConfig } = await loadRegistry();
          registerAccount('claude', 'claude-a.json', 'a@x.com');
          registerAccount('claude', 'claude-b.json', 'b@x.com');

          await runOrderSubcommand(['claude', '--set', 'a@x.com,b@x.com']);

          expect(process.exitCode).toBe(0);
          const output = lines.join('\n');
          expect(output).toContain('Set priorities for 2 account(s).');
          expect('priority' in readAuthFile('claude-a.json')).toBe(true);
          expect(loadDrainOrderConfig('claude')?.mode).toBe('manual');
        });

        it(`applies and persists --by-tier at minimum version (${atMinVersion})`, async () => {
          await configureBackend(backend, atMinVersion);
          writeAgyAuthFile('antigravity-a.json', { email: 'a@x.com' });
          writeAgyAuthFile('antigravity-b.json', { email: 'b@x.com' });

          const { registerAccount, setAccountTier, loadDrainOrderConfig } = await loadRegistry();
          registerAccount('agy', 'antigravity-a.json', 'a@x.com');
          registerAccount('agy', 'antigravity-b.json', 'b@x.com');
          setAccountTier('agy', 'a@x.com', 'pro');
          setAccountTier('agy', 'b@x.com', 'free');

          await runOrderSubcommand(['agy', '--by-tier']);

          expect(process.exitCode).toBe(0);
          const output = lines.join('\n');
          expect(output).toContain('Set priorities for 2 account(s).');
          expect('priority' in readAuthFile('antigravity-a.json')).toBe(true);
          expect(loadDrainOrderConfig('agy')?.mode).toBe('tier');
        });
      });
    }
  });
});
