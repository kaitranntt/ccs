import * as os from 'os';
import * as path from 'path';
import { expandPath } from '../utils/helpers';
import {
  probeTomlObjectFile,
  stringifyTomlObject,
  writeTomlFileAtomic,
} from '../web-server/services/compatible-cli-toml-file-service';
import { getModelMaxLevel } from '../cliproxy/model-catalog';
import { parseCodexModelTuningAlias } from '../cliproxy/ai-providers/model-id-normalizer';
import {
  buildLocalCodexResponsesBaseUrl,
  getConfiguredCliproxyBackend,
} from '../cliproxy/config/provider-route';
import { ConfigError } from '../errors/error-types';

export const CCSXP_CLIPROXY_SHORTCUT_ENV = 'CCSXP_CLIPROXY_SHORTCUT';
export const CODEX_CLIPROXY_PROVIDER_ID = 'cliproxy';
export const CODEX_CLIPROXY_PROVIDER_ENV_KEY = 'CLIPROXY_API_KEY';
export const CODEX_CLIPROXY_PROVIDER_NAME = 'CLIProxy Codex';
const CODEX_FAST_SERVICE_TIER = 'priority';

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
  // The Codex CLI provider uses wire_api = "responses", so the Codex CLI appends
  // "/responses" to this base_url. The local CLIProxy backends do NOT serve the
  // Codex Responses API at the bare root:
  //   - original backend: only "/v1/responses" and "/backend-api/codex/responses"
  //   - plus backend:     additionally "/api/provider/codex/responses"
  // Returning the root makes Codex call "http://127.0.0.1:<port>/responses" -> 404
  // (issue #1597). Use the chatgpt_base_url-compatible "/backend-api/codex" alias,
  // which both backends serve; keep the provider-scoped alias for the Plus backend
  // to preserve its existing per-provider routing.
  return buildLocalCodexResponsesBaseUrl(port, getConfiguredCliproxyBackend());
}

export function isCcsxpCliproxyShortcut(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CCSXP_CLIPROXY_SHORTCUT_ENV] === '1';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isValidCodexCliproxyBaseUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveProviderEnvKey(provider: Record<string, unknown> | null): string {
  const envKey = provider?.env_key;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return CODEX_CLIPROXY_PROVIDER_ENV_KEY;
}

const LOCALHOST_NAMES = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);

function getEffectiveUrlPort(url: URL): number {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === 'https:' ? 443 : 80;
}

function isManagedLocalUrl(url: URL): boolean {
  return ['http:', 'https:'].includes(url.protocol) && LOCALHOST_NAMES.has(url.hostname);
}

function shouldUseManagedLocalBaseUrl(current: URL, expected: URL): boolean {
  if (!isManagedLocalUrl(current) || !isManagedLocalUrl(expected)) {
    return false;
  }

  const currentPort = getEffectiveUrlPort(current);
  const expectedPort = getEffectiveUrlPort(expected);
  if (currentPort !== expectedPort) {
    return true;
  }

  const currentPath = current.pathname.replace(/\/+$/, '') || '/';
  const expectedPath = expected.pathname.replace(/\/+$/, '') || '/';
  return currentPath !== expectedPath;
}

function resolveProviderBaseUrl(
  provider: Record<string, unknown>,
  fallbackBaseUrl: string
): string {
  const baseUrl = provider.base_url;
  if (!isValidCodexCliproxyBaseUrl(baseUrl)) {
    return fallbackBaseUrl;
  }

  const trimmed = baseUrl.trim();
  try {
    const current = new URL(trimmed);
    const expected = new URL(fallbackBaseUrl);
    if (shouldUseManagedLocalBaseUrl(current, expected)) {
      return fallbackBaseUrl;
    }
  } catch {
    return fallbackBaseUrl;
  }

  return trimmed;
}

