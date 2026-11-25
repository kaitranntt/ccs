import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import configRoutes from '../../../src/web-server/routes/config-routes';
import { createEmptyUnifiedConfig } from '../../../src/config/unified-config-types';
import { loadUnifiedConfig, saveUnifiedConfig } from '../../../src/config/unified-config-loader';

async function putJson(baseUrl: string, routePath: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function postJson(baseUrl: string, routePath: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('web-server config-routes account context validation', () => {
  let server: Server;
  let baseUrl = '';
  let forcedRemoteAddress = '127.0.0.1';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalDashboardAuthEnabled: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: forcedRemoteAddress,
        configurable: true,
      });
      next();
    });
    app.use('/api/config', configRoutes);

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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-routes-context-'));
    originalCcsHome = process.env.CCS_HOME;
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';
    fs.mkdirSync(path.join(tempHome, '.ccs'), { recursive: true });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('blocks remote access when dashboard auth is disabled', async () => {
    forcedRemoteAddress = '10.10.0.24';

    const response = await fetch(`${baseUrl}/api/config/format`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error:
        'Local configuration endpoints require localhost access when dashboard auth is disabled.',
    });
  });

  it('allows remote access when dashboard auth is enabled', async () => {
    forcedRemoteAddress = '10.10.0.24';
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';

    const response = await fetch(`${baseUrl}/api/config/format`);

    expect(response.status).toBe(200);
  });

  it('rejects invalid account context_mode values', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'weird',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('context_mode');
  });

  it('rejects context_group when mode is not shared', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'isolated',
          context_group: 'sprint-a',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('context_group requires context_mode=shared');
  });

  it('rejects continuity_mode when mode is not shared', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'isolated',
          continuity_mode: 'deeper',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('continuity_mode requires context_mode=shared');
  });

  it('rejects invalid shared continuity_mode values', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'shared',
          context_group: 'team-alpha',
          continuity_mode: 'extreme',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('continuity_mode');
  });

  it('rejects invalid shared context_group names', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'shared',
          context_group: '###',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('context_group');
  });

  it('rejects whitespace-only shared context_group values', async () => {
    const response = await putJson(baseUrl, '/api/config', {
      version: 8,
      accounts: {
        work: {
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'shared',
          context_group: '   ',
        },
      },
      profiles: {},
      cliproxy: { oauth_accounts: {}, providers: [], variants: {} },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('requires a non-empty value');
  });

  it('accepts valid shared context metadata', async () => {
    const config = createEmptyUnifiedConfig();
    config.accounts.work = {
      created: '2026-01-01T00:00:00.000Z',
      last_used: null,
      context_mode: 'shared',
      context_group: 'Sprint-A',
      continuity_mode: 'deeper',
    };
    const response = await putJson(baseUrl, '/api/config', config);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean };
    expect(payload.success).toBe(true);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.accounts.work.context_group).toBe('sprint-a');
    expect(savedConfig?.accounts.work.continuity_mode).toBe('deeper');
  });

  it('redacts secrets from config and raw YAML responses', async () => {
    const config = createEmptyUnifiedConfig();
    config.global_env = {
      enabled: true,
      env: {
        DEBUG: '1',
        GH_TOKEN: 'gh-token-secret',
        GITHUB_TOKEN: 'github-token-secret',
        OPENAI_API_KEY: 'sk-test-123456',
      },
    };
    config.cliproxy.auth = {
      api_key: 'cliproxy-global-api-key',
      management_secret: 'cliproxy-global-management-secret',
    };
    config.cliproxy.variants.gemini = {
      provider: 'gemini',
      auth: {
        api_key: 'variant-api-key',
        management_secret: 'variant-management-secret',
      },
    };
    config.cliproxy_server = {
      remote: {
        enabled: true,
        host: 'proxy.example.com',
        protocol: 'https',
        auth_token: 'remote-auth-token',
        management_key: 'management-secret',
      },
      fallback: {
        enabled: true,
        auto_start: false,
      },
      local: {
        port: 8317,
        auto_start: true,
      },
    };
    config.dashboard_auth = {
      enabled: true,
      username: 'admin',
      password_hash: '$2b$10$123456789012345678901u4cPFsKnzGWxZmfq6OnpZnN0UiM6Qf7e',
      session_timeout_hours: 24,
    };
    saveUnifiedConfig(config);
    const yamlPath = path.join(tempHome, '.ccs', 'config.yaml');
    const rawYaml = fs.readFileSync(yamlPath, 'utf8');
    fs.writeFileSync(yamlPath, `# custom comment\n${rawYaml}`);

    const response = await fetch(`${baseUrl}/api/config`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as typeof config;

    expect(payload.global_env?.env.DEBUG).toBe('1');
    expect(payload.global_env?.env.GH_TOKEN).toBe('[redacted]');
    expect(payload.global_env?.env.GITHUB_TOKEN).toBe('[redacted]');
    expect(payload.global_env?.env.OPENAI_API_KEY).toBe('[redacted]');
    expect(payload.cliproxy.auth?.api_key).toBe('[redacted]');
    expect(payload.cliproxy.auth?.management_secret).toBe('[redacted]');
    expect(payload.cliproxy.variants.gemini?.auth?.api_key).toBe('[redacted]');
    expect(payload.cliproxy.variants.gemini?.auth?.management_secret).toBe('[redacted]');
    expect(payload.cliproxy_server?.remote.auth_token).toBe('[redacted]');
    expect(payload.cliproxy_server?.remote.management_key).toBe('[redacted]');
    expect(payload.dashboard_auth?.password_hash).toBe('[redacted]');

    const rawResponse = await fetch(`${baseUrl}/api/config/raw`);
    expect(rawResponse.status).toBe(200);
    const rawConfig = await rawResponse.text();

    expect(rawConfig).toContain('# custom comment');
    expect(rawConfig).toContain('DEBUG: "1"');
    expect(rawConfig).toContain('GH_TOKEN: [redacted]');
    expect(rawConfig).toContain('GITHUB_TOKEN: [redacted]');
    expect(rawConfig).toContain('OPENAI_API_KEY: [redacted]');
    expect(rawConfig).toContain('api_key: [redacted]');
    expect(rawConfig).toContain('management_secret: [redacted]');
    expect(rawConfig).not.toContain('sk-test-123456');
    expect(rawConfig).not.toContain('gh-token-secret');
    expect(rawConfig).not.toContain('github-token-secret');
    expect(rawConfig).not.toContain('cliproxy-global-api-key');
    expect(rawConfig).not.toContain('cliproxy-global-management-secret');
    expect(rawConfig).not.toContain('variant-api-key');
    expect(rawConfig).not.toContain('variant-management-secret');
    expect(rawConfig).not.toContain('remote-auth-token');
    expect(rawConfig).not.toContain('management-secret');
  });

  it('preserves redacted secrets when saving a sanitized config payload', async () => {
    const config = createEmptyUnifiedConfig();
    config.global_env = {
      enabled: true,
      env: {
        DEBUG: '1',
        OPENAI_API_KEY: 'sk-test-123456',
      },
    };
    config.cliproxy.auth = {
      api_key: 'cliproxy-global-api-key',
      management_secret: 'cliproxy-global-management-secret',
    };
    config.cliproxy.variants.gemini = {
      provider: 'gemini',
      auth: {
        api_key: 'variant-api-key',
        management_secret: 'variant-management-secret',
      },
    };
    config.cliproxy_server = {
      remote: {
        enabled: true,
        host: 'proxy.example.com',
        protocol: 'https',
        auth_token: 'remote-auth-token',
        management_key: 'management-secret',
      },
      fallback: {
        enabled: true,
        auto_start: false,
      },
      local: {
        port: 8317,
        auto_start: true,
      },
    };
    config.dashboard_auth = {
      enabled: true,
      username: 'admin',
      password_hash: '$2b$10$123456789012345678901u4cPFsKnzGWxZmfq6OnpZnN0UiM6Qf7e',
      session_timeout_hours: 24,
    };
    saveUnifiedConfig(config);

    const getResponse = await fetch(`${baseUrl}/api/config`);
    const sanitized = (await getResponse.json()) as typeof config;
    sanitized.cliproxy.kiro_no_incognito = true;

    const putResponse = await putJson(baseUrl, '/api/config', sanitized);
    expect(putResponse.status).toBe(200);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.cliproxy.kiro_no_incognito).toBe(true);
    expect(savedConfig?.global_env?.env.OPENAI_API_KEY).toBe('sk-test-123456');
    expect(savedConfig?.cliproxy.auth?.api_key).toBe('cliproxy-global-api-key');
    expect(savedConfig?.cliproxy.auth?.management_secret).toBe(
      'cliproxy-global-management-secret'
    );
    expect(savedConfig?.cliproxy.variants.gemini?.auth?.api_key).toBe('variant-api-key');
    expect(savedConfig?.cliproxy.variants.gemini?.auth?.management_secret).toBe(
      'variant-management-secret'
    );
    expect(savedConfig?.cliproxy_server?.remote.auth_token).toBe('remote-auth-token');
    expect(savedConfig?.cliproxy_server?.remote.management_key).toBe('management-secret');
    expect(savedConfig?.dashboard_auth?.password_hash).toBe(
      '$2b$10$123456789012345678901u4cPFsKnzGWxZmfq6OnpZnN0UiM6Qf7e'
    );
  });

  it('preserves cliproxy auth secrets when hidden auth subtrees are omitted on save', async () => {
    const config = createEmptyUnifiedConfig();
    config.cliproxy.auth = {
      api_key: 'cliproxy-global-api-key',
      management_secret: 'cliproxy-global-management-secret',
    };
    config.cliproxy.variants.gemini = {
      provider: 'gemini',
      auth: {
        api_key: 'variant-api-key',
        management_secret: 'variant-management-secret',
      },
    };
    saveUnifiedConfig(config);

    const getResponse = await fetch(`${baseUrl}/api/config`);
    const sanitized = (await getResponse.json()) as typeof config;
    delete sanitized.cliproxy.auth;
    if (sanitized.cliproxy.variants.gemini) {
      delete sanitized.cliproxy.variants.gemini.auth;
    }
    sanitized.cliproxy.kiro_no_incognito = true;

    const putResponse = await putJson(baseUrl, '/api/config', sanitized);
    expect(putResponse.status).toBe(200);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.cliproxy.kiro_no_incognito).toBe(true);
    expect(savedConfig?.cliproxy.auth?.api_key).toBe('cliproxy-global-api-key');
    expect(savedConfig?.cliproxy.auth?.management_secret).toBe(
      'cliproxy-global-management-secret'
    );
    expect(savedConfig?.cliproxy.variants.gemini?.auth?.api_key).toBe('variant-api-key');
    expect(savedConfig?.cliproxy.variants.gemini?.auth?.management_secret).toBe(
      'variant-management-secret'
    );
  });

  it('clears cliproxy auth secrets when empty auth objects are saved explicitly', async () => {
    const config = createEmptyUnifiedConfig();
    config.cliproxy.auth = {
      api_key: 'cliproxy-global-api-key',
      management_secret: 'cliproxy-global-management-secret',
    };
    config.cliproxy.variants.gemini = {
      provider: 'gemini',
      auth: {
        api_key: 'variant-api-key',
        management_secret: 'variant-management-secret',
      },
    };
    saveUnifiedConfig(config);

    const getResponse = await fetch(`${baseUrl}/api/config`);
    const sanitized = (await getResponse.json()) as typeof config;
    sanitized.cliproxy.auth = {};
    if (sanitized.cliproxy.variants.gemini) {
      sanitized.cliproxy.variants.gemini.auth = {};
    }

    const putResponse = await putJson(baseUrl, '/api/config', sanitized);
    expect(putResponse.status).toBe(200);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.cliproxy.auth).toBeUndefined();
    expect(savedConfig?.cliproxy.variants.gemini?.auth).toBeUndefined();
  });

  it('redacts block-scalar secrets from raw YAML responses', async () => {
    const yamlPath = path.join(tempHome, '.ccs', 'config.yaml');
    fs.writeFileSync(
      yamlPath,
      [
        '# block scalar test',
        'version: 10',
        'accounts: {}',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: []',
        '  variants:',
        '    gemini:',
        '      provider: gemini',
        '      auth:',
        '        api_key: |-',
        '          variant-api-secret-line-1',
        '          variant-api-secret-line-2',
        '  auth:',
        '    api_key: >+',
        '      cliproxy-global-api-secret',
        '    management_secret: |+',
        '      cliproxy-global-management-secret',
        'global_env:',
        '  enabled: true',
        '  env:',
        '    GITHUB_TOKEN: |-',
        '      github-token-secret-line-1',
        '      github-token-secret-line-2',
        'cliproxy_server:',
        '  remote:',
        '    enabled: true',
        '    host: proxy.example.com',
        '    protocol: https',
        '    auth_token: >-',
        '      remote-auth-secret',
        'dashboard_auth:',
        '  enabled: true',
        '  username: admin',
        '  password_hash: >+',
        '    dashboard-password-secret',
        '',
      ].join('\n')
    );

    const rawResponse = await fetch(`${baseUrl}/api/config/raw`);
    expect(rawResponse.status).toBe(200);
    const rawConfig = await rawResponse.text();

    expect(rawConfig).toContain('# block scalar test');
    expect(rawConfig).toContain('GITHUB_TOKEN: [redacted]');
    expect(rawConfig).toContain('api_key: [redacted]');
    expect(rawConfig).toContain('management_secret: [redacted]');
    expect(rawConfig).toContain('auth_token: [redacted]');
    expect(rawConfig).toContain('password_hash: [redacted]');
    expect(rawConfig).not.toContain('github-token-secret-line-1');
    expect(rawConfig).not.toContain('cliproxy-global-api-secret');
    expect(rawConfig).not.toContain('cliproxy-global-management-secret');
    expect(rawConfig).not.toContain('variant-api-secret-line-1');
    expect(rawConfig).not.toContain('remote-auth-secret');
    expect(rawConfig).not.toContain('dashboard-password-secret');
  });

  it('allows deleting visible global env keys while preserving redacted secrets', async () => {
    const config = createEmptyUnifiedConfig();
    config.global_env = {
      enabled: true,
      env: {
        DEBUG: '1',
        OPENAI_API_KEY: 'sk-test-123456',
      },
    };
    saveUnifiedConfig(config);

    const getResponse = await fetch(`${baseUrl}/api/config`);
    const sanitized = (await getResponse.json()) as typeof config;
    if (sanitized.global_env?.env) {
      delete sanitized.global_env.env.DEBUG;
    }

    const putResponse = await putJson(baseUrl, '/api/config', sanitized);
    expect(putResponse.status).toBe(200);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.global_env?.env.DEBUG).toBeUndefined();
    expect(savedConfig?.global_env?.env.OPENAI_API_KEY).toBe('sk-test-123456');
  });

  it('allows deleting visible cliproxy_server and dashboard_auth fields while preserving secrets', async () => {
    const config = createEmptyUnifiedConfig();
    config.cliproxy_server = {
      remote: {
        enabled: true,
        host: 'proxy.example.com',
        port: 8443,
        protocol: 'https',
        auth_token: 'remote-auth-token',
        management_key: 'management-secret',
      },
      fallback: {
        enabled: true,
        auto_start: false,
      },
      local: {
        port: 8317,
        auto_start: true,
      },
    };
    config.dashboard_auth = {
      enabled: true,
      username: 'admin',
      password_hash: '$2b$10$123456789012345678901u4cPFsKnzGWxZmfq6OnpZnN0UiM6Qf7e',
      session_timeout_hours: 24,
    };
    saveUnifiedConfig(config);

    const getResponse = await fetch(`${baseUrl}/api/config`);
    const sanitized = (await getResponse.json()) as typeof config;
    if (sanitized.cliproxy_server?.remote) {
      delete sanitized.cliproxy_server.remote.port;
    }
    if (sanitized.dashboard_auth) {
      delete (sanitized.dashboard_auth as { username?: string }).username;
    }

    const putResponse = await putJson(baseUrl, '/api/config', sanitized);
    expect(putResponse.status).toBe(200);

    const savedConfig = loadUnifiedConfig();
    expect(savedConfig?.cliproxy_server?.remote.port).toBeUndefined();
    expect(savedConfig?.cliproxy_server?.remote.auth_token).toBe('remote-auth-token');
    expect(savedConfig?.cliproxy_server?.remote.management_key).toBe('management-secret');
    expect(savedConfig?.dashboard_auth?.username).toBeUndefined();
    expect(savedConfig?.dashboard_auth?.password_hash).toBe(
      '$2b$10$123456789012345678901u4cPFsKnzGWxZmfq6OnpZnN0UiM6Qf7e'
    );
  });

  it('returns alreadyMigrated when migration is not needed', async () => {
    const response = await postJson(baseUrl, '/api/config/migrate');

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      migratedFiles: string[];
      warnings: string[];
      alreadyMigrated?: boolean;
    };
    expect(payload.success).toBe(true);
    expect(payload.migratedFiles).toEqual([]);
    expect(payload.warnings).toEqual([]);
    expect(payload.alreadyMigrated).toBe(true);
  });

  it('excludes unmanaged backup directories from format response', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const managedBackup = path.join(ccsDir, 'backup-v1-2026-03-24');
    const externalBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-format-backup-'));
    const symlinkBackup = path.join(ccsDir, 'backup-v1-symlink');

    fs.mkdirSync(managedBackup, { recursive: true });
    fs.symlinkSync(externalBackup, symlinkBackup, 'dir');

    const response = await fetch(`${baseUrl}/api/config/format`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      format: string;
      migrationNeeded: boolean;
      backups: string[];
    };
    expect(payload.backups).toContain(managedBackup);
    expect(payload.backups).not.toContain(symlinkBackup);

    fs.rmSync(externalBackup, { recursive: true, force: true });
  });

  it('rejects rollback paths outside managed CCS backups', async () => {
    const externalBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-external-backup-'));

    const response = await postJson(baseUrl, '/api/config/rollback', {
      backupPath: externalBackup,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid backupPath. Must reference a managed CCS migration backup directory.',
    });

    fs.rmSync(externalBackup, { recursive: true, force: true });
  });
});
