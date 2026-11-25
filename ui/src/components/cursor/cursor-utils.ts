import { DEFAULT_CURSOR_PORT } from '@/lib/default-ports';

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

function pickModelByPatterns(
  models: Array<{ id: string }>,
  patterns: RegExp[],
  fallback: string
): string {
  const matched = models.find((model) => patterns.some((pattern) => pattern.test(model.id)));
  return matched?.id ?? fallback;
}

function normalizeModelKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickModelByAliases(
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

export function resolveCursorPresetPatch(
  preset: 'codex53' | 'claude46' | 'gemini3',
  models: Array<{ id: string; name: string }>,
  fallbackModel: string
): Pick<CursorConfigDraft, 'model' | 'opus_model' | 'sonnet_model' | 'haiku_model'> {
  const codex53 = pickModelByAliases(
    models,
    ['gpt-5.3-codex', 'gpt53codex', 'GPT-5.3 Codex'],
    pickModelByPatterns(models, [/gpt[-.]?5.*codex/i], fallbackModel)
  );
  const codexMax = pickModelByAliases(
    models,
    ['gpt-5.1-codex-max', 'gpt51codexmax', 'GPT-5.1 Codex Max'],
    pickModelByPatterns(models, [/gpt[-.]?5.*codex.*max/i], codex53)
  );
  const codexFast = pickModelByAliases(
    models,
    ['gpt-5-fast', 'gpt5fast', 'GPT-5 Fast'],
    pickModelByPatterns(models, [/gpt[-.]?5.*fast/i], codex53)
  );
  const codexMini = pickModelByAliases(
    models,
    ['gpt-5-mini', 'gpt5mini', 'GPT-5 Mini'],
    pickModelByPatterns(models, [/gpt[-.]?5.*mini/i], codexFast)
  );
  const opus46 = pickModelByAliases(
    models,
    ['claude-4.6-opus', 'claude46opus', 'Claude 4.6 Opus'],
    pickModelByPatterns(models, [/claude[-.]?4\.?6.*opus/i, /claude.*opus/i], codex53)
  );
  const sonnet45 = pickModelByAliases(
    models,
    ['claude-4.5-sonnet', 'claude45sonnet', 'Claude 4.5 Sonnet'],
    pickModelByPatterns(models, [/claude[-.]?4\.?5.*sonnet/i, /claude.*sonnet/i], codex53)
  );
  const haiku45 = pickModelByAliases(
    models,
    ['claude-4.5-haiku', 'claude45haiku', 'Claude 4.5 Haiku'],
    pickModelByPatterns(models, [/claude[-.]?4\.?5.*haiku/i, /haiku/i], sonnet45)
  );
  const gemini3Pro = pickModelByAliases(
    models,
    ['gemini-3-pro', 'gemini3pro', 'Gemini 3 Pro'],
    pickModelByPatterns(models, [/gemini[-.]?3.*pro/i], codex53)
  );
  const gemini3Flash = pickModelByAliases(
    models,
    ['gemini-3-flash', 'gemini3flash', 'Gemini 3 Flash'],
    pickModelByPatterns(models, [/gemini[-.]?3.*flash/i, /gemini[-.]?2\.?5.*flash/i], gemini3Pro)
  );

  if (preset === 'codex53') {
    return {
      model: codex53,
      opus_model: codexMax,
      sonnet_model: codex53,
      haiku_model: codexMini,
    };
  }

  if (preset === 'claude46') {
    return {
      model: opus46,
      opus_model: opus46,
      sonnet_model: sonnet45,
      haiku_model: haiku45,
    };
  }

  return {
    model: gemini3Pro,
    opus_model: gemini3Pro,
    sonnet_model: gemini3Pro,
    haiku_model: gemini3Flash,
  };
}

export function parseRawSettings(value: string): RawSettingsParseResult {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        isValid: false,
        /* TODO i18n: missing key for "Raw settings must be a JSON object" */
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
      /* TODO i18n: missing key for "Invalid JSON" */
      error: (error as Error).message || 'Invalid JSON',
    };
  }
}
