/**
 * WebSearch Routes - WebSearch configuration and status
 */

import { Router, Request, Response } from 'express';

import type { WebSearchConfig } from '../../config/unified-config-types';
import { getWebSearchReadiness, getWebSearchCliProviders } from '../../utils/websearch-manager';
import {
  applyWebSearchApiKeyUpdates,
  getWebSearchApiKeyStates,
  WEBSEARCH_API_KEY_PROVIDERS,
  type WebSearchApiKeyProviderId,
} from '../../utils/websearch/provider-secrets';
import { normalizeSearxngBaseUrl } from '../../utils/websearch/types';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { getWebSearchConfig, mutateConfig } from '../../config/config-loader-facade';

const router = Router();
const WEBSEARCH_LOCAL_ACCESS_ERROR =
  'WebSearch endpoints require localhost access when dashboard auth is disabled.';
const DEFAULT_WEBSEARCH_MAX_RESULTS = 5;
const MAX_WEBSEARCH_MAX_RESULTS = 10;

type WebSearchApiKeyUpdates = Partial<Record<WebSearchApiKeyProviderId, string | null>>;

interface WebSearchDashboardPayload extends Partial<WebSearchConfig> {
  apiKeys?: WebSearchApiKeyUpdates;
}

function isWebSearchApiKeyProviderId(value: string): value is WebSearchApiKeyProviderId {
  return Object.prototype.hasOwnProperty.call(WEBSEARCH_API_KEY_PROVIDERS, value);
}

function clampWebSearchMaxResults(value: number | undefined, fallback: number): number {
  const candidate = Number.isFinite(value) ? (value as number) : fallback;
  const normalized = Number.isFinite(candidate) ? candidate : DEFAULT_WEBSEARCH_MAX_RESULTS;
  return Math.max(1, Math.min(MAX_WEBSEARCH_MAX_RESULTS, Math.floor(normalized)));
}

