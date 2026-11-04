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
  triggerReapplyManagedDrainOrders,
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

  it('automatically restores priorities after registerAccount completes re-auth for a pooled account', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-drain-reauth-'));
    try {
      await runWithScopedCcsHome(tempHome, async () => {
        const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

        writeAuthFile(authDir, 'antigravity-1.json', {
          email: 'user1@x.com',
          type: 'antigravity',
          priority: 100,
        });
        writeAuthFile(authDir, 'antigravity-2.json', {
          email: 'user2@x.com',
          type: 'antigravity',
          priority: 50,
        });

        await discoverExistingAccounts();

        // Stored manual drain order: user1 first, then user2
        saveDrainOrderConfig('agy', { mode: 'manual', orderedIds: ['user1@x.com', 'user2@x.com'] });

        // Simulate re-auth of user2: auth file refreshed without priority
        writeAuthFile(authDir, 'antigravity-2.json', { email: 'user2@x.com', type: 'antigravity' });
        expect(readAuthFilePriority('antigravity-2.json')).toBeUndefined();

        // Calling registerAccount (the actual token-manager/auth-handler completion path)
        registerAccount('agy', 'antigravity-2.json', 'user2@x.com');
        await triggerReapplyManagedDrainOrders();

        // Priority must be restored to user2's file automatically
        expect(readAuthFilePriority('antigravity-2.json')).toBeDefined();
        expect(readAuthFilePriority('antigravity-1.json')).toBeGreaterThan(
          readAuthFilePriority('antigravity-2.json')!
        );
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
