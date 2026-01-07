/**
 * API Key Pre-flight Validator
 *
 * Quick validation of API keys before Claude CLI launch.
 * Catches expired keys early with actionable error messages.
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/** Default placeholders that indicate unconfigured keys */
const DEFAULT_PLACEHOLDERS = [
  'YOUR_GLM_API_KEY_HERE',
  'YOUR_KIMI_API_KEY_HERE',
  'YOUR_MINIMAX_API_KEY_HERE',
  'YOUR_API_KEY_HERE',
  'YOUR-API-KEY-HERE',
  'PLACEHOLDER',
  '',
];

interface ProviderConfig {
  name: string;
  profile: string;
  defaultBaseUrl: string;
  path: string;
  displayName: string;
  dashboardUrl: string;
}

async function validateProviderKey(
  apiKey: string,
  config: ProviderConfig,
  baseUrl?: string,
  timeoutMs = 2000
): Promise<ValidationResult> {
  if (process.env.CCS_SKIP_PREFLIGHT === '1') {
    return { valid: true };
  }

  if (!apiKey || DEFAULT_PLACEHOLDERS.includes(apiKey.toUpperCase())) {
    return {
      valid: false,
      error: 'API key not configured',
      suggestion:
        `Set ANTHROPIC_AUTH_TOKEN in ~/.ccs/${config.profile}.settings.json\n` +
        `Or run: ccs config -> API Profiles -> ${config.name}`,
    };
  }

  const targetBase = baseUrl || config.defaultBaseUrl;
  let url: URL;
  try {
    url = new URL(config.path, targetBase);
  } catch {
    return { valid: true };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (result: ValidationResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || defaultPort,
      path: url.pathname,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'CCS-Preflight/1.0',
      },
    };

    const req = httpModule.request(options, (res) => {
      clearTimeout(timeoutId);

      if (res.statusCode === 200) {
        safeResolve({ valid: true });
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        safeResolve({
          valid: false,
          error: `API key rejected by ${config.displayName}`,
          suggestion:
            `Your key may have expired. To fix:\n` +
            `  1. Go to ${config.dashboardUrl} and regenerate your API key\n` +
            `  2. Update ~/.ccs/${config.profile}.settings.json with new key\n` +
            `  3. Or run: ccs config -> API Profiles -> ${config.name}`,
        });
      } else {
        if (process.env.CCS_DEBUG === '1') {
          console.error(
            `[CCS-Preflight] Unexpected status ${res.statusCode} from ${url.href} - fail-open`
          );
        }
        safeResolve({ valid: true });
      }

      res.resume();
    });

    req.on('error', () => {
      clearTimeout(timeoutId);
      safeResolve({ valid: true });
    });

    const timeoutId = setTimeout(() => {
      req.destroy();
      safeResolve({ valid: true });
    }, timeoutMs);

    req.end();
  });
}

export async function validateGlmKey(
  apiKey: string,
  baseUrl?: string,
  timeoutMs?: number
): Promise<ValidationResult> {
  return validateProviderKey(
    apiKey,
    {
      name: 'GLM',
      profile: 'glm',
      defaultBaseUrl: 'https://api.z.ai',
      path: '/api/anthropic/v1/models',
      displayName: 'Z.AI',
      dashboardUrl: 'Z.AI dashboard',
    },
    baseUrl,
    timeoutMs
  );
}

export async function validateMiniMaxKey(
  apiKey: string,
  baseUrl?: string,
  timeoutMs?: number
): Promise<ValidationResult> {
  return validateProviderKey(
    apiKey,
    {
      name: 'MiniMax',
      profile: 'mm',
      defaultBaseUrl: 'https://api.minimax.io',
      path: '/anthropic/v1/models',
      displayName: 'MiniMax',
      dashboardUrl: 'platform.minimax.io',
    },
    baseUrl,
    timeoutMs
  );
}
