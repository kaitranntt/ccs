import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildCodexCliproxyProviderBaseUrl,
  ensureCodexCliproxyProviderConfig,
} from '../../../src/targets/codex-cliproxy-provider-config';
import { invalidateConfigCache } from '../../../src/config/config-loader-facade';
import { clearConfigCache } from '../../../src/cliproxy/config/base-config-loader';

describe('codex cliproxy provider config repair', () => {
  let tempHome: string;
  let codexHome: string;
  let configPath: string;
  let env: NodeJS.ProcessEnv;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-provider-config-'));
    codexHome = path.join(tempHome, '.codex');
    configPath = path.join(codexHome, 'config.toml');
    env = { CODEX_HOME: codexHome } as NodeJS.ProcessEnv;
    process.env.CCS_HOME = tempHome;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    invalidateConfigCache();
    clearConfigCache();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function writeBackendConfig(backend: 'original' | 'plus'): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 1', 'cliproxy:', `  backend: ${backend}`, ''].join('\n'),
      'utf8'
    );
    invalidateConfigCache();
    clearConfigCache();
  }

  it('uses the original backend chatgpt_base_url alias by default', () => {
    // Codex CLI (wire_api = "responses") appends "/responses" to base_url. The
    // original CLIProxy backend serves the Codex Responses API only under the
    // "/backend-api/codex" alias, never at the bare root. Returning the root here
    // makes Codex call "http://127.0.0.1:8317/responses" -> 404 (issue #1597).
    expect(buildCodexCliproxyProviderBaseUrl(8317)).toBe('http://127.0.0.1:8317/backend-api/codex');
  });

  it('produces a Codex Responses endpoint the original backend actually serves (regression #1597)', () => {
    const baseUrl = buildCodexCliproxyProviderBaseUrl(8317);
    const responsesEndpoint = `${baseUrl.replace(/\/+$/, '')}/responses`;
    expect(responsesEndpoint).toBe('http://127.0.0.1:8317/backend-api/codex/responses');
    expect(responsesEndpoint).not.toBe('http://127.0.0.1:8317/responses');
  });

  it('uses the plus backend scoped Codex URL when configured', () => {
    writeBackendConfig('plus');
    expect(buildCodexCliproxyProviderBaseUrl(8317)).toBe(
      'http://127.0.0.1:8317/api/provider/codex'
    );
  });

  it('creates the cliproxy model provider when config.toml is missing', async () => {
    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('[model_providers.cliproxy]');
    expect(rawText).toContain('name = "CLIProxy Codex"');
    expect(rawText).toContain('base_url = "http://127.0.0.1:8317/backend-api/codex"');
    expect(rawText).toContain('env_key = "CLIPROXY_API_KEY"');
    expect(rawText).not.toContain('model_provider = "cliproxy"');
  });

  it('appends the missing provider while preserving existing raw config text', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(configPath, '# user note\nmodel = "gpt-5.4"\n', 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText.startsWith('# user note\nmodel = "gpt-5.4"\n\n')).toBe(true);
    expect(rawText).toContain('[model_providers.cliproxy]');
  });

  it('repairs Codex config files saved with a UTF-8 BOM', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = '\ufeffmodel = "gpt-5.4"\n';
    fs.writeFileSync(configPath, rawText, 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    const repairedText = fs.readFileSync(configPath, 'utf8');
    expect(repairedText.startsWith('\ufeffmodel = "gpt-5.4"\n\n')).toBe(true);
    expect(repairedText).toContain('[model_providers.cliproxy]');
  });

  it('repairs an existing incomplete cliproxy provider', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `[model_providers.cliproxy]
base_url = "http://localhost:8317/api/provider/codex"
wire_api = "responses"
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(9321, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('base_url = "http://127.0.0.1:9321/backend-api/codex"');
    expect(rawText).toContain('env_key = "CLIPROXY_API_KEY"');
    expect(rawText).toContain('requires_openai_auth = false');
    expect(rawText).toContain('supports_websockets = false');
  });

  it('removes native provider auth when ccsxp injects the token through env_key', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://127.0.0.1:8317/backend-api/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false

[model_providers.cliproxy.auth]
command = "/tmp/cliproxy-token"
timeout_ms = 5000
refresh_interval_ms = 300000
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('env_key = "CLIPROXY_API_KEY"');
    expect(rawText).not.toContain('[model_providers.cliproxy.auth]');
    expect(rawText).not.toContain('cliproxy-token');
  });

  it('preserves custom cliproxy provider values while repairing other fields', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `[model_providers.cliproxy]
name = "Old Name"
base_url = "https://cliproxy.example.com/api/provider/codex/responses"
env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"
wire_api = "chat"
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(9321, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CCS_CUSTOM_CLIPROXY_TOKEN');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain(
      'base_url = "https://cliproxy.example.com/api/provider/codex/responses"'
    );
    expect(rawText).toContain('env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"');
    expect(rawText).toContain('wire_api = "responses"');
  });

  it('repairs invalid cliproxy provider base URLs back to the managed local default', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "not-a-url"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(9321, env);

    expect(result.changed).toBe(true);
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain(`base_url = "${buildCodexCliproxyProviderBaseUrl(9321)}"`);
  });

  it('rejects invalid non-table model_providers values without appending broken TOML', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = 'model_providers = "legacy"\n';
    fs.writeFileSync(configPath, rawText, 'utf8');

    await expect(ensureCodexCliproxyProviderConfig(8317, env)).rejects.toThrow(
      '[model_providers] must be a table'
    );
    expect(fs.readFileSync(configPath, 'utf8')).toBe(rawText);
  });

  it('repairs a stale ready localhost provider to the original backend codex alias', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://localhost:8317/api/provider/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`;
    fs.writeFileSync(configPath, rawText, 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const repairedText = fs.readFileSync(configPath, 'utf8');
    expect(repairedText).toContain('base_url = "http://127.0.0.1:8317/backend-api/codex"');
    expect(repairedText).not.toContain('/api/provider/codex');
  });

  it('leaves a ready plus-backend localhost provider unchanged', async () => {
    writeBackendConfig('plus');
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://localhost:8317/api/provider/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`;
    fs.writeFileSync(configPath, rawText, 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(false);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(rawText);
  });

  it('leaves a ready remote provider unchanged', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "https://cliproxy.example.com/api/provider/codex"
env_key = "CCS_REMOTE_CLIPROXY_TOKEN"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`;
    fs.writeFileSync(configPath, rawText, 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(false);
    expect(result.envKey).toBe('CCS_REMOTE_CLIPROXY_TOKEN');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(rawText);
  });

  it('normalizes a ready native Codex tuning alias before requests reach cliproxy', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `model = "gpt-5.5-high-fast"

[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://127.0.0.1:8317"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('model = "gpt-5.5"');
    expect(rawText).toContain('model_reasoning_effort = "high"');
    expect(rawText).toContain('service_tier = "priority"');
    expect(rawText).toContain('[model_providers.cliproxy]');
    expect(rawText).not.toContain('gpt-5.5-high-fast');
  });

  it('normalizes a native Codex effort alias when adding the missing provider', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(configPath, 'model = "gpt-5.5-xhigh"\n', 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('model = "gpt-5.5"');
    expect(rawText).toContain('model_reasoning_effort = "xhigh"');
  });

  it('normalizes a native Codex minimal effort alias when adding the missing provider', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(configPath, 'model = "gpt-5.5-minimal"\n', 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('model = "gpt-5.5"');
    expect(rawText).toContain('model_reasoning_effort = "minimal"');
    expect(rawText).toContain('[model_providers.cliproxy]');
  });

  it('does not strip unknown top-level models that happen to end with effort tokens', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    const rawText = `model = "literal-high"

[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://127.0.0.1:8317/backend-api/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`;
    fs.writeFileSync(configPath, rawText, 'utf8');

    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(rawText);
  });
});
