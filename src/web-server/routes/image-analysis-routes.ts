import { Router, type Request, type Response } from 'express';
import * as fs from 'fs';

import {
  CLIPROXY_PROVIDER_IDS,
  getProviderDisplayName,
  mapExternalProviderName,
} from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { listApiProfiles, resolveCliproxyBridgeMetadata } from '../../api/services';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { expandPath } from '../../utils/helpers';

import type { Settings } from '../../types/config';
import { extractProviderFromPathname } from '../../cliproxy/ai-providers/model-id-normalizer';
import {
  normalizeImageAnalysisBackendId,
  resolveImageAnalysisRuntimeStatus,
} from '../../utils/hooks';
import { hasImageAnalyzerHook } from '../../utils/hooks/image-analyzer-hook-installer';
import { hasImageAnalysisProfileHook } from '../../utils/hooks/image-analyzer-profile-hook-injector';
import {
  hasImageAnalysisMcpReady,
  repairImageAnalysisRuntimeState,
} from '../../utils/image-analysis';
import {
  getImageAnalysisConfig,
  loadSettings,
  mutateConfig,
} from '../../config/config-loader-facade';

const router = Router();
const IMAGE_ANALYSIS_LOCAL_ACCESS_ERROR =
  'Image Analysis endpoints require localhost access when dashboard auth is disabled.';

type DashboardTarget = 'claude' | 'droid' | 'codex';
type DashboardSummaryState = 'ready' | 'partial' | 'needs_setup' | 'disabled';
type BackendState = 'ready' | 'starts_on_launch' | 'needs_auth' | 'needs_proxy' | 'review';
type CurrentTargetMode =
  | 'active'
  | 'bypassed'
  | 'fallback'
  | 'setup'
  | 'disabled'
  | 'native'
  | 'unresolved';

interface ImageAnalysisRouteBody {
  enabled?: boolean;
  timeout?: number;
  providerModels?: Record<string, string | null>;
  fallbackBackend?: string | null;
  profileBackends?: Record<string, string>;
}

function safeLoadSettings(settingsPath: string | null): Settings | null {
  if (!settingsPath) return null;

  try {
    const expandedPath = expandPath(settingsPath);
    if (!fs.existsSync(expandedPath)) return null;
    return loadSettings(expandedPath);
  } catch {
    return null;
  }
}

function resolveProviderFromBaseUrl(baseUrl: unknown): CLIProxyProvider | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

function resolveTarget(target: unknown): DashboardTarget {
  if (target === 'droid' || target === 'codex') return target;
  return 'claude';
}

function resolveCurrentTargetMode(
  target: DashboardTarget,
  status: Awaited<ReturnType<typeof resolveImageAnalysisRuntimeStatus>>,
  managedToolReady: boolean
): CurrentTargetMode {
  if (!status.enabled) return 'disabled';
  if (target !== 'claude') return 'bypassed';
  if (status.nativeReadPreference) return 'native';
  if (!managedToolReady) return 'setup';
  if (!status.backendId) return 'unresolved';
  if (status.effectiveRuntimeMode === 'native-read') return 'fallback';
  return 'active';
}

function resolveBackendState(
  status: Awaited<ReturnType<typeof resolveImageAnalysisRuntimeStatus>>
): BackendState {
  if (status.authReadiness === 'missing') return 'needs_auth';
  if (status.proxyReadiness === 'unavailable') return 'needs_proxy';
  if (status.proxyReadiness === 'stopped') return 'starts_on_launch';
  if (status.effectiveRuntimeMode === 'native-read' || status.status === 'attention')
    return 'review';
  return 'ready';
}

