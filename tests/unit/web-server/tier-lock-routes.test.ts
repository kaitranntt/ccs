/**
 * Phase 2: tier-lock endpoint tests
 *
 * POST /api/accounts/tier-lock
 *   body: { tier: string|null, provider?: string }
 *
 * Tests:
 * - sets tier_lock in config and returns it
 * - clears tier_lock when tier is null
 * - rejects missing provider
 * - rejects invalid provider
 * - rejects unknown tier strings (typos must 400, not silently persist)
 * - persists across config reads (config write path) as per-provider map
 * - locking one provider does NOT affect another provider's lock entry
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';

async function postJson(baseUrl: string, routePath: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/accounts/tier-lock', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsUnified: string | undefined;

  beforeEach(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-tier-lock-routes-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsUnified = process.env.CCS_UNIFIED_CONFIG;

    process.env.CCS_HOME = tempHome;
    process.env.CCS_UNIFIED_CONFIG = '1';

    // No account-manager mock: the empty temp CCS_HOME yields zero CLIProxy
    // accounts naturally, and the tier-lock endpoint only validates the
    // provider id and writes config. Avoiding mock.module here is deliberate —
    // Bun's mock.restore() does NOT unwind mock.module, so a global account
    // manager mock would leak into later test files in the same process.
    const { default: accountRoutes } = await import(
      `../../../src/web-server/routes/account-routes?tier-lock-test=${Date.now()}-${Math.random()}`
    );

    const app = express();
    app.use(express.json());
    app.use('/api/accounts', accountRoutes);

    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      instance.once('error', reject);
      instance.once('listening', () => resolve(instance));
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsUnified !== undefined) process.env.CCS_UNIFIED_CONFIG = originalCcsUnified;
    else delete process.env.CCS_UNIFIED_CONFIG;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('sets tier_lock to a named tier and returns it', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'agy',
      tier: 'ultra',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; tier_lock: string | null };
    expect(body.provider).toBe('agy');
    expect(body.tier_lock).toBe('ultra');
  });

  it('clears tier_lock when tier is null', async () => {
    // Set first
    await postJson(baseUrl, '/api/accounts/tier-lock', { provider: 'agy', tier: 'pro' });

    // Then clear
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'agy',
      tier: null,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; tier_lock: string | null };
    expect(body.provider).toBe('agy');
    expect(body.tier_lock).toBeNull();
  });

  it('rejects missing provider with 400', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', { tier: 'pro' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/provider/i);
  });

  it('rejects invalid provider with 400', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'notreal',
      tier: 'pro',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/provider/i);
  });

  it('rejects missing tier field (no tier key at all) with 400', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', { provider: 'agy' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
  });

  it('rejects non-string non-null tier with 400', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'agy',
      tier: 42,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
  });

  it('rejects unknown tier string (typo) with 400', async () => {
    // "Ultra" (capital U) is not a valid AccountTier — must 400, not silently persist
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'agy',
      tier: 'Ultra',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
  });

  it('rejects "premium" (unknown tier) with 400', async () => {
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'agy',
      tier: 'premium',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
  });

  it('rejects a non-managed provider with 400 (fix #8)', async () => {
    // Providers like 'kiro' or unknown CLIProxy providers accept isCLIProxyProvider()
    // but quota-manager does not enforce tier_lock for them. Persisting a lock entry
    // would silently have no effect, misleading the caller. Must 400.
    // Note: 'kiro' passes isCLIProxyProvider but is NOT in MANAGED_QUOTA_PROVIDERS.
    // We test with a provider that is valid (passes CLIProxy check) but not managed.
    // In practice this means any provider added to CLIProxy that is not in
    // MANAGED_QUOTA_PROVIDERS = ['agy', 'claude', 'codex', 'gemini', 'ghcp'].
    // We use a string that is a known CLIProxy provider but not managed.
    // Since the set of CLIProxy providers is dynamic we test the error message content.
    const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
      provider: 'kiro',
      tier: 'pro',
    });
    // If kiro is a CLIProxy provider but not managed: expect 400
    // If kiro is not a CLIProxy provider at all: also 400 (from isCLIProxyProvider check)
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/provider/i);
  });

  it('accepts all five managed-quota providers (agy, claude, codex, gemini, ghcp)', async () => {
    const managedProviders = ['agy', 'claude', 'codex', 'gemini', 'ghcp'];
    for (const provider of managedProviders) {
      const res = await postJson(baseUrl, '/api/accounts/tier-lock', {
        provider,
        tier: 'pro',
      });
      // All managed providers should succeed (200)
      expect(res.status).toBe(200);
      const body = (await res.json()) as { provider: string; tier_lock: string | null };
      expect(body.provider).toBe(provider);
    }
  });

  it('persists tier_lock as per-provider map in the config', async () => {
    await postJson(baseUrl, '/api/accounts/tier-lock', { provider: 'agy', tier: 'pro' });

    // Read the config directly to confirm per-provider persistence
    const { loadOrCreateUnifiedConfig } = await import(
      `../../../src/config/config-loader-facade?persist-check=${Date.now()}`
    );
    const config = loadOrCreateUnifiedConfig();
    const tierLock = config.quota_management?.manual?.tier_lock;
    // Must be a map, not a bare string
    expect(typeof tierLock).toBe('object');
    expect((tierLock as Record<string, string | null>)['agy']).toBe('pro');
  });

  it('tier_lock is persisted as a per-provider map entry (not a global string)', async () => {
    // Lock agy to ultra — verify the map structure has only agy set
    await postJson(baseUrl, '/api/accounts/tier-lock', { provider: 'agy', tier: 'ultra' });

    const { loadOrCreateUnifiedConfig } = await import(
      `../../../src/config/config-loader-facade?per-provider-map-check=${Date.now()}`
    );
    const config = loadOrCreateUnifiedConfig();
    const tierLock = config.quota_management?.manual?.tier_lock;

    // Must be a map, not a bare string
    expect(typeof tierLock).toBe('object');
    expect(tierLock).not.toBeNull();
    // The agy entry must be set
    expect((tierLock as Record<string, string | null>)['agy']).toBe('ultra');
    // Providers not explicitly locked must not appear in the map
    expect((tierLock as Record<string, string | null>)['codex'] ?? null).toBeNull();
    expect((tierLock as Record<string, string | null>)['gemini'] ?? null).toBeNull();
  });
});
