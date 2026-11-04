import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  saveDrainOrderConfig,
  loadDrainOrderConfig,
  discoverExistingAccounts,
  registerAccount,
  setAccountTier,
} from '../registry';
import { readAuthFilePriority } from '../drain-order';
import { runWithScopedCcsHome } from '../../../utils/config-manager';

function writeAuthFile(authDir: string, fileName: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(authDir, fileName), JSON.stringify(content, null, 2), 'utf8');
}

describe('End-to-end automatic drain order re-apply after discovery/sync and re-auth', () => {
  it('automatically restores effective priorities through discoverExistingAccounts alone, preserving tiers and idempotency', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-drain-e2e-'));
    try {
      await runWithScopedCcsHome(tempHome, async () => {
        const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

        // 1. Setup accounts with tiers
        writeAuthFile(authDir, 'antigravity-pro.json', {
          email: 'pro@x.com',
          type: 'antigravity',
          tier: 'pro',
          priority: 100,
        });
        writeAuthFile(authDir, 'antigravity-free.json', {
          email: 'free@x.com',
          type: 'antigravity',
          tier: 'free',
          priority: 50,
        });

        // Initial discovery
        await discoverExistingAccounts();
        setAccountTier('agy', 'pro@x.com', 'pro');
        setAccountTier('agy', 'free@x.com', 'free');

        // Configure tier drain order
        saveDrainOrderConfig('agy', { mode: 'tier' });
        const loadedConfig = loadDrainOrderConfig('agy');
        expect(loadedConfig?.mode).toBe('tier');

        // 2. Simulate re-auth stripping the priority field
        writeAuthFile(authDir, 'antigravity-pro.json', {
          email: 'pro@x.com',
          type: 'antigravity',
          tier: 'pro',
        });
        writeAuthFile(authDir, 'antigravity-free.json', {
          email: 'free@x.com',
          type: 'antigravity',
          tier: 'free',
        });

        expect(readAuthFilePriority('antigravity-pro.json')).toBeUndefined();
        expect(readAuthFilePriority('antigravity-free.json')).toBeUndefined();

        // 3. Run discoverExistingAccounts ALONE (awaiting the returned promise directly)
        await discoverExistingAccounts();

        // Priorities MUST be restored based on tier (pro rank > free rank)
        const proPriority = readAuthFilePriority('antigravity-pro.json');
        const freePriority = readAuthFilePriority('antigravity-free.json');

        expect(proPriority).toBeDefined();
        expect(freePriority).toBeDefined();
        expect(proPriority!).toBeGreaterThan(freePriority!);

        // 4. Idempotency: second discovery run does not alter already-correct files
        const proMtimeBefore = fs.statSync(path.join(authDir, 'antigravity-pro.json')).mtimeMs;
        const freeMtimeBefore = fs.statSync(path.join(authDir, 'antigravity-free.json')).mtimeMs;

        await discoverExistingAccounts();

        const proMtimeAfter = fs.statSync(path.join(authDir, 'antigravity-pro.json')).mtimeMs;
        const freeMtimeAfter = fs.statSync(path.join(authDir, 'antigravity-free.json')).mtimeMs;

        expect(proMtimeAfter).toBe(proMtimeBefore);
        expect(freeMtimeAfter).toBe(freeMtimeBefore);
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('preserves existingAccount.tier and restores tier priorities after registerAccount completes re-auth alone', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-drain-tier-reauth-'));
    try {
      await runWithScopedCcsHome(tempHome, async () => {
        const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

        writeAuthFile(authDir, 'antigravity-pro.json', { email: 'pro@x.com', type: 'antigravity' });
        writeAuthFile(authDir, 'antigravity-free.json', {
          email: 'free@x.com',
          type: 'antigravity',
        });

        await discoverExistingAccounts();
        setAccountTier('agy', 'pro@x.com', 'pro');
        setAccountTier('agy', 'free@x.com', 'free');

        // Configure tier drain order
        saveDrainOrderConfig('agy', { mode: 'tier' });
        await discoverExistingAccounts();

        expect(readAuthFilePriority('antigravity-pro.json')).toBeGreaterThan(
          readAuthFilePriority('antigravity-free.json')!
        );

        // Simulate re-auth of the pro account: file overwritten without priority
        writeAuthFile(authDir, 'antigravity-pro.json', { email: 'pro@x.com', type: 'antigravity' });
        expect(readAuthFilePriority('antigravity-pro.json')).toBeUndefined();

        // registerAccount is invoked during re-auth (e.g. by token-manager / auth-handler)
        const account = registerAccount('agy', 'antigravity-pro.json', 'pro@x.com');
        expect(account.tier).toBe('pro');

        // Await the actual scheduled operation returned on the registered account object
        const scheduledOperation = account.scheduledDrainOrderPromise;
        expect(scheduledOperation).toBeDefined();
        await scheduledOperation;

        // Priority must be restored matching the pro tier without dropping to unknown/zero
        const restoredProPriority = readAuthFilePriority('antigravity-pro.json');
        expect(restoredProPriority).toBeDefined();
        expect(restoredProPriority!).toBeGreaterThan(
          readAuthFilePriority('antigravity-free.json')!
        );
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
