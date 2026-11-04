import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  saveDrainOrderConfig,
  loadDrainOrderConfig,
  discoverExistingAccounts,
  loadAccountsRegistry,
} from '../registry';
import {
  applyDrainOrder,
  readAuthFilePriority,
  reapplyDrainOrderForProvider,
  reapplyAllManagedDrainOrders,
  resolveEffectiveDrainOrder,
} from '../drain-order';
import { runWithScopedCcsHome } from '../../../utils/config-manager';
import type { CLIProxyProvider } from '../../types';

function writeAuthFile(authDir: string, fileName: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(authDir, fileName), JSON.stringify(content, null, 2), 'utf8');
}

describe('reapplyDrainOrderForProvider after registry sync', () => {
  it('automatically restores effective priorities after token file re-write without watcher reload loop', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-drain-order-reapply-'));
    try {
      await runWithScopedCcsHome(tempHome, async () => {
        const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
        fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

        // 1. Setup accounts for agy (Antigravity)
        writeAuthFile(authDir, 'antigravity-a.json', {
          email: 'a@x.com',
          type: 'antigravity',
          priority: 100,
        });
        writeAuthFile(authDir, 'antigravity-b.json', {
          email: 'b@x.com',
          type: 'antigravity',
          priority: 50,
        });

        // Populate existing accounts
        discoverExistingAccounts();

        const drainOrderConfig = {
          mode: 'manual' as const,
          orderedIds: ['a@x.com', 'b@x.com'],
        };
        saveDrainOrderConfig('agy', drainOrderConfig);

        const loadedConfig = loadDrainOrderConfig('agy');
        expect(loadedConfig).toBeDefined();
        expect(loadedConfig?.orderedIds).toEqual(['a@x.com', 'b@x.com']);

        // 2. Simulate re-auth where priority was stripped by external token refresh
        writeAuthFile(authDir, 'antigravity-a.json', { email: 'a@x.com', type: 'antigravity' }); // priority absent!
        writeAuthFile(authDir, 'antigravity-b.json', { email: 'b@x.com', type: 'antigravity' }); // priority absent!

        expect(readAuthFilePriority('antigravity-a.json')).toBeUndefined();
        expect(readAuthFilePriority('antigravity-b.json')).toBeUndefined();

        // 3. Trigger registry sync with re-apply across all providers
        const registry = loadAccountsRegistry();
        const reapplyResult = await reapplyAllManagedDrainOrders(registry, false);
        expect(reapplyResult.agy).toBeDefined();
        expect(reapplyResult.agy.written).toHaveLength(2);

        // Verify priorities are restored to auth files
        expect(readAuthFilePriority('antigravity-a.json')).toBeGreaterThan(
          readAuthFilePriority('antigravity-b.json')
        );

        // 4. Idempotency test: subsequent re-apply performs ZERO writes (prevents reload loop)
        const secondReapply = await reapplyAllManagedDrainOrders(registry, false);
        expect(secondReapply.agy).toBeDefined();
        expect(secondReapply.agy.written).toHaveLength(0);
        expect(secondReapply.agy.skipped).toHaveLength(2);
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
