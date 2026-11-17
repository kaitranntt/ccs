import { maskSensitiveValue } from '../sensitive-keys';
import { getGlobalEnvConfig } from '../../config/config-loader-facade';

export type WebSearchApiKeyProviderId = 'exa' | 'tavily' | 'keenable' | 'brave';
export type WebSearchApiKeySource = 'global_env' | 'process_env' | 'both' | 'none';

export interface WebSearchApiKeyState {
  envVar: string;
  configured: boolean;
  available: boolean;
  source: WebSearchApiKeySource;
  maskedValue?: string;
}

interface WebSearchApiKeyDescriptor {
  envVar: string;
  alternateEnvVar: string;
}

export const WEBSEARCH_API_KEY_PROVIDERS: Record<
  WebSearchApiKeyProviderId,
  WebSearchApiKeyDescriptor
> = {
  exa: {
    envVar: 'EXA_API_KEY',
    alternateEnvVar: 'CCS_WEBSEARCH_EXA_API_KEY',
  },
  tavily: {
    envVar: 'TAVILY_API_KEY',
    alternateEnvVar: 'CCS_WEBSEARCH_TAVILY_API_KEY',
  },
  keenable: {
    envVar: 'KEENABLE_API_KEY',
    alternateEnvVar: 'CCS_WEBSEARCH_KEENABLE_API_KEY',
  },
  brave: {
    envVar: 'BRAVE_API_KEY',
    alternateEnvVar: 'CCS_WEBSEARCH_BRAVE_API_KEY',
  },
};

function getTrimmedEnvValue(
  env: Record<string, string | undefined>,
  names: string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function resolveSource(
  hasGlobalEnvValue: boolean,
  hasProcessEnvValue: boolean
): WebSearchApiKeySource {
  if (hasGlobalEnvValue && hasProcessEnvValue) {
    return 'both';
  }
  if (hasGlobalEnvValue) {
    return 'global_env';
  }
  if (hasProcessEnvValue) {
    return 'process_env';
  }
  return 'none';
}

export function getWebSearchApiKeyStates(): Record<
  WebSearchApiKeyProviderId,
  WebSearchApiKeyState
> {
  const globalEnvConfig = getGlobalEnvConfig();
  const storedEnv = globalEnvConfig.env ?? {};

  return (
    Object.entries(WEBSEARCH_API_KEY_PROVIDERS) as Array<
      [WebSearchApiKeyProviderId, WebSearchApiKeyDescriptor]
    >
  ).reduce(
    (acc, [providerId, descriptor]) => {
      const names = [descriptor.envVar, descriptor.alternateEnvVar];
      const globalEnvValue = getTrimmedEnvValue(storedEnv, names);
      const processEnvValue = getTrimmedEnvValue(process.env, names);
      const configured = Boolean(globalEnvValue || processEnvValue);
      const available = Boolean(processEnvValue || (globalEnvConfig.enabled && globalEnvValue));
      const visibleValue = globalEnvValue || processEnvValue;

      acc[providerId] = {
        envVar: descriptor.envVar,
        configured,
        available,
        source: resolveSource(Boolean(globalEnvValue), Boolean(processEnvValue)),
        maskedValue: visibleValue ? maskSensitiveValue(visibleValue) : undefined,
      };

      return acc;
    },
    {} as Record<WebSearchApiKeyProviderId, WebSearchApiKeyState>
  );
}

export function applyWebSearchApiKeyUpdates(
  env: Record<string, string>,
  apiKeys: Partial<Record<WebSearchApiKeyProviderId, string | null>> | undefined
): Record<string, string> {
  if (!apiKeys) {
    return env;
  }

  const nextEnv = { ...env };

  for (const [providerId, rawValue] of Object.entries(apiKeys) as Array<
    [WebSearchApiKeyProviderId, string | null | undefined]
  >) {
    if (rawValue === undefined) {
      continue;
    }

    const descriptor = WEBSEARCH_API_KEY_PROVIDERS[providerId];
    delete nextEnv[descriptor.alternateEnvVar];

    const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!normalizedValue) {
      delete nextEnv[descriptor.envVar];
      continue;
    }

    nextEnv[descriptor.envVar] = normalizedValue;
  }

  return nextEnv;
}