router.use((req: Request, res: Response, next) => {
  if (requireLocalAccessWhenAuthDisabled(req, res, WEBSEARCH_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

/**
 * GET /api/websearch - Get WebSearch configuration
 * Returns: normalized WebSearch configuration
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    const config = getWebSearchConfig();
    res.json({
      ...config,
      apiKeys: getWebSearchApiKeyStates(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/websearch - Update WebSearch configuration
 * Body: WebSearchConfig fields (enabled, providers)
 */
router.put('/', (req: Request, res: Response): void => {
  if (
    req.body === null ||
    req.body === undefined ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({ error: 'Invalid request body. Must be an object.' });
    return;
  }

  const { enabled, providers, apiKeys } = req.body as WebSearchDashboardPayload;

  // Validate enabled
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for enabled. Must be a boolean.' });
    return;
  }

  // Validate providers if specified
  if (
    providers !== undefined &&
    (providers === null || Array.isArray(providers) || typeof providers !== 'object')
  ) {
    res.status(400).json({ error: 'Invalid value for providers. Must be an object.' });
    return;
  }

  if (providers?.searxng?.url !== undefined && typeof providers.searxng.url !== 'string') {
    res.status(400).json({ error: 'Invalid value for providers.searxng.url. Must be a string.' });
    return;
  }

  const normalizedSearxngUrl =
    providers?.searxng?.url !== undefined
      ? normalizeSearxngBaseUrl(providers.searxng.url)
      : undefined;

  if (providers?.searxng?.url !== undefined && normalizedSearxngUrl === null) {
    res.status(400).json({
      error:
        'Invalid value for providers.searxng.url. Must be an http(s) base URL without credentials, query, or hash.',
    });
    return;
  }

  if (
    providers?.searxng?.max_results !== undefined &&
    (typeof providers.searxng.max_results !== 'number' ||
      !Number.isFinite(providers.searxng.max_results))
  ) {
    res.status(400).json({
      error: 'Invalid value for providers.searxng.max_results. Must be a number.',
    });
    return;
  }

  if (
    apiKeys !== undefined &&
    (apiKeys === null || Array.isArray(apiKeys) || typeof apiKeys !== 'object')
  ) {
    res.status(400).json({ error: 'Invalid value for apiKeys. Must be an object.' });
    return;
  }

  if (apiKeys) {
    for (const [providerId, value] of Object.entries(apiKeys)) {
      if (!isWebSearchApiKeyProviderId(providerId)) {
        res.status(400).json({ error: `Unsupported WebSearch provider: ${providerId}` });
        return;
      }

      if (value !== null && value !== undefined && typeof value !== 'string') {
        res.status(400).json({ error: `Invalid value for ${providerId} API key` });
        return;
      }
    }
  }

  try {
    mutateConfig((config) => {
      const existingSearxngUrl =
        normalizeSearxngBaseUrl(config.websearch?.providers?.searxng?.url) ?? '';

      config.websearch = {
        enabled: enabled ?? config.websearch?.enabled ?? true,
        providers: providers
          ? {
              exa: {
                enabled:
                  providers.exa?.enabled ?? config.websearch?.providers?.exa?.enabled ?? false,
                max_results:
                  providers.exa?.max_results ?? config.websearch?.providers?.exa?.max_results ?? 5,
              },
              tavily: {
                enabled:
                  providers.tavily?.enabled ??
                  config.websearch?.providers?.tavily?.enabled ??
                  false,
                max_results:
                  providers.tavily?.max_results ??
                  config.websearch?.providers?.tavily?.max_results ??
                  5,
              },
              duckduckgo: {
                enabled:
                  providers.duckduckgo?.enabled ??
                  config.websearch?.providers?.duckduckgo?.enabled ??
                  true,
                max_results:
                  providers.duckduckgo?.max_results ??
                  config.websearch?.providers?.duckduckgo?.max_results ??
                  5,
              },
              brave: {
                enabled:
                  providers.brave?.enabled ?? config.websearch?.providers?.brave?.enabled ?? false,
                max_results:
                  providers.brave?.max_results ??
                  config.websearch?.providers?.brave?.max_results ??
                  5,
              },
              searxng: {
                enabled:
                  providers.searxng?.enabled ??
                  config.websearch?.providers?.searxng?.enabled ??
                  false,
                url: normalizedSearxngUrl ?? existingSearxngUrl,
                max_results: clampWebSearchMaxResults(
                  providers.searxng?.max_results,
                  config.websearch?.providers?.searxng?.max_results ?? DEFAULT_WEBSEARCH_MAX_RESULTS
                ),
              },
              agy: {
                enabled:
                  providers.agy?.enabled ?? config.websearch?.providers?.agy?.enabled ?? false,
                model:
                  providers.agy?.model ??
                  config.websearch?.providers?.agy?.model ??
                  'gemini-2.5-flash',
                timeout: providers.agy?.timeout ?? config.websearch?.providers?.agy?.timeout ?? 90,
              },
              gemini: {
                enabled:
                  providers.gemini?.enabled ??
                  config.websearch?.providers?.gemini?.enabled ??
                  false,
                model:
                  providers.gemini?.model ??
                  config.websearch?.providers?.gemini?.model ??
                  'gemini-2.5-flash',
                timeout:
                  providers.gemini?.timeout ?? config.websearch?.providers?.gemini?.timeout ?? 55,
              },
              grok: {
                enabled:
                  providers.grok?.enabled ?? config.websearch?.providers?.grok?.enabled ?? false,
                timeout:
                  providers.grok?.timeout ?? config.websearch?.providers?.grok?.timeout ?? 55,
              },
              opencode: {
                enabled:
                  providers.opencode?.enabled ??
                  config.websearch?.providers?.opencode?.enabled ??
                  false,
                model:
                  providers.opencode?.model ??
                  config.websearch?.providers?.opencode?.model ??
                  'opencode/grok-code',
                timeout:
                  providers.opencode?.timeout ??
                  config.websearch?.providers?.opencode?.timeout ??
                  60,
              },
            }
          : config.websearch?.providers,
      };

      if (apiKeys) {
        config.global_env = {
          enabled: config.global_env?.enabled ?? true,
          env: applyWebSearchApiKeyUpdates(config.global_env?.env ?? {}, apiKeys),
        };
      }
    });

    res.json({
      success: true,
      websearch: {
        ...getWebSearchConfig(),
        apiKeys: getWebSearchApiKeyStates(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/websearch/status - Get WebSearch status
 * Returns: provider readiness + normalized provider status list
 */
router.get('/status', (_req: Request, res: Response): void => {
  try {
    const readiness = getWebSearchReadiness();
    const providers = getWebSearchCliProviders();

    res.json({
      providers,
      readiness: {
        status: readiness.readiness,
        message: readiness.message,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