function getKnownBackends(): string[] {
  return Array.from(new Set(CLIPROXY_PROVIDER_IDS)).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function buildDashboardPayload() {
  const config = getImageAnalysisConfig();
  const { profiles, variants } = listApiProfiles();
  const sharedHookInstalled = hasImageAnalyzerHook();
  const managedToolReady = hasImageAnalysisMcpReady();

  const profileRows = await Promise.all(
    profiles.map(async (profile) => {
      const settingsPath = profile.settingsPath || null;
      const settings = safeLoadSettings(settingsPath);
      const cliproxyProvider =
        mapExternalProviderName(profile.name) ??
        resolveCliproxyBridgeMetadata(settings ?? undefined)?.provider ??
        resolveProviderFromBaseUrl(settings?.env?.ANTHROPIC_BASE_URL);
      const status = await resolveImageAnalysisRuntimeStatus(
        {
          profileName: profile.name,
          profileType: 'settings',
          cliproxyProvider,
          settingsPath,
          settings,
          cliproxyBridge: resolveCliproxyBridgeMetadata(settings ?? undefined),
          hookInstalled: settingsPath
            ? hasImageAnalysisProfileHook(profile.name, settingsPath)
            : undefined,
          sharedHookInstalled,
        },
        config
      );

      return {
        name: profile.name,
        kind: 'profile' as const,
        target: resolveTarget(profile.target),
        configured: profile.isConfigured,
        settingsPath,
        backendId: status.backendId,
        backendDisplayName: status.backendDisplayName,
        resolutionSource: status.resolutionSource,
        status: status.status,
        effectiveRuntimeMode: status.effectiveRuntimeMode,
        effectiveRuntimeReason: status.effectiveRuntimeReason,
        currentTargetMode: resolveCurrentTargetMode(
          resolveTarget(profile.target),
          status,
          managedToolReady
        ),
        profileModel: status.profileModel,
        nativeReadPreference: status.nativeReadPreference,
        nativeImageCapable: status.nativeImageCapable,
        nativeImageReason: status.nativeImageReason,
      };
    })
  );

  const variantRows = await Promise.all(
    variants.map(async (variant) => {
      const settingsPath =
        typeof variant.settings === 'string' && variant.settings !== '-' ? variant.settings : null;
      const settings = safeLoadSettings(settingsPath);
      const cliproxyProvider = mapExternalProviderName(variant.provider);
      const status = await resolveImageAnalysisRuntimeStatus(
        {
          profileName: variant.name,
          profileType: 'cliproxy',
          cliproxyProvider,
          isComposite: variant.provider === 'composite',
          settingsPath,
          settings,
          cliproxyBridge: resolveCliproxyBridgeMetadata(settings ?? undefined),
          hookInstalled: settingsPath
            ? hasImageAnalysisProfileHook(variant.name, settingsPath)
            : undefined,
          sharedHookInstalled,
        },
        config
      );

      return {
        name: variant.name,
        kind: 'variant' as const,
        target: resolveTarget(variant.target),
        configured: true,
        settingsPath,
        backendId: status.backendId,
        backendDisplayName: status.backendDisplayName,
        resolutionSource: status.resolutionSource,
        status: status.status,
        effectiveRuntimeMode: status.effectiveRuntimeMode,
        effectiveRuntimeReason: status.effectiveRuntimeReason,
        currentTargetMode: resolveCurrentTargetMode(
          resolveTarget(variant.target),
          status,
          managedToolReady
        ),
        profileModel: status.profileModel,
        nativeReadPreference: status.nativeReadPreference,
        nativeImageCapable: status.nativeImageCapable,
        nativeImageReason: status.nativeImageReason,
      };
    })
  );

  const allProfileRows = [...profileRows, ...variantRows].sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  const backendRows = await Promise.all(
    Object.entries(config.provider_models)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([backendId, model]) => {
        const status = await resolveImageAnalysisRuntimeStatus(
          {
            profileName: backendId,
            profileType: 'cliproxy',
            cliproxyProvider: mapExternalProviderName(backendId),
            hookInstalled: true,
            sharedHookInstalled: true,
          },
          config
        );

        return {
          backendId,
          displayName: getProviderDisplayName(backendId as CLIProxyProvider),
          model,
          state: resolveBackendState(status),
          authReadiness: status.authReadiness,
          authReason: status.authReason,
          proxyReadiness: status.proxyReadiness,
          proxyReason: status.proxyReason,
          profilesUsing: allProfileRows.filter(
            (profile) => profile.backendId === backendId && !profile.nativeReadPreference
          ).length,
        };
      })
  );

  const activeProfileCount = allProfileRows.filter(
    (row) => row.currentTargetMode === 'active'
  ).length;
  const bypassedProfileCount = allProfileRows.filter(
    (row) => row.currentTargetMode === 'bypassed'
  ).length;
  const mappedProfileCount = allProfileRows.filter(
    (row) => row.resolutionSource === 'profile-backend'
  ).length;
  const nativeProfileCount = allProfileRows.filter((row) => row.nativeReadPreference).length;
  const blockerCount = backendRows.filter(
    (row) => row.state === 'needs_auth' || row.state === 'needs_proxy' || row.state === 'review'
  ).length;

  let summaryState: DashboardSummaryState = 'ready';
  let title = 'Ready';
  let detail = `${activeProfileCount} profile${activeProfileCount === 1 ? '' : 's'} route through Image on the current Claude target path.`;

  if (nativeProfileCount > 0) {
    detail += ` ${nativeProfileCount} prefer native image reading.`;
  }

  if (!config.enabled) {
    summaryState = 'disabled';
    title = 'Disabled';
    detail = 'Image is turned off globally. Images and PDFs fall back to native file access.';
  } else if (!managedToolReady) {
    summaryState = 'needs_setup';
    title = 'Needs local runtime';
    detail =
      'CCS could not provision the local ImageAnalysis MCP runtime yet. Profiles will fall back to native Read until provisioning succeeds.';
  } else if (backendRows.length === 0) {
    summaryState = 'needs_setup';
    title = 'Needs provider models';
    detail = 'Add at least one provider model before turning Image on for profiles.';
  } else if (blockerCount > 0) {
    summaryState = activeProfileCount > 0 ? 'partial' : 'needs_setup';
    title = activeProfileCount > 0 ? 'Partially ready' : 'Needs setup';
    detail = `${blockerCount} backend${blockerCount === 1 ? '' : 's'} still need auth, runtime, or review before every profile path is healthy.`;
  }

  return {
    config: {
      enabled: config.enabled,
      timeout: config.timeout,
      providerModels: config.provider_models,
      fallbackBackend: config.fallback_backend ?? null,
      profileBackends: config.profile_backends ?? {},
    },
    summary: {
      state: summaryState,
      title,
      detail,
      backendCount: backendRows.length,
      mappedProfileCount,
      activeProfileCount,
      bypassedProfileCount,
      nativeProfileCount,
    },
    runtime: {
      managedToolReady,
      sharedHookInstalled,
    },
    backends: backendRows,
    profiles: allProfileRows,
    catalog: {
      knownBackends: getKnownBackends(),
      profileNames: allProfileRows.map((row) => row.name),
    },
  };
}

