/**
 * Profile lifecycle validation helpers.
 *
 * Shared by orphan discovery, copy, export/import, and dashboard routes.
 */

import {
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/ai-providers/model-id-normalizer';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { ProfileValidationIssue, ProfileValidationSummary } from './profile-types';

const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

const ALLOWED_ANTHROPIC_ENV_KEYS = new Set<string>([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  // Written by profile-writer when --extra-models is supplied
  'ANTHROPIC_EXTRA_MODELS',
  ...MODEL_ENV_KEYS,
]);

function resolveProviderFromBaseUrl(baseUrl: string): CLIProxyProvider | null {
  if (!baseUrl.trim()) return null;

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

function pushIssue(
  issues: ProfileValidationIssue[],
  level: ProfileValidationIssue['level'],
  code: string,
  message: string,
  field?: string,
  hint?: string
): void {
  issues.push({ level, code, message, field, hint });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Validate an API profile settings payload and return actionable diagnostics.
 */
export function validateApiProfileSettingsPayload(settings: unknown): ProfileValidationSummary {
  const issues: ProfileValidationIssue[] = [];
  const settingsObj = asObject(settings);

  if (!settingsObj) {
    pushIssue(
      issues,
      'error',
      'invalid_settings_type',
      'Settings payload must be a JSON object.',
      'settings',
      'Expected object like { "env": { ... } }'
    );
    return { valid: false, issues };
  }

  const envObj = asObject(settingsObj.env);
  if (!envObj) {
    pushIssue(
      issues,
      'error',
      'missing_env_object',
      'settings.env must be a JSON object.',
      'settings.env',
      'Add env keys such as ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN.'
    );
    return { valid: false, issues };
  }

  const baseUrl =
    typeof envObj.ANTHROPIC_BASE_URL === 'string' ? envObj.ANTHROPIC_BASE_URL.trim() : '';
  if (!baseUrl) {
    pushIssue(
      issues,
      'error',
      'missing_base_url',
      'ANTHROPIC_BASE_URL is required.',
      'env.ANTHROPIC_BASE_URL',
      'Example: https://api.openai.com/v1 or provider-specific endpoint.'
    );
  }

  const authToken =
    typeof envObj.ANTHROPIC_AUTH_TOKEN === 'string' ? envObj.ANTHROPIC_AUTH_TOKEN.trim() : '';
  if (!authToken) {
    pushIssue(
      issues,
      'warning',
      'missing_auth_token',
      'ANTHROPIC_AUTH_TOKEN is empty; profile may not run until token is configured.',
      'env.ANTHROPIC_AUTH_TOKEN',
      'Set token after import if exported in redacted mode.'
    );
  }

  const provider = resolveProviderFromBaseUrl(baseUrl);
  for (const modelKey of MODEL_ENV_KEYS) {
    const value = envObj[modelKey];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const denyReason = getDeniedModelIdReasonForProvider(value, provider);
    if (denyReason) {
      pushIssue(
        issues,
        'error',
        'model_denylisted',
        `${modelKey}: ${denyReason}`,
        `env.${modelKey}`,
        'Choose a supported model for the provider endpoint.'
      );
    }
  }

  for (const key of Object.keys(envObj)) {
    if (key.startsWith('ANTHROPIC_') && !ALLOWED_ANTHROPIC_ENV_KEYS.has(key)) {
      pushIssue(
        issues,
        'warning',
        'unknown_anthropic_env_key',
        `Unknown ANTHROPIC env key: ${key}`,
        `env.${key}`,
        'Check for typos or provider-unsupported settings.'
      );
    }
  }

  const hasErrors = issues.some((issue) => issue.level === 'error');
  return { valid: !hasErrors, issues };
}