function isProviderReady(
  provider: Record<string, unknown>,
  envKey: string,
  expectedBaseUrl: string
): boolean {
  return (
    provider.name === CODEX_CLIPROXY_PROVIDER_NAME &&
    isValidCodexCliproxyBaseUrl(provider.base_url) &&
    typeof provider.base_url === 'string' &&
    resolveProviderBaseUrl(provider, expectedBaseUrl) === provider.base_url.trim() &&
    provider.env_key === envKey &&
    provider.auth === undefined &&
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

function appendProviderBlock(rawText: string, baseUrl: string): string {
  const prefix = rawText.trimEnd();
  const providerBlock = stringifyTomlObject({
    model_providers: {
      [CODEX_CLIPROXY_PROVIDER_ID]: buildProviderConfig(baseUrl, CODEX_CLIPROXY_PROVIDER_ENV_KEY),
    },
  }).trimEnd();
  return prefix ? `${prefix}\n\n${providerBlock}\n` : `${providerBlock}\n`;
}

function normalizeTopLevelCodexModelAlias(config: Record<string, unknown>): boolean {
  const model = config.model;
  if (typeof model !== 'string') return false;

  const parsed = parseCodexModelTuningAlias(model);
  if (!parsed || (!parsed.effort && !parsed.serviceTier)) return false;
  if (!parsed.baseModel || getModelMaxLevel('codex', parsed.baseModel) === undefined) return false;

  config.model = parsed.baseModel;
  if (parsed.effort) config.model_reasoning_effort = parsed.effort;
  if (parsed.serviceTier) config.service_tier = CODEX_FAST_SERVICE_TIER;
  return true;
}

export async function ensureCodexCliproxyProviderConfig(
  port: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<CodexCliproxyProviderRepairResult> {
  const { configPath, displayPath } = resolveCodexConfigPath(env);
  const fileProbe = await probeTomlObjectFile(configPath, 'Codex user config', displayPath);

  if (fileProbe.diagnostics.readError) {
    throw new ConfigError(
      `Cannot repair ${displayPath}: ${fileProbe.diagnostics.readError}`,
      configPath
    );
  }
  if (fileProbe.diagnostics.parseError) {
    throw new ConfigError(
      `Cannot repair ${displayPath}: ${fileProbe.diagnostics.parseError}`,
      configPath
    );
  }

  const config = fileProbe.config ?? {};
  const modelProvidersValue = config.model_providers;
  const providers = asObject(modelProvidersValue);
  const expectedBaseUrl = buildCodexCliproxyProviderBaseUrl(port);
  const normalizedModelAlias = normalizeTopLevelCodexModelAlias(config);

  if (modelProvidersValue !== undefined && !providers) {
    throw new ConfigError(
      `Cannot repair ${displayPath}: [model_providers] must be a table.`,
      configPath
    );
  }

  if (!providers || !Object.prototype.hasOwnProperty.call(providers, CODEX_CLIPROXY_PROVIDER_ID)) {
    await writeTomlFileAtomic({
      filePath: configPath,
      rawText: normalizedModelAlias
        ? stringifyTomlObject({
            ...config,
            model_providers: {
              ...(providers ?? {}),
              [CODEX_CLIPROXY_PROVIDER_ID]: buildProviderConfig(
                expectedBaseUrl,
                CODEX_CLIPROXY_PROVIDER_ENV_KEY
              ),
            },
          })
        : appendProviderBlock(fileProbe.rawText, expectedBaseUrl),
      expectedMtime: fileProbe.diagnostics.mtimeMs ?? undefined,
      fileLabel: 'config.toml',
    });
    return { changed: true, configPath, displayPath, envKey: CODEX_CLIPROXY_PROVIDER_ENV_KEY };
  }

  const currentProvider = asObject(providers[CODEX_CLIPROXY_PROVIDER_ID]);
  if (!currentProvider) {
    throw new ConfigError(
      `Cannot repair ${displayPath}: [model_providers.${CODEX_CLIPROXY_PROVIDER_ID}] must be a table.`,
      configPath
    );
  }

  const envKey = resolveProviderEnvKey(currentProvider);
  const providerReady = isProviderReady(currentProvider, envKey, expectedBaseUrl);

  if (!providerReady) {
    providers[CODEX_CLIPROXY_PROVIDER_ID] = {
      ...currentProvider,
      ...buildProviderConfig(resolveProviderBaseUrl(currentProvider, expectedBaseUrl), envKey),
    };
    delete (providers[CODEX_CLIPROXY_PROVIDER_ID] as Record<string, unknown>).auth;
  }

  if (providerReady && !normalizedModelAlias) {
    return { changed: false, configPath, displayPath, envKey };
  }

  await writeTomlFileAtomic({
    filePath: configPath,
    rawText: stringifyTomlObject(config),
    expectedMtime: fileProbe.diagnostics.mtimeMs ?? undefined,
    fileLabel: 'config.toml',
  });
  return { changed: true, configPath, displayPath, envKey };
}
