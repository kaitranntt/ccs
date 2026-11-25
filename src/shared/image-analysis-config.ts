import {
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  type ImageAnalysisConfig,
} from '../config/unified-config-types';
import { mapExternalProviderName } from '../cliproxy/provider-capabilities';

export function normalizeImageAnalysisBackendId(
  value: string | null | undefined,
  knownBackends: Iterable<string> = []
): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const trimmed = value.trim();
  const canonicalProvider = mapExternalProviderName(trimmed.toLowerCase());
  if (canonicalProvider) {
    return canonicalProvider;
  }

  const knownBackendList = Array.from(knownBackends);
  const exactKey = knownBackendList.find((backend) => backend === trimmed);
  if (exactKey) {
    return exactKey;
  }

  const caseInsensitiveKey = knownBackendList.find(
    (backend) => backend.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (caseInsensitiveKey) {
    return caseInsensitiveKey;
  }

  return trimmed.toLowerCase();
}

export function canonicalizeImageAnalysisConfig(config: ImageAnalysisConfig): ImageAnalysisConfig {
  const normalizedProviderModels = Object.entries(config.provider_models ?? {}).reduce(
    (acc, [backend, model]) => {
      const normalizedBackend = normalizeImageAnalysisBackendId(
        backend,
        Object.keys(DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models)
      );
      if (!normalizedBackend || typeof model !== 'string' || model.trim().length === 0) {
        return acc;
      }

      acc[normalizedBackend] = model.trim();
      return acc;
    },
    {} as Record<string, string>
  );

  const normalizedFallbackBackend =
    normalizeImageAnalysisBackendId(
      config.fallback_backend ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend,
      Object.keys(normalizedProviderModels)
    ) ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend;

  const normalizedProfileBackends = Object.entries(config.profile_backends ?? {}).reduce(
    (acc, [profileName, backend]) => {
      const trimmedProfileName = profileName.trim();
      const normalizedBackend = normalizeImageAnalysisBackendId(
        backend,
        Object.keys(normalizedProviderModels)
      );
      if (!trimmedProfileName || !normalizedBackend) {
        return acc;
      }

      acc[trimmedProfileName] = normalizedBackend;
      return acc;
    },
    {} as Record<string, string>
  );

  return {
    enabled: config.enabled,
    timeout: config.timeout,
    provider_models: normalizedProviderModels,
    fallback_backend: normalizedFallbackBackend,
    profile_backends: normalizedProfileBackends,
  };
}
