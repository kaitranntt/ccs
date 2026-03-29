import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CodexRawConfigConflictError,
  CodexRawConfigValidationError,
  getCodexDashboardDiagnostics,
  getCodexRawConfig,
  patchCodexConfig,
  resolveCodexConfigPaths,
  saveCodexRawConfig,
  summarizeCodexFeatureFlags,
  summarizeCodexMcpServers,
  summarizeCodexModelProviders,
  summarizeCodexProjectTrust,
} from '../../../src/web-server/services/codex-dashboard-service';

const testRoot = path.join(os.tmpdir(), `ccs-codex-dashboard-test-${Date.now()}`);
const codexHome = path.join(testRoot, '.codex-home');
const codexStubPath = path.join(testRoot, 'codex');

function writeCodexStub(options?: { helpText?: string; version?: string }) {
  const helpText =
    options?.helpText ?? '  -c, --config <key=value>\n  -p, --profile <CONFIG_PROFILE>\n';
  const version = options?.version ?? 'codex-cli 0.118.0-alpha.3';

  fs.writeFileSync(
    codexStubPath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "${version}"
  exit 0
fi
if [ "$1" = "--help" ]; then
  printf '%s' "${helpText}"
  exit 0
fi
exit 0
`
  );
  fs.chmodSync(codexStubPath, 0o755);
}

beforeEach(() => {
  fs.mkdirSync(testRoot, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeCodexStub();
  process.env.CODEX_HOME = codexHome;
  process.env.CCS_CODEX_PATH = codexStubPath;
});

afterEach(() => {
  delete process.env.CODEX_HOME;
  delete process.env.CCS_CODEX_PATH;
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

describe('codex-dashboard-service', () => {
  it('resolves codex config paths with CODEX_HOME override', () => {
    const resolved = resolveCodexConfigPaths({
      env: {
        CODEX_HOME: '/tmp/custom-codex-home',
      } as NodeJS.ProcessEnv,
      homeDir: '/Users/tester',
    });

    expect(resolved.baseDir).toBe('/tmp/custom-codex-home');
    expect(resolved.baseDirDisplay).toBe('$CODEX_HOME');
    expect(resolved.configPath).toBe('/tmp/custom-codex-home/config.toml');
    expect(resolved.configDisplayPath).toBe('$CODEX_HOME/config.toml');
  });

  it('summarizes model providers with auth and header metadata', () => {
    const summary = summarizeCodexModelProviders({
      cliproxy: {
        base_url: 'http://127.0.0.1:8317/api/provider/codex',
        env_key: 'CLIPROXY_API_KEY',
        wire_api: 'responses',
        http_headers: { 'x-test': '1' },
      },
      local: {
        base_url: 'http://localhost:11434/v1',
        experimental_bearer_token: 'secret',
        supports_websockets: true,
      },
    });

    expect(summary.length).toBe(2);
    expect(summary[0].name).toBe('cliproxy');
    expect(summary[0].envKey).toBe('CLIPROXY_API_KEY');
    expect(summary[0].hasHttpHeaders).toBe(true);
    expect(summary[1].usesExperimentalBearerToken).toBe(true);
  });

  it('summarizes feature flags, project trust, and mcp servers', () => {
    const features = summarizeCodexFeatureFlags({
      multi_agent: true,
      shell_snapshot: false,
      custom_mode: 'beta',
    });
    const projects = summarizeCodexProjectTrust({
      '/tmp/a': { trust_level: 'trusted' },
      '/tmp/b': { trust_level: 'ask' },
    });
    const servers = summarizeCodexMcpServers({
      stdio: {
        command: 'npx',
        enabled_tools: ['browser_snapshot'],
      },
      remote: {
        url: 'https://example.test/mcp',
        bearer_token: 'not-allowed-inline',
        required: true,
      },
    });

    expect(features.enabled.map((feature) => feature.name)).toEqual(['multi_agent']);
    expect(features.disabled.map((feature) => feature.name)).toEqual(['shell_snapshot']);
    expect(features.all.find((feature) => feature.name === 'custom_mode')?.state).toBe('custom');
    expect(projects.length).toBe(2);
    expect(projects[0].trustLevel).toBe('trusted');
    expect(servers[0].transport).toBe('streamable-http');
    expect(servers[0].usesInlineBearerToken).toBe(true);
  });

  it('returns raw config payload for missing config.toml', async () => {
    const raw = await getCodexRawConfig();

    expect(raw.exists).toBe(false);
    expect(raw.path).toBe('$CODEX_HOME/config.toml');
    expect(raw.rawText).toBe('');
    expect(raw.config).toBeNull();
  });

  it('returns parseError when config.toml is invalid TOML', async () => {
    fs.writeFileSync(path.join(codexHome, 'config.toml'), 'model = "gpt-5.4"\n[features\n');

    const raw = await getCodexRawConfig();

    expect(raw.exists).toBe(true);
    expect(raw.parseError).toBeString();
    expect(raw.config).toBeNull();
  });

  it('includes docs links, support matrix, and config summaries in diagnostics', async () => {
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `model = "gpt-5.4"
profile = "work"
model_provider = "cliproxy"
approval_policy = "never"
sandbox_mode = "danger-full-access"
web_search = "live"

[features]
multi_agent = true
shell_snapshot = false
runtime_metrics = true

[model_providers.cliproxy]
name = "CLIProxyAPI"
base_url = "http://127.0.0.1:8317/api/provider/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"

[projects."/tmp/project-a"]
trust_level = "trusted"

[projects."/tmp/project-b"]
trust_level = "ask"

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
enabled_tools = ["browser_snapshot"]
tool_timeout_sec = 30

[profiles.work]
model = "gpt-5.4"
`
    );

    const diagnostics = await getCodexDashboardDiagnostics();

    expect(diagnostics.binary.installed).toBe(true);
    expect(diagnostics.binary.supportsConfigOverrides).toBe(true);
    expect(diagnostics.config.model).toBe('gpt-5.4');
    expect(diagnostics.config.activeProfile).toBe('work');
    expect(diagnostics.config.modelProvider).toBe('cliproxy');
    expect(diagnostics.config.profileCount).toBe(1);
    expect(diagnostics.config.modelProviderCount).toBe(1);
    expect(diagnostics.config.featureCount).toBe(3);
    expect(diagnostics.config.enabledFeatures.map((feature) => feature.name)).toEqual([
      'multi_agent',
      'runtime_metrics',
    ]);
    expect(diagnostics.config.trustedProjectCount).toBe(1);
    expect(diagnostics.config.untrustedProjectCount).toBe(1);
    expect(diagnostics.config.mcpServerCount).toBe(1);
    expect(diagnostics.docsReference.links.length).toBeGreaterThan(0);
    expect(diagnostics.supportMatrix.some((entry) => entry.id === 'default')).toBe(true);
  });

  it('warns when active profile is missing, config overrides are unavailable, or risky fields exist', async () => {
    writeCodexStub({ helpText: '  -p, --profile <CONFIG_PROFILE>\n' });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `profile = "missing-profile"

[model_providers.local]
experimental_bearer_token = "secret"

[mcp_servers.remote]
url = "https://example.test/mcp"
bearer_token = "secret"
`
    );

    const diagnostics = await getCodexDashboardDiagnostics();

    expect(
      diagnostics.warnings.some((warning) => warning.includes('does not expose --config overrides'))
    ).toBe(true);
    expect(
      diagnostics.warnings.some((warning) => warning.includes('missing from [profiles]'))
    ).toBe(true);
    expect(
      diagnostics.warnings.some((warning) => warning.includes('experimental_bearer_token'))
    ).toBe(true);
    expect(diagnostics.warnings.some((warning) => warning.includes('inline bearer_token'))).toBe(
      true
    );
  });

  it('saves valid raw config content', async () => {
    const result = await saveCodexRawConfig({
      rawText: 'model = "gpt-5.4"\n[features]\nmulti_agent = true\n',
    });

    const written = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');

    expect(result.success).toBe(true);
    expect(result.mtime).toBeGreaterThan(0);
    expect(written).toContain('model = "gpt-5.4"');
  });

  it('rejects invalid TOML while saving raw config', async () => {
    await expect(saveCodexRawConfig({ rawText: 'model = "gpt-5.4"\n[features\n' })).rejects.toThrow(
      CodexRawConfigValidationError
    );
  });

  it('rejects stale writes with conflict error', async () => {
    const configPath = path.join(codexHome, 'config.toml');
    fs.writeFileSync(configPath, 'model = "gpt-5.4"\n');

    await expect(
      saveCodexRawConfig({
        rawText: 'model = "gpt-5.3-codex"\n',
        expectedMtime: 1,
      })
    ).rejects.toThrow(CodexRawConfigConflictError);
  });

  it('rejects writes when expectedMtime differs by even 1ms', async () => {
    const configPath = path.join(codexHome, 'config.toml');
    fs.writeFileSync(configPath, 'model = "gpt-5.4"\n');

    const current = await getCodexRawConfig();

    await expect(
      saveCodexRawConfig({
        rawText: 'model = "gpt-5.4"\nprofile = "work"\n',
        expectedMtime: current.mtime + 1,
      })
    ).rejects.toThrow(CodexRawConfigConflictError);
  });

  it('patches top-level settings and project trust through structured controls', async () => {
    const result = await patchCodexConfig({
      kind: 'top-level',
      values: {
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
        webSearch: 'cached',
        toolOutputTokenLimit: 12000,
        personality: 'pragmatic',
      },
    });

    await patchCodexConfig({
      kind: 'project-trust',
      path: '/tmp/workspace-a',
      trustLevel: 'trusted',
      expectedMtime: result.mtime,
    });

    const diagnostics = await getCodexDashboardDiagnostics();
    expect(diagnostics.config.model).toBe('gpt-5.4');
    expect(diagnostics.config.modelReasoningEffort).toBe('high');
    expect(diagnostics.config.toolOutputTokenLimit).toBe(12000);
    expect(diagnostics.config.personality).toBe('pragmatic');
    expect(diagnostics.config.projectTrust[0]?.path).toBe('/tmp/workspace-a');
    expect(result.rawText).toContain('model = "gpt-5.4"');
    expect(result.config?.model).toBe('gpt-5.4');
  });

  it('expands home paths for project trust and rejects relative paths', async () => {
    const homeWorkspacePath = path.join(os.homedir(), 'codex-workspace');
    const expanded = await patchCodexConfig({
      kind: 'project-trust',
      path: '~/codex-workspace',
      trustLevel: 'trusted',
    });

    expect(expanded.rawText).toContain(`[projects."${homeWorkspacePath}"]`);

    await expect(
      patchCodexConfig({
        kind: 'project-trust',
        path: './relative-workspace',
        trustLevel: 'trusted',
      })
    ).rejects.toThrow(CodexRawConfigValidationError);
  });

  it('patches profiles, providers, and mcp servers through structured controls', async () => {
    const providerResult = await patchCodexConfig({
      kind: 'model-provider',
      action: 'upsert',
      name: 'cliproxy',
      values: {
        displayName: 'CLIProxy',
        baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
        envKey: 'CLIPROXY_API_KEY',
        wireApi: 'responses',
      },
    });

    const profileResult = await patchCodexConfig({
      kind: 'profile',
      action: 'upsert',
      name: 'deep-review',
      values: {
        model: 'gpt-5.4',
        modelProvider: 'cliproxy',
        modelReasoningEffort: 'xhigh',
      },
      setAsActive: true,
      expectedMtime: providerResult.mtime,
    });

    await patchCodexConfig({
      kind: 'mcp-server',
      action: 'upsert',
      name: 'playwright',
      values: {
        transport: 'stdio',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
        enabled: true,
        required: false,
        startupTimeoutSec: 15,
        toolTimeoutSec: 30,
      },
      expectedMtime: profileResult.mtime,
    });

    const diagnostics = await getCodexDashboardDiagnostics();
    expect(diagnostics.config.activeProfile).toBe('deep-review');
    expect(diagnostics.config.modelProviderCount).toBe(1);
    expect(diagnostics.config.mcpServerCount).toBe(1);

    const raw = await getCodexRawConfig();
    expect(raw.rawText).toContain('[profiles.deep-review]');
    expect(raw.rawText).toContain('[model_providers.cliproxy]');
    expect(raw.rawText).toContain('[mcp_servers.playwright]');
    expect(profileResult.rawText).toContain('[profiles.deep-review]');
    expect(profileResult.config?.profile).toBe('deep-review');
  });

  it('patches streamable-http mcp servers through structured controls', async () => {
    const result = await patchCodexConfig({
      kind: 'mcp-server',
      action: 'upsert',
      name: 'remote',
      values: {
        transport: 'streamable-http',
        url: 'https://example.test/mcp',
        enabled: true,
        required: true,
        toolTimeoutSec: 45,
        enabledTools: ['browser_snapshot'],
        disabledTools: ['slow_tool'],
      },
    });

    expect(result.rawText).toContain('[mcp_servers.remote]');
    expect(result.rawText).toContain('url = "https://example.test/mcp"');
    expect(result.rawText).toContain('required = true');

    const diagnostics = await getCodexDashboardDiagnostics();
    expect(diagnostics.config.mcpServers).toEqual([
      expect.objectContaining({
        name: 'remote',
        transport: 'streamable-http',
        required: true,
        toolTimeoutSec: 45,
        enabledToolsCount: 1,
        disabledToolsCount: 1,
      }),
    ]);
  });

  it('rejects structured patches when config.toml is invalid', async () => {
    fs.writeFileSync(path.join(codexHome, 'config.toml'), 'model = "gpt-5.4"\n[features\n');

    await expect(
      patchCodexConfig({
        kind: 'feature',
        feature: 'multi_agent',
        enabled: true,
      })
    ).rejects.toThrow(CodexRawConfigValidationError);
  });

  it('removes feature overrides when a feature is reset to inherited state', async () => {
    const enabled = await patchCodexConfig({
      kind: 'feature',
      feature: 'multi_agent',
      enabled: true,
    });

    expect(enabled.rawText).toContain('[features]');
    expect(enabled.rawText).toContain('multi_agent = true');

    const reset = await patchCodexConfig({
      kind: 'feature',
      feature: 'multi_agent',
      enabled: null,
      expectedMtime: enabled.mtime,
    });

    expect(reset.rawText).not.toContain('[features]');
    expect(reset.config?.features).toBeUndefined();
  });

  it('rejects malformed structured patch payloads at runtime', async () => {
    await expect(
      patchCodexConfig({
        kind: 'feature',
        feature: 'multi_agent',
        enabled: 'true' as unknown as boolean | null,
      })
    ).rejects.toThrow(CodexRawConfigValidationError);

    await expect(
      patchCodexConfig({
        kind: 'project-trust',
        path: '~/codex-workspace',
        trustLevel: 'always',
      })
    ).rejects.toThrow(CodexRawConfigValidationError);

    await expect(
      patchCodexConfig({
        kind: 'mcp-server',
        action: 'upsert',
        name: 'remote',
        values: {
          transport: 'http' as 'stdio' | 'streamable-http',
          url: 'https://example.test/mcp',
        },
      })
    ).rejects.toThrow(CodexRawConfigValidationError);
  });

  it('rejects invalid enum values even when they already exist in config.toml', async () => {
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      'model = "gpt-5.4"\napproval_policy = "legacy"\n'
    );

    await expect(
      patchCodexConfig({
        kind: 'top-level',
        values: {
          approvalPolicy: 'legacy' as unknown as 'on-request' | 'never' | 'untrusted' | null,
        },
      })
    ).rejects.toThrow(CodexRawConfigValidationError);
  });
});
