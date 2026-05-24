const LEGACY_GLMT_PROFILE = 'glmt';
const LEGACY_GLMT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const DIRECT_GLM_BASE_URL = 'https://api.z.ai/api/anthropic';

const GLMT_PROXY_ONLY_ENV_KEYS = [
  'API_TIMEOUT_MS',
  'ANTHROPIC_SAFE_MODE',
  'ENABLE_STREAMING',
  'MAX_THINKING_TOKENS',
] as const;

export interface GlmtNormalizationResult {
  env: Record<string, string>;
  warnings: string[];
  migrated: boolean;
}

export function isDeprecatedGlmtProfileName(profileName: string | null | undefined): boolean {
  return (profileName || '').trim().toLowerCase() === LEGACY_GLMT_PROFILE;
}

export function isLegacyGlmtBaseUrl(baseUrl: string | null | undefined): boolean {
  const normalized = (baseUrl || '').trim().toLowerCase().replace(/\/+$/, '');
  if (!normalized) {
    return false;
  }

  return normalized === LEGACY_GLMT_BASE_URL || normalized.includes('/api/coding/paas/v4');
}

export function normalizeDeprecatedGlmtEnv(env: Record<string, string>): GlmtNormalizationResult {
  const normalizedEnv = { ...env };
  let migrated = false;

  if (
    !normalizedEnv['ANTHROPIC_BASE_URL'] ||
    isLegacyGlmtBaseUrl(normalizedEnv['ANTHROPIC_BASE_URL'])
  ) {
    normalizedEnv['ANTHROPIC_BASE_URL'] = DIRECT_GLM_BASE_URL;
    migrated = true;
  }

  for (const key of GLMT_PROXY_ONLY_ENV_KEYS) {
    if (key in normalizedEnv) {
      delete normalizedEnv[key];
      migrated = true;
    }
  }

  return {
    env: normalizedEnv,
    warnings: buildGlmtCompatibilityWarnings(migrated),
    migrated,
  };
}

export function buildGlmtCompatibilityWarnings(migrated: boolean): string[] {
  const warnings = [
    'GLMT is deprecated and kept only as a compatibility path.',
    'Use ccs glm for Z.AI API profiles.',
    'Use ccs km for reasoning-first Kimi API profiles.',
  ];

  if (migrated) {
    warnings.splice(
      1,
      0,
      'CCS normalized legacy GLMT proxy settings to the direct GLM endpoint for this run.'
    );
  }

  return warnings;
}

export function getDirectGlmBaseUrl(): string {
  return DIRECT_GLM_BASE_URL;
}
