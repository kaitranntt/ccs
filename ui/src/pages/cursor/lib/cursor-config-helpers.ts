/**
 * Cursor config helpers — pure functions used by form state and sections.
 * Extracted from monolithic cursor.tsx for isolation and testability.
 */

import { DEFAULT_CURSOR_PORT } from '@/lib/default-ports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorConfigDraft {
  port: string;
  auto_start: boolean;
  ghost_mode: boolean;
  model: string;
  opus_model: string;
  sonnet_model: string;
  haiku_model: string;
}

export interface RawSettingsParseResult {
  isValid: boolean;
  settings?: { env?: Record<string, string> };
  error?: string;
}

// ---------------------------------------------------------------------------
// Draft builder
// ---------------------------------------------------------------------------

export function buildConfigDraft(config?: {
  port?: number;
  auto_start?: boolean;
  ghost_mode?: boolean;
  model?: string;
  opus_model?: string;
  sonnet_model?: string;
  haiku_model?: string;
}): CursorConfigDraft {
  return {
    port: String(config?.port ?? DEFAULT_CURSOR_PORT),
    auto_start: config?.auto_start ?? false,
    ghost_mode: config?.ghost_mode ?? true,
    model: config?.model?.trim() || 'gpt-5.3-codex',
    opus_model: config?.opus_model?.trim() || '',
    sonnet_model: config?.sonnet_model?.trim() || '',
    haiku_model: config?.haiku_model?.trim() || '',
  };
}

// ---------------------------------------------------------------------------
// Probe snapshot key — used to detect stale probe results
// ---------------------------------------------------------------------------

export function buildProbeSnapshotKey(
  status?: {
    enabled?: boolean;
    authenticated?: boolean;
    token_expired?: boolean;
    daemon_running?: boolean;
    port?: number;
    ghost_mode?: boolean;
  },
  config?: {
    model?: string;
    auto_start?: boolean;
  }
): string {
  return JSON.stringify({
    enabled: status?.enabled ?? null,
    authenticated: status?.authenticated ?? null,
    token_expired: status?.token_expired ?? null,
    daemon_running: status?.daemon_running ?? null,
    port: status?.port ?? null,
    ghost_mode: status?.ghost_mode ?? null,
    auto_start: config?.auto_start ?? null,
    model: config?.model ?? null,
  });
}

// ---------------------------------------------------------------------------
// Model pickers (preset logic)
// ---------------------------------------------------------------------------

export function pickModelByPatterns(
  models: Array<{ id: string }>,
  patterns: RegExp[],
  fallback: string
): string {
  const matched = models.find((model) => patterns.some((pattern) => pattern.test(model.id)));
  return matched?.id ?? fallback;
}

export function normalizeModelKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function pickModelByAliases(
  models: Array<{ id: string; name: string }>,
  aliases: string[],
  fallback: string
): string {
  const normalizedAliasSet = new Set(aliases.map(normalizeModelKey));
  const direct = models.find((model) => normalizedAliasSet.has(normalizeModelKey(model.id)));
  if (direct) return direct.id;

  const byName = models.find((model) => normalizedAliasSet.has(normalizeModelKey(model.name)));
  if (byName) return byName.id;

  return fallback;
}

// ---------------------------------------------------------------------------
// Raw settings JSON parser
// ---------------------------------------------------------------------------

export function parseRawSettings(value: string): RawSettingsParseResult {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        isValid: false,
        error: 'Raw settings must be a JSON object',
      };
    }

    return {
      isValid: true,
      settings: parsed as { env?: Record<string, string> },
    };
  } catch (error) {
    return {
      isValid: false,
      error: (error as Error).message || 'Invalid JSON',
    };
  }
}