router.use((req: Request, res: Response, next) => {
  if (requireLocalAccessWhenAuthDisabled(req, res, IMAGE_ANALYSIS_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await buildDashboardPayload());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ImageAnalysisRouteBody;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Invalid request body. Must be an object.' });
    return;
  }

  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for enabled. Must be a boolean.' });
    return;
  }

  if (body.timeout !== undefined) {
    if (!Number.isInteger(body.timeout) || body.timeout < 10 || body.timeout > 600) {
      res.status(400).json({ error: 'Timeout must be an integer between 10 and 600 seconds.' });
      return;
    }
  }

  if (
    body.providerModels !== undefined &&
    (body.providerModels === null ||
      Array.isArray(body.providerModels) ||
      typeof body.providerModels !== 'object')
  ) {
    res.status(400).json({ error: 'Invalid value for providerModels. Must be an object.' });
    return;
  }

  if (
    body.profileBackends !== undefined &&
    (body.profileBackends === null ||
      Array.isArray(body.profileBackends) ||
      typeof body.profileBackends !== 'object')
  ) {
    res.status(400).json({ error: 'Invalid value for profileBackends. Must be an object.' });
    return;
  }

  if (
    body.fallbackBackend !== undefined &&
    body.fallbackBackend !== null &&
    typeof body.fallbackBackend !== 'string'
  ) {
    res.status(400).json({ error: 'Invalid value for fallbackBackend. Must be a string or null.' });
    return;
  }

  try {
    const currentConfig = getImageAnalysisConfig();
    const knownBackends = new Set([
      ...getKnownBackends(),
      ...Object.keys(currentConfig.provider_models),
    ]);
    const nextProviderModels = Object.entries(
      body.providerModels ?? currentConfig.provider_models
    ).reduce(
      (acc, [backendId, model]) => {
        const normalizedBackend = normalizeImageAnalysisBackendId(backendId, knownBackends);
        const normalizedModel = typeof model === 'string' ? model.trim() : '';
        if (!normalizedBackend || normalizedModel.length === 0) {
          return acc;
        }
        if (!knownBackends.has(normalizedBackend)) {
          throw new Error(`Unsupported provider backend "${backendId}".`);
        }
        acc[normalizedBackend] = normalizedModel;
        return acc;
      },
      {} as Record<string, string>
    );

    if (Object.keys(nextProviderModels).length === 0) {
      res.status(400).json({ error: 'At least one provider model must remain configured.' });
      return;
    }

    const requestedFallback =
      typeof body.fallbackBackend === 'string'
        ? body.fallbackBackend
        : currentConfig.fallback_backend;
    const normalizedFallback = normalizeImageAnalysisBackendId(
      requestedFallback,
      Object.keys(nextProviderModels)
    );
    if (!normalizedFallback || !nextProviderModels[normalizedFallback]) {
      res
        .status(400)
        .json({ error: 'Fallback backend must reference a configured provider model.' });
      return;
    }

    const nextProfileBackends = {} as Record<string, string>;
    for (const [profileName, backendId] of Object.entries(
      body.profileBackends ?? currentConfig.profile_backends ?? {}
    )) {
      const trimmedProfileName = profileName.trim();
      if (!trimmedProfileName) {
        continue;
      }

      const normalizedBackend = normalizeImageAnalysisBackendId(
        backendId,
        Object.keys(nextProviderModels)
      );
      if (!normalizedBackend || !nextProviderModels[normalizedBackend]) {
        res.status(400).json({
          error: `Profile mapping for "${trimmedProfileName}" references an unknown backend.`,
        });
        return;
      }

      nextProfileBackends[trimmedProfileName] = normalizedBackend;
    }

    mutateConfig((config) => {
      config.image_analysis = {
        enabled: body.enabled ?? currentConfig.enabled,
        timeout: body.timeout ?? currentConfig.timeout,
        provider_models: nextProviderModels,
        fallback_backend: normalizedFallback,
        profile_backends: nextProfileBackends,
      };
    });

    const nextEnabled = body.enabled ?? currentConfig.enabled;
    if (nextEnabled) {
      repairImageAnalysisRuntimeState();
    }

    res.json(await buildDashboardPayload());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unsupported provider backend')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
