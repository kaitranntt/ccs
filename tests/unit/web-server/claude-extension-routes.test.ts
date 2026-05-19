import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';

describe('web-server claude-extension-routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;
  let setGlobalConfigDir: (dir: string | undefined) => void;
  let claudeExtensionRoutes: ReturnType<typeof express.Router>;
  let SharedManager: typeof import('../../../src/management/shared-manager').default;
  let createEmptyUnifiedConfig: typeof import('../../../src/config/unified-config-types').createEmptyUnifiedConfig;
  let saveUnifiedConfig: typeof import('../../../src/config/unified-config-loader').saveUnifiedConfig;

  beforeAll(async () => {
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    ({ setGlobalConfigDir } = await import('../../../src/utils/config-manager'));
    ({ default: SharedManager } = await import('../../../src/management/shared-manager'));
    ({ createEmptyUnifiedConfig } = await import('../../../src/config/unified-config-types'));
    ({ saveUnifiedConfig } = await import('../../../src/config/unified-config-loader'));
    ({ default: claudeExtensionRoutes } = await import(
      '../../../src/web-server/routes/claude-extension-routes'
    ));

    const app = express();
    app.use(express.json());
    app.use('/api/claude-extension', claudeExtensionRoutes);

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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    setGlobalConfigDir(undefined);

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalClaudeConfigDir !== undefined)
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    else delete process.env.CLAUDE_CONFIG_DIR;
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-claude-extension-routes-'));
    process.env.CCS_HOME = tempHome;
    process.env.CLAUDE_CONFIG_DIR = path.join(tempHome, '.claude');
    setGlobalConfigDir(path.join(tempHome, '.ccs'));

    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.test',
            ANTHROPIC_API_KEY: 'sk-ant-test-123456',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5',
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'rich.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://rich.example.test',
            ANTHROPIC_API_KEY: 'sk-ant-rich-123456',
            ANTHROPIC_MODEL: 'claude-opus-4-1',
            ANTHROPIC_MAX_TOKENS: '65536',
            API_TIMEOUT_MS: '120000',
            EXPERIMENTAL_ROUTER_HEADER: 'tenant-alpha',
          },
        },
        null,
        2
      ) + '\n'
    );

    const config = createEmptyUnifiedConfig();
    config.profiles.glm = {
      type: 'api',
      settings: path.join(ccsDir, 'glm.settings.json'),
    };
    config.profiles.rich = {
      type: 'api',
      settings: path.join(ccsDir, 'rich.settings.json'),
    };
    config.accounts.work = {
      created: '2026-03-15T00:00:00.000Z',
      last_used: null,
      context_mode: 'isolated',
    };
    config.default = 'work';
    config.cliproxy.variants.codex = {
      provider: 'codex',
      settings: path.join(ccsDir, 'codex.settings.json'),
    };
    saveUnifiedConfig(config);
  });

  afterEach(() => {
    mock.restore();
    setGlobalConfigDir(undefined);
    delete process.env.CCS_HOME;
    delete process.env.CLAUDE_CONFIG_DIR;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('lists profile options and IDE host targets', async () => {
    const response = await fetch(`${baseUrl}/api/claude-extension/profiles`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      profiles: Array<{ name: string }>;
      hosts: Array<{ id: string; defaultSettingsPath: string }>;
    };

    expect(payload.profiles.some((profile) => profile.name === 'default')).toBe(true);
    expect(payload.profiles.some((profile) => profile.name === 'glm')).toBe(true);
    expect(payload.profiles.some((profile) => profile.name === 'work')).toBe(true);
    expect(payload.profiles.some((profile) => profile.name === 'gemini')).toBe(true);
    expect(payload.profiles.some((profile) => profile.name === 'codex')).toBe(false);
    expect(payload.hosts.map((host) => host.id)).toEqual(['vscode', 'cursor', 'windsurf']);
    expect(payload.hosts.every((host) => host.defaultSettingsPath.endsWith('settings.json'))).toBe(
      true
    );
  });

  it('rejects Codex CLIProxy setup with native Codex guidance', async () => {
    const response = await fetch(`${baseUrl}/api/claude-extension/setup?profile=codex&host=vscode`);
    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('Codex CLIProxy profile');
    expect(payload.error).toContain('ccsxp');
    expect(payload.error).toContain('ccs codex --target codex');
  });

  it('renders VS Code setup for API profiles with disableLoginPrompt', async () => {
    const response = await fetch(`${baseUrl}/api/claude-extension/setup?profile=glm&host=vscode`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      host: { settingsKey: string; disableLoginPromptKey?: string };
      ideSettings: { json: string };
      sharedSettings: { command: string; json: string };
    };

    expect(payload.host.settingsKey).toBe('claudeCode.environmentVariables');
    expect(payload.host.disableLoginPromptKey).toBe('claudeCode.disableLoginPrompt');
    expect(payload.ideSettings.json).toContain('"claudeCode.disableLoginPrompt": true');
    expect(payload.ideSettings.json).toContain('"ANTHROPIC_API_KEY"');
    expect(payload.sharedSettings.command).toBe('ccs persist glm');
    expect(payload.sharedSettings.json).toContain('"env"');
  });

  it('blocks non-local setup requests when dashboard auth is disabled', async () => {
    const app = express();
    app.use((_req, _res, next) => {
      Object.defineProperty(_req.socket, 'remoteAddress', {
        configurable: true,
        value: '10.0.0.25',
      });
      next();
    });
    app.use('/api/claude-extension', claudeExtensionRoutes);

    const remoteServer = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      const handleError = (error: Error) => reject(error);
      instance.once('error', handleError);
      instance.once('listening', () => {
        instance.off('error', handleError);
        resolve(instance);
      });
    });

    try {
      const address = remoteServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to resolve remote test server port');
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/claude-extension/setup?profile=glm&host=vscode`
      );
      expect(response.status).toBe(403);

      const payload = (await response.json()) as { error: string };
      expect(payload.error).toBe(
        'Claude extension setup requires localhost access when dashboard auth is disabled.'
      );
    } finally {
      await new Promise<void>((resolve) => remoteServer.close(() => resolve()));
    }
  });

  it('normalizes the effective profile CLAUDE_CONFIG_DIR for extension setup', async () => {
    const explicitConfigDir = path.join(tempHome, '.claude-profiles', 'glm');
    const glmSettingsPath = path.join(tempHome, '.ccs', 'glm.settings.json');
    const normalizeSpy = spyOn(
      SharedManager.prototype,
      'normalizeSharedPluginMetadataPaths'
    ).mockImplementation(() => {});

    fs.writeFileSync(
      glmSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.test',
            ANTHROPIC_API_KEY: 'sk-ant-test-123456',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5',
            CLAUDE_CONFIG_DIR: explicitConfigDir,
          },
        },
        null,
        2
      ) + '\n'
    );

    const config = createEmptyUnifiedConfig();
    config.profiles.glm = {
      type: 'api',
      settings: glmSettingsPath,
    };
    config.accounts.work = {
      created: '2026-03-15T00:00:00.000Z',
      last_used: null,
      context_mode: 'isolated',
    };
    config.default = 'work';
    config.continuity = {
      inherit_from_account: {
        glm: 'work',
      },
    };
    saveUnifiedConfig(config);

    const response = await fetch(`${baseUrl}/api/claude-extension/setup?profile=glm&host=vscode`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ideSettings: { json: string };
    };

    expect(payload.ideSettings.json).toContain(explicitConfigDir);
    expect(normalizeSpy.mock.calls.some(([configDir]) => configDir === explicitConfigDir)).toBe(
      true
    );
  });

  it('renders Windsurf setup for default account resolution via CLAUDE_CONFIG_DIR', async () => {
    const response = await fetch(
      `${baseUrl}/api/claude-extension/setup?profile=default&host=windsurf`
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      profile: { profileType: string; resolvedProfileName: string };
      host: { settingsKey: string };
      ideSettings: { json: string };
      sharedSettings: { command: string };
    };

    expect(payload.profile.profileType).toBe('account');
    expect(payload.profile.resolvedProfileName).toBe('work');
    expect(payload.host.settingsKey).toBe('claude-code.environmentVariables');
    expect(payload.ideSettings.json).toContain('"claude-code.environmentVariables"');
    expect(payload.ideSettings.json).toContain('"CLAUDE_CONFIG_DIR"');
    expect(payload.sharedSettings.command).toBe('ccs persist default');
  });

  it('creates a binding and applies managed settings to shared + IDE targets', async () => {
    const ideSettingsPath = path.join(tempHome, 'ide', 'vscode', 'settings.json');
    const createResponse = await fetch(`${baseUrl}/api/claude-extension/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'GLM in VS Code',
        profile: 'glm',
        host: 'vscode',
        ideSettingsPath,
      }),
    });
    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as {
      binding: {
        id: string;
        effectiveIdeSettingsPath: string;
        usesDefaultIdeSettingsPath: boolean;
      };
    };
    expect(created.binding.effectiveIdeSettingsPath).toBe(ideSettingsPath);
    expect(created.binding.usesDefaultIdeSettingsPath).toBe(false);

    const applyResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all' }),
      }
    );
    expect(applyResponse.status).toBe(200);

    const applied = (await applyResponse.json()) as {
      sharedSettings: { state: string };
      ideSettings: { state: string };
    };
    expect(applied.sharedSettings.state).toBe('applied');
    expect(applied.ideSettings.state).toBe('applied');

    const sharedSettingsPath = path.join(tempHome, '.claude', 'settings.json');
    const sharedSettings = JSON.parse(fs.readFileSync(sharedSettingsPath, 'utf8')) as {
      env?: Record<string, string>;
    };
    const ideSettings = JSON.parse(fs.readFileSync(ideSettingsPath, 'utf8')) as Record<
      string,
      unknown
    >;

    expect(sharedSettings.env?.ANTHROPIC_API_KEY).toBe('sk-ant-test-123456');
    expect(sharedSettings.env?.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5');
    expect(
      Array.isArray(ideSettings['claudeCode.environmentVariables']) &&
        (ideSettings['claudeCode.environmentVariables'] as Array<{ name: string }>).some(
          (entry) => entry.name === 'ANTHROPIC_API_KEY'
        )
    ).toBe(true);
    expect(ideSettings['claudeCode.disableLoginPrompt']).toBe(true);
  });

  it('resets only managed keys and preserves unrelated shared + IDE settings', async () => {
    const ideSettingsPath = path.join(tempHome, 'ide', 'cursor', 'settings.json');
    fs.mkdirSync(path.dirname(ideSettingsPath), { recursive: true });
    fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });

    fs.writeFileSync(
      path.join(tempHome, '.claude', 'settings.json'),
      JSON.stringify(
        {
          theme: 'dark',
          env: {
            KEEP_ME: '1',
            ANTHROPIC_API_KEY: 'stale',
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      ideSettingsPath,
      JSON.stringify(
        {
          'editor.fontSize': 14,
          'claudeCode.environmentVariables': [{ name: 'ANTHROPIC_API_KEY', value: 'stale' }],
          'claudeCode.disableLoginPrompt': true,
        },
        null,
        2
      ) + '\n'
    );

    const createResponse = await fetch(`${baseUrl}/api/claude-extension/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cursor reset',
        profile: 'glm',
        host: 'cursor',
        ideSettingsPath,
      }),
    });
    const created = (await createResponse.json()) as { binding: { id: string } };

    const resetResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/reset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all' }),
      }
    );
    expect(resetResponse.status).toBe(200);

    const resetPayload = (await resetResponse.json()) as {
      sharedSettings: { state: string };
      ideSettings: { state: string };
    };
    expect(resetPayload.sharedSettings.state).toBe('unconfigured');
    expect(resetPayload.ideSettings.state).toBe('unconfigured');

    const sharedSettings = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.claude', 'settings.json'), 'utf8')
    ) as {
      theme?: string;
      env?: Record<string, string>;
    };
    const ideSettings = JSON.parse(fs.readFileSync(ideSettingsPath, 'utf8')) as Record<
      string,
      unknown
    >;

    expect(sharedSettings.theme).toBe('dark');
    expect(sharedSettings.env?.KEEP_ME).toBe('1');
    expect(sharedSettings.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(ideSettings['editor.fontSize']).toBe(14);
    expect(ideSettings['claudeCode.environmentVariables']).toBeUndefined();
    expect(ideSettings['claudeCode.disableLoginPrompt']).toBeUndefined();
  });

  it('removes optional shared env keys even after the profile payload shrinks', async () => {
    const ideSettingsPath = path.join(tempHome, 'ide', 'vscode', 'settings.json');
    const createResponse = await fetch(`${baseUrl}/api/claude-extension/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rich env binding',
        profile: 'rich',
        host: 'vscode',
        ideSettingsPath,
      }),
    });
    const created = (await createResponse.json()) as { binding: { id: string } };

    const applyResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'shared' }),
      }
    );
    expect(applyResponse.status).toBe(200);

    const sharedSettingsPath = path.join(tempHome, '.claude', 'settings.json');
    let sharedSettings = JSON.parse(fs.readFileSync(sharedSettingsPath, 'utf8')) as {
      env?: Record<string, string>;
    };

    expect(sharedSettings.env?.ANTHROPIC_API_KEY).toBe('sk-ant-rich-123456');
    expect(sharedSettings.env?.ANTHROPIC_MAX_TOKENS).toBe('65536');
    expect(sharedSettings.env?.API_TIMEOUT_MS).toBe('120000');
    expect(sharedSettings.env?.EXPERIMENTAL_ROUTER_HEADER).toBe('tenant-alpha');

    fs.writeFileSync(
      path.join(tempHome, '.ccs', 'rich.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://rich.example.test',
            ANTHROPIC_API_KEY: 'sk-ant-rich-123456',
            ANTHROPIC_MODEL: 'claude-opus-4-1',
          },
        },
        null,
        2
      ) + '\n'
    );

    const resetResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/reset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'shared' }),
      }
    );
    expect(resetResponse.status).toBe(200);

    const verifyResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/verify`
    );
    expect(verifyResponse.status).toBe(200);

    const verified = (await verifyResponse.json()) as {
      sharedSettings: { state: string };
    };
    expect(verified.sharedSettings.state).toBe('unconfigured');

    sharedSettings = JSON.parse(fs.readFileSync(sharedSettingsPath, 'utf8')) as {
      env?: Record<string, string>;
    };
    expect(sharedSettings.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(sharedSettings.env?.ANTHROPIC_MAX_TOKENS).toBeUndefined();
    expect(sharedSettings.env?.API_TIMEOUT_MS).toBeUndefined();
    expect(sharedSettings.env?.EXPERIMENTAL_ROUTER_HEADER).toBeUndefined();
  });

  it('preserves unrelated IDE env entries while applying and resetting managed values', async () => {
    const ideSettingsPath = path.join(tempHome, 'ide', 'vscode', 'settings.json');
    fs.mkdirSync(path.dirname(ideSettingsPath), { recursive: true });
    fs.writeFileSync(
      ideSettingsPath,
      `{
  // VS Code stores JSONC here, not strict JSON
  "editor.tabSize": 2,
  "claudeCode.environmentVariables": [
    { "name": "KEEP_ME", "value": "1" },
    { "name": "ANTHROPIC_API_KEY", "value": "stale" },
  ],
  "claudeCode.disableLoginPrompt": false,
}
`
    );

    const createResponse = await fetch(`${baseUrl}/api/claude-extension/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'VS Code preserved env',
        profile: 'glm',
        host: 'vscode',
        ideSettingsPath,
      }),
    });
    const created = (await createResponse.json()) as { binding: { id: string } };

    const applyResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'ide' }),
      }
    );
    expect(applyResponse.status).toBe(200);

    let ideSettings = JSON.parse(fs.readFileSync(ideSettingsPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const appliedEnv = ideSettings['claudeCode.environmentVariables'] as Array<{
      name: string;
      value: string;
    }>;

    expect(appliedEnv.some((entry) => entry.name === 'KEEP_ME' && entry.value === '1')).toBe(true);
    expect(
      appliedEnv.some(
        (entry) => entry.name === 'ANTHROPIC_API_KEY' && entry.value === 'sk-ant-test-123456'
      )
    ).toBe(true);

    const verifyAppliedResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/verify`
    );
    expect(verifyAppliedResponse.status).toBe(200);

    const verifiedApplied = (await verifyAppliedResponse.json()) as {
      ideSettings: { state: string };
    };
    expect(verifiedApplied.ideSettings.state).toBe('applied');

    const resetResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/reset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'ide' }),
      }
    );
    expect(resetResponse.status).toBe(200);

    ideSettings = JSON.parse(fs.readFileSync(ideSettingsPath, 'utf8')) as Record<string, unknown>;
    expect(ideSettings['editor.tabSize']).toBe(2);
    expect(ideSettings['claudeCode.disableLoginPrompt']).toBeUndefined();
    expect(ideSettings['claudeCode.environmentVariables']).toEqual([
      { name: 'KEEP_ME', value: '1' },
    ]);

    const verifyResetResponse = await fetch(
      `${baseUrl}/api/claude-extension/bindings/${created.binding.id}/verify`
    );
    expect(verifyResetResponse.status).toBe(200);

    const verifiedReset = (await verifyResetResponse.json()) as {
      ideSettings: { state: string };
    };
    expect(verifiedReset.ideSettings.state).toBe('unconfigured');
  });

  it('rejects bindings for profiles that do not exist', async () => {
    const response = await fetch(`${baseUrl}/api/claude-extension/bindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Broken profile binding',
        profile: 'does-not-exist',
        host: 'vscode',
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('Unknown profile');
  });
});
