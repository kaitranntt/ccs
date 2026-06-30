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

mock.module('../../../cliproxy/proxy/proxy-detector', () => ({
  detectRunningProxy: async () => ({ running: false, verified: false }),
}));

describe('handleOrderSubcommand', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let logSpy: ReturnType<typeof spyOn>;
  let lines: string[];

  function authDir(): string {
    return path.join(tempHome, '.ccs', 'cliproxy', 'auth');
  }

  function writeAuthFile(fileName: string, fields: Record<string, unknown> = {}): void {
    fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(authDir(), fileName),
      JSON.stringify({ type: 'claude', ...fields }, null, 2),
      { mode: 0o600 }
    );
  }

  function readAuthFile(fileName: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(authDir(), fileName), 'utf-8')) as Record<
      string,
      unknown
    >;
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
    process.env.CCS_HOME = tempHome;
    process.exitCode = 0;
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') lines.push(msg);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.exitCode = 0;
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe('file-mode show with residual priorities', () => {
    it('renders selector pick order (priority desc) and flags drift instead of alphabetical order', async () => {
      // Residual on-disk priorities, no stored config -> file mode + drift.
      // claude-a sorts first alphabetically, but b has the higher priority, so
      // the selector drains b first. The display must follow the selector.
      writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 1 });
      writeAuthFile('claude-b.json', { email: 'b@x.com', priority: 5 });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');

      await runOrderSubcommand(['claude']);

      const output = lines.join('\n');
      // b@x.com (priority 5) must appear before a@x.com (priority 1).
      const idxB = output.indexOf('b@x.com');
      const idxA = output.indexOf('a@x.com');
      expect(idxB).toBeGreaterThanOrEqual(0);
      expect(idxA).toBeGreaterThan(idxB);

      // Drift surfaced (same as the manual/tier branch), and the mode label no
      // longer falsely claims "no priority set" under residual priorities.
      expect(output).toContain('Drift detected');
      expect(output).toContain('residual priorities present');
      expect(output).not.toContain('no priority set');
      // [priority: N] annotations preserved.
      expect(output).toContain('[priority: 5]');
      expect(output).toContain('[priority: 1]');
    });

    it('keeps the plain "no priority set" label and no drift when there are no residuals', async () => {
      writeAuthFile('claude-a.json', { email: 'a@x.com' });
      writeAuthFile('claude-b.json', { email: 'b@x.com' });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');

      await runOrderSubcommand(['claude']);

      const output = lines.join('\n');
      expect(output).toContain('no priority set');
      expect(output).not.toContain('Drift detected');
    });
  });

  describe('--reset clears residual priorities (proxy stopped -> direct write)', () => {
    it('removes the priority field from auth files and reports per-file results', async () => {
      writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 4 });
      writeAuthFile('claude-b.json', { email: 'b@x.com' }); // already clear

      const { registerAccount, saveDrainOrderConfig } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');
      registerAccount('claude', 'claude-b.json', 'b@x.com');
      saveDrainOrderConfig('claude', { mode: 'manual', orderedIds: ['a@x.com', 'b@x.com'] });

      await runOrderSubcommand(['claude', '--reset']);

      // Residual priority is actually gone from disk (not just config deleted).
      expect('priority' in readAuthFile('claude-a.json')).toBe(false);

      const output = lines.join('\n');
      expect(output).toContain('reset to file order');
      // Honest per-file reporting, and it no longer claims residuals remain.
      expect(output).toContain('Cleared residual priority from 1 auth file');
      expect(output).not.toContain('CLIProxy will continue using them');
    });

    it('reports already-clear files and still resets when no priorities exist', async () => {
      writeAuthFile('claude-a.json', { email: 'a@x.com' });

      const { registerAccount } = await registerClaude();
      registerAccount('claude', 'claude-a.json', 'a@x.com');

      await runOrderSubcommand(['claude', '--reset']);

      const output = lines.join('\n');
      expect(output).toContain('reset to file order');
      expect(output).toContain('no priority set');
    });
  });
});
