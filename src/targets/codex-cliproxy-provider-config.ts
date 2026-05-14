import * as os from 'os';
import * as path from 'path';
import { expandPath } from '../utils/helpers';
import {
  probeTomlObjectFile,
  stringifyTomlObject,
  writeTomlFileAtomic,
} from '../web-server/services/compatible-cli-toml-file-service';

export const CCSXP_CLIPROXY_SHORTCUT_ENV = 'CCSXP_CLIPROXY_SHORTCUT';
export const CODEX_CLIPROXY_PROVIDER_ID = 'cliproxy';
export const CODEX_CLIPROXY_PROVIDER_ENV_KEY = 'CLIPROXY_API_KEY';
export const CODEX_CLIPROXY_PROVIDER_NAME = 'CLIProxy Codex';

export interface CodexCliproxyProviderRepairResult {
  changed: boolean;
  configPath: string;
  displayPath: string;
  envKey: string;
}

function resolveCodexConfigPath(env: NodeJS.ProcessEnv = process.env): {
  configPath: string;
  displayPath: string;
} {
  const baseDir = path.resolve(
    env.CODEX_HOME ? expandPath(env.CODEX_HOME) : path.join(os.homedir(), '.codex')
  );
  const displayBase = env.CODEX_HOME ? '$CODEX_HOME' : '~/.codex';
  return {
    configPath: path.join(baseDir, 'config.toml'),
    displayPath: `${displayBase}/config.toml`,
  };
}

export function buildCodexCliproxyProviderBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/provider/codex`;
}

export function isCcsxpCliproxyShortcut(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CCSXP_CLIPROXY_SHORTCUT_ENV] === '1';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeLocalProviderUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/api/provider/codex'
    ) {
      url.hostname = '127.0.0.1';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return null;
  }
  return null;
}

function resolveProviderEnvKey(provider: Record<string, unknown> | null): string {
  const envKey = provider?.env_key;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return CODEX_CLIPROXY_PROVIDER_ENV_KEY;
}

function isProviderReady(
  provider: Record<string, unknown>,
  expectedBaseUrl: string,
  envKey: string
): boolean {
  return (
    provider.name === CODEX_CLIPROXY_PROVIDER_NAME &&
    normalizeLocalProviderUrl(provider.base_url) === expectedBaseUrl &&
    provider.env_key === envKey &&
    provider.wire_api === 'responses' &&
    provider.requires_openai_auth === false &&
    provider.supports_websockets === false
  );
}

function buildProviderConfig(baseUrl: string, envKey: string): Record<string, unknown> {
  return {
    name: CODEX_CLIPROXY_PROVIDER_NAME,
    base_url: baseUrl,
    env_key: envKey,
    wire_api: 'responses',
    requires_openai_auth: false,
    supports_websockets: false,
  };
}

function buildProviderBlock(baseUrl: string): string {
  return stringifyTomlObject({
    model_providers: {
      [CODEX_CLIPROXY_PROVIDER_ID]: buildProviderConfig(baseUrl, CODEX_CLIPROXY_PROVIDER_ENV_KEY),
    },
  });
}

function appendProviderBlock(rawText: string, baseUrl: string): string {
  const prefix = rawText.trimEnd();
  const providerBlock = buildProviderBlock(baseUrl).trimEnd();
  return prefix ? `${prefix}\n\n${providerBlock}\n` : `${providerBlock}\n`;
}

export async function ensureCodexCliproxyProviderConfig(
  port: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<CodexCliproxyProviderRepairResult> {
  const { configPath, displayPath } = resolveCodexConfigPath(env);
  const fileProbe = await probeTomlObjectFile(configPath, 'Codex user config', displayPath);

  if (fileProbe.diagnostics.readError) {
    throw new Error(`Cannot repair ${displayPath}: ${fileProbe.diagnostics.readError}`);
  }
  if (fileProbe.diagnostics.parseError) {
    throw new Error(`Cannot repair ${displayPath}: ${fileProbe.diagnostics.parseError}`);
  }

  const config = fileProbe.config ?? {};
  const modelProvidersValue = config.model_providers;
  const providers = asObject(modelProvidersValue);
  const expectedBaseUrl = buildCodexCliproxyProviderBaseUrl(port);

  if (modelProvidersValue !== undefined && !providers) {
    throw new Error(`Cannot repair ${displayPath}: [model_providers] must be a table.`);
  }

  if (!providers || !Object.prototype.hasOwnProperty.call(providers, CODEX_CLIPROXY_PROVIDER_ID)) {
    await writeTomlFileAtomic({
      filePath: configPath,
      rawText: appendProviderBlock(fileProbe.rawText, expectedBaseUrl),
      expectedMtime: fileProbe.diagnostics.mtimeMs ?? undefined,
      fileLabel: 'config.toml',
    });
    return { changed: true, configPath, displayPath, envKey: CODEX_CLIPROXY_PROVIDER_ENV_KEY };
  }

  const currentProvider = asObject(providers[CODEX_CLIPROXY_PROVIDER_ID]);
  if (!currentProvider) {
    throw new Error(
      `Cannot repair ${displayPath}: [model_providers.${CODEX_CLIPROXY_PROVIDER_ID}] must be a table.`
    );
  }

  const envKey = resolveProviderEnvKey(currentProvider);

  if (isProviderReady(currentProvider, expectedBaseUrl, envKey)) {
    return { changed: false, configPath, displayPath, envKey };
  }

  providers[CODEX_CLIPROXY_PROVIDER_ID] = {
    ...currentProvider,
    ...buildProviderConfig(expectedBaseUrl, envKey),
  };

  await writeTomlFileAtomic({
    filePath: configPath,
    rawText: stringifyTomlObject(config),
    expectedMtime: fileProbe.diagnostics.mtimeMs ?? undefined,
    fileLabel: 'config.toml',
  });
  return { changed: true, configPath, displayPath, envKey };
}
