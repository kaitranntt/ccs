import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildCodexCliproxyProviderBaseUrl,
  ensureCodexCliproxyProviderConfig,
} from '../../../src/targets/codex-cliproxy-provider-config';

describe('codex cliproxy provider config repair', () => {
  let tempHome: string;
  let codexHome: string;
  let configPath: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-provider-config-'));
    codexHome = path.join(tempHome, '.codex');
    configPath = path.join(codexHome, 'config.toml');
    env = { CODEX_HOME: codexHome } as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('creates the cliproxy model provider when config.toml is missing', async () => {
    const result = await ensureCodexCliproxyProviderConfig(8317, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CLIPROXY_API_KEY');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain('[model_providers.cliproxy]');
    expect(rawText).toContain('name = "CLIProxy Codex"');
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
    expect(rawText).toContain(`base_url = "${buildCodexCliproxyProviderBaseUrl(9321)}"`);
    expect(rawText).toContain('env_key = "CLIPROXY_API_KEY"');
    expect(rawText).toContain('requires_openai_auth = false');
    expect(rawText).toContain('supports_websockets = false');
  });

  it('preserves a custom cliproxy provider env key while repairing other fields', async () => {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      `[model_providers.cliproxy]
name = "Old Name"
base_url = "http://localhost:8317/api/provider/codex"
env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"
wire_api = "chat"
`,
      'utf8'
    );

    const result = await ensureCodexCliproxyProviderConfig(9321, env);

    expect(result.changed).toBe(true);
    expect(result.envKey).toBe('CCS_CUSTOM_CLIPROXY_TOKEN');
    const rawText = fs.readFileSync(configPath, 'utf8');
    expect(rawText).toContain(`base_url = "${buildCodexCliproxyProviderBaseUrl(9321)}"`);
    expect(rawText).toContain('env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"');
    expect(rawText).toContain('wire_api = "responses"');
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

  it('leaves a ready localhost provider unchanged', async () => {
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
});
