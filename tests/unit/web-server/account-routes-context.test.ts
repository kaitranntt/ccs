import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import accountRoutes from '../../../src/web-server/routes/account-routes';
import ProfileRegistry from '../../../src/auth/profile-registry';
import { InstanceManager } from '../../../src/management/instance-manager';

async function getJson<T>(baseUrl: string, routePath: string): Promise<T> {
  const response = await fetch(`${baseUrl}${routePath}`);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function deletePath(baseUrl: string, routePath: string): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, { method: 'DELETE' });
}

async function putJson(baseUrl: string, routePath: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('web-server account-routes context normalization', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsUnified: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/accounts', accountRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const handleError = (error: Error) => reject(error);
      server.once('error', handleError);
      server.once('listening', () => {
        server.off('error', handleError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-account-routes-context-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsUnified = process.env.CCS_UNIFIED_CONFIG;

    process.env.CCS_HOME = tempHome;
    process.env.CCS_UNIFIED_CONFIG = '1';
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsUnified !== undefined) process.env.CCS_UNIFIED_CONFIG = originalCcsUnified;
    else delete process.env.CCS_UNIFIED_CONFIG;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('normalizes invalid persisted account context metadata in API response', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        '    context_mode: weird',
        '    context_group: "###"',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const payload = await getJson<{
      accounts: Array<{
        name: string;
        context_mode?: string;
        context_group?: string;
        continuity_mode?: string;
        context_inferred?: boolean;
      }>;
    }>(baseUrl, '/api/accounts');

    const work = payload.accounts.find((account) => account.name === 'work');
    expect(work).toBeTruthy();
    expect(work?.context_mode).toBe('isolated');
    expect(work?.context_inferred).toBe(true);
    expect(work && 'context_group' in work).toBe(false);
    expect(work && 'continuity_mode' in work).toBe(false);
  });

  it('falls back shared accounts with invalid groups to default shared group', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        '    context_mode: shared',
        '    context_group: "###"',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const payload = await getJson<{
      accounts: Array<{
        name: string;
        context_mode?: string;
        context_group?: string;
        continuity_mode?: string;
        context_inferred?: boolean;
        continuity_inferred?: boolean;
      }>;
    }>(baseUrl, '/api/accounts');

    const work = payload.accounts.find((account) => account.name === 'work');
    expect(work).toBeTruthy();
    expect(work?.context_mode).toBe('shared');
    expect(work?.context_group).toBe('default');
    expect(work?.continuity_mode).toBe('standard');
    expect(work?.context_inferred).toBe(false);
    expect(work?.continuity_inferred).toBe(true);
  });

  it('reports the plain ccs lane as native when no account default or inheritance exists', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const payload = await getJson<{
      plain_ccs_lane?: {
        kind: string;
        account_name?: string | null;
      };
    }>(baseUrl, '/api/accounts');

    expect(payload.plain_ccs_lane?.kind).toBe('native');
    expect(payload.plain_ccs_lane?.account_name).toBeNull();
  });

  it('reports the plain ccs lane as an account when default profile is an auth account', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'default: work',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    context_mode: shared',
        '    context_group: default',
        '    continuity_mode: deeper',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const payload = await getJson<{
      plain_ccs_lane?: {
        kind: string;
        account_name?: string | null;
      };
    }>(baseUrl, '/api/accounts');

    expect(payload.plain_ccs_lane?.kind).toBe('account-default');
    expect(payload.plain_ccs_lane?.account_name).toBe('work');
  });

  it('does not initialize an account instance as a side effect of listing accounts', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'default: work',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    context_mode: shared',
        '    context_group: default',
        '    continuity_mode: deeper',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const instancePath = path.join(ccsDir, 'instances', 'work');
    expect(fs.existsSync(instancePath)).toBe(false);

    await getJson(baseUrl, '/api/accounts');

    expect(fs.existsSync(instancePath)).toBe(false);
  });

  it('reports effective shared resource mode without initializing an account instance', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    shared_resource_mode: profile-local',
        '  restored:',
        '    created: "2026-02-02T00:00:00.000Z"',
        '    shared_resource_mode: shared',
        '    bare: true',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const payload = await getJson<{
      accounts: Array<{
        name: string;
        shared_resource_mode?: string;
        shared_resource_inferred?: boolean;
        bare?: boolean;
      }>;
    }>(baseUrl, '/api/accounts');

    const work = payload.accounts.find((account) => account.name === 'work');
    const restored = payload.accounts.find((account) => account.name === 'restored');
    expect(work?.shared_resource_mode).toBe('profile-local');
    expect(work?.shared_resource_inferred).toBe(false);
    expect(work?.bare).toBe(true);
    expect(restored?.shared_resource_mode).toBe('shared');
    expect(restored?.shared_resource_inferred).toBe(false);
    expect(restored?.bare).toBeUndefined();
    expect(fs.existsSync(path.join(ccsDir, 'instances', 'work'))).toBe(false);
  });

  it('does not delete metadata when instance deletion fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        '    context_mode: shared',
        '    context_group: sprint-a',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );
    const registry = new ProfileRegistry();

    const originalDeleteInstance = InstanceManager.prototype.deleteInstance;
    InstanceManager.prototype.deleteInstance = () => {
      throw new Error('simulated instance delete failure');
    };

    try {
      const response = await deletePath(baseUrl, '/api/accounts/work');
      expect(response.status).toBe(500);
      expect(registry.hasAccountUnified('work')).toBe(true);
    } finally {
      InstanceManager.prototype.deleteInstance = originalDeleteInstance;
    }
  });

  it('updates existing account context metadata and normalizes shared group', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        '    context_mode: isolated',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const response = await putJson(baseUrl, '/api/accounts/work/context', {
      context_mode: 'shared',
      context_group: ' Team Alpha ',
      continuity_mode: 'deeper',
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      context_mode: string;
      context_group: string | null;
      continuity_mode?: string | null;
      context_inferred?: boolean;
      continuity_inferred?: boolean;
    };
    expect(payload.context_mode).toBe('shared');
    expect(payload.context_group).toBe('team-alpha');
    expect(payload.continuity_mode).toBe('deeper');
    expect(payload.context_inferred).toBe(false);
    expect(payload.continuity_inferred).toBe(false);

    const accountsPayload = await getJson<{
      accounts: Array<{
        name: string;
        context_mode?: string;
        context_group?: string;
        continuity_mode?: string;
      }>;
    }>(baseUrl, '/api/accounts');
    const work = accountsPayload.accounts.find((account) => account.name === 'work');
    expect(work?.context_mode).toBe('shared');
    expect(work?.context_group).toBe('team-alpha');
    expect(work?.continuity_mode).toBe('deeper');
  });

  it('updates existing account shared resource mode without changing history sync metadata', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        '    context_mode: shared',
        '    context_group: sprint-a',
        '    continuity_mode: deeper',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const ensureSpy = spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue(
      path.join(ccsDir, 'instances', 'work')
    );

    try {
      const response = await putJson(baseUrl, '/api/accounts/work/shared-resources', {
        shared_resource_mode: 'profile-local',
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        shared_resource_mode: string;
        shared_resource_inferred?: boolean;
      };
      expect(payload.shared_resource_mode).toBe('profile-local');
      expect(payload.shared_resource_inferred).toBe(false);
      expect(ensureSpy).toHaveBeenCalledWith(
        'work',
        {
          mode: 'shared',
          group: 'sprint-a',
          continuityMode: 'deeper',
        },
        { bare: true }
      );
    } finally {
      ensureSpy.mockRestore();
    }

    const registry = new ProfileRegistry();
    const account = registry.getAllAccountsUnified().work;
    expect(account.shared_resource_mode).toBe('profile-local');
    expect(account.bare).toBe(true);
    expect(account.context_mode).toBe('shared');
    expect(account.context_group).toBe('sprint-a');
    expect(account.continuity_mode).toBe('deeper');
  });

  it('rolls back inferred shared resource metadata when instance reconciliation fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const ensureSpy = spyOn(InstanceManager.prototype, 'ensureInstance').mockRejectedValue(
      new Error('reconcile failed')
    );

    try {
      const response = await putJson(baseUrl, '/api/accounts/work/shared-resources', {
        shared_resource_mode: 'profile-local',
      });
      expect(response.status).toBe(500);
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toBe('Failed to update shared resource mode.');
      expect(payload.error).not.toContain('reconcile failed');
    } finally {
      ensureSpy.mockRestore();
    }

    const registry = new ProfileRegistry();
    const account = registry.getAllAccountsUnified().work;
    expect(account.shared_resource_mode).toBeUndefined();
    expect(account.bare).toBeUndefined();
  });

  it('rejects invalid shared resource mode updates', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const response = await putJson(baseUrl, '/api/accounts/work/shared-resources', {
      shared_resource_mode: 'plugins-only',
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('shared_resource_mode');
  });

  it('rejects shared resource updates for CLIProxy account identifiers', async () => {
    const response = await putJson(baseUrl, '/api/accounts/gemini:test/shared-resources', {
      shared_resource_mode: 'profile-local',
    });
    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('CLIProxy');
  });

  it('rejects shared mode updates without context_group', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const response = await putJson(baseUrl, '/api/accounts/work/context', {
      context_mode: 'shared',
    });
    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('context_group');
  });

  it('rejects context updates for CLIProxy account identifiers', async () => {
    const response = await putJson(baseUrl, '/api/accounts/gemini:test/context', {
      context_mode: 'shared',
      context_group: 'default',
      continuity_mode: 'deeper',
    });
    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('CLIProxy');
  });

  it('rejects invalid continuity mode updates', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'accounts:',
        '  work:',
        '    created: "2026-02-01T00:00:00.000Z"',
        '    last_used: null',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );

    const response = await putJson(baseUrl, '/api/accounts/work/context', {
      context_mode: 'shared',
      context_group: 'default',
      continuity_mode: 'extreme',
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('continuity_mode');
  });
});
