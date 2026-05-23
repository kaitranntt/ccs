import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
  CodexQuotaWindow,
  CodexQuotaResult,
  ClaudeQuotaResult,
  GeminiCliBucket,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
  QuotaResult,
} from './api-client';
import i18n from './i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format quota percentage for UI display.
 * Uses rounded whole numbers to keep quota labels compact and consistent.
 */
export function formatQuotaPercent(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const clamped = Math.max(0, Math.min(100, value));
  return `${Math.round(clamped)}`;
}

// Vibrant Tones Palette
const VIBRANT_TONES = [
  '#f94144', // Strawberry Red
  '#f3722c', // Pumpkin Spice
  '#f8961e', // Carrot Orange
  '#f9844a', // Atomic Tangerine
  '#f9c74f', // Tuscan Sun
  '#90be6d', // Willow Green
  '#43aa8b', // Seaweed
  '#4d908e', // Dark Cyan
  '#577590', // Blue Slate
  '#277da1', // Cerulean
];

// Provider color mapping (fixed colors for consistency)
const PROVIDER_COLORS: Record<string, string> = {
  agy: '#f3722c', // Pumpkin
  gemini: '#277da1', // Cerulean
  codex: '#f8961e', // Carrot
  claude: '#4d908e', // Dark Cyan
  vertex: '#577590', // Blue Slate
  iflow: '#f94144', // Strawberry
  qwen: '#f9c74f', // Tuscan
  kiro: '#4d908e', // Dark Cyan (AWS-inspired)
  ghcp: '#43aa8b', // Seaweed (GitHub-inspired)
  copilot: '#43aa8b', // Seaweed (GitHub-inspired)
};

// Status colors (from Analytics Cost breakdown) - darker for light theme contrast
export const STATUS_COLORS = {
  success: '#15803d', // Green-700 (was Seaweed #43aa8b)
  degraded: '#b45309', // Amber-700 (was Ochre #e09f3e)
  failed: '#b91c1c', // Red-700 (was Merlot #9e2a2b)
} as const;

export function getModelColor(model: string): string {
  // FNV-1a hash algorithm
  let hash = 0x811c9dc5;
  for (let i = 0; i < model.length; i++) {
    hash ^= model.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // Ensure positive index
  return VIBRANT_TONES[(hash >>> 0) % VIBRANT_TONES.length];
}

export function getProviderColor(provider: string): string {
  const normalized = provider.toLowerCase();
  return PROVIDER_COLORS[normalized] || getModelColor(provider);
}

/**
 * Sort models by tier: Primary (Claude/GPT) > Gemini 3 Pro > Gemini 2.5 > Others
 * Within each tier, sorts alphabetically by display name
 */
export function sortModelsByPriority<T extends { name: string; displayName?: string }>(
  models: T[]
): T[] {
  const getPriority = (model: T): number => {
    const name = (model.displayName || model.name).toLowerCase();

    // Tier 0: Primary models (Claude + GPT) - weekly limits, most valuable
    if (name.includes('claude') || name.includes('gpt')) return 0;

    // Tier 1: Gemini 3 Pro models - high capability
    if (name.includes('gemini 3') || name.includes('gemini-3')) return 1;

    // Tier 2: Gemini 2.5 Pro/Flash models - mid tier
    if (name.includes('gemini 2.5') || name.includes('gemini-2.5')) return 2;

    // Tier 3: Other Gemini models
    if (name.includes('gemini')) return 3;

    // Tier 4: Everything else
    return 4;
  };

  return [...models].sort((a, b) => {
    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    // Same priority: sort alphabetically by display name
    const nameA = (a.displayName || a.name).toLowerCase();
    const nameB = (b.displayName || b.name).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

/**
 * Format reset time - relative for <24h, absolute date for >=24h (weekly limits)
 */
export function formatResetTime(resetTime: string | null): string | null {
  if (!resetTime) return null;
  try {
    const reset = new Date(resetTime);
    const now = new Date();
    const diff = reset.getTime() - now.getTime();
    if (diff <= 0) return 'soon';

    const hours = Math.floor(diff / (1000 * 60 * 60));

    // Weekly/long resets: show absolute date (e.g., "01/27, 12:07")
    if (hours >= 24) {
      return reset.toLocaleDateString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // Daily resets: show relative time
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  } catch {
    return null;
  }
}

/**
 * Get earliest reset time from models array
 */
export function getEarliestResetTime<T extends { resetTime: string | null }>(
  models: T[]
): string | null {
  return models.reduce(
    (earliest, m) => {
      if (!m.resetTime) return earliest;
      if (!earliest) return m.resetTime;
      return new Date(m.resetTime) < new Date(earliest) ? m.resetTime : earliest;
    },
    null as string | null
  );
}

/**
 * Filter to get Claude/GPT models (primary models we care about for quota)
 * These have weekly limits vs Gemini's daily limits
 */
function filterPrimaryModels<T extends { name: string; displayName?: string }>(models: T[]): T[] {
  return models.filter((m) => {
    const name = (m.displayName || m.name || '').toLowerCase();
    return name.includes('claude') || name.includes('gpt');
  });
}

/**
 * Calculate the minimum quota percentage from Claude/GPT models.
 * Returns 0 if Claude/GPT models are missing (exhausted/removed from API response).
 * Only returns null if no models at all.
 */
export function getMinClaudeQuota<
  T extends { name: string; displayName?: string; percentage: number },
>(models: T[]): number | null {
  if (models.length === 0) return null;

  const primaryModels = filterPrimaryModels(models);

  // If no Claude/GPT models in response, they're exhausted (0%)
  if (primaryModels.length === 0) return 0;

  const percentages = primaryModels
    .map((m) => m.percentage)
    .filter((p) => typeof p === 'number' && isFinite(p));

  if (percentages.length === 0) return 0;
  return Math.min(...percentages);
}

/**
 * Get reset time for Claude/GPT models (primary models).
 * Returns null only if no primary models present in response.
 */
export function getClaudeResetTime<
  T extends { name: string; displayName?: string; resetTime: string | null },
>(models: T[]): string | null {
  if (models.length === 0) return null;

  const primaryModels = filterPrimaryModels(models);
  if (primaryModels.length === 0) return null;

  return primaryModels.reduce(
    (earliest, m) => {
      if (!m.resetTime) return earliest;
      if (!earliest) return m.resetTime;
      return new Date(m.resetTime) < new Date(earliest) ? m.resetTime : earliest;
    },
    null as string | null
  );
}

// Known primary models to show when exhausted (removed from API response)
const AGY_DENYLIST_REGEX = /claude-(?:opus|sonnet)-4(?:[.-])5(?:-thinking)?(?=(?:$|[^a-z0-9]))/i;

export function isDeniedAgyModelId(modelId: string): boolean {
  return AGY_DENYLIST_REGEX.test((modelId || '').trim());
}

const KNOWN_PRIMARY_MODELS = [
  { name: 'claude-opus-4-6-thinking', displayName: 'Claude Opus 4.6 (Thinking)' },
  { name: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { name: 'gpt-oss-120b', displayName: 'GPT-OSS 120B (Medium)' },
];

/** Model tier for visual grouping */
export type ModelTier = 'primary' | 'gemini-3' | 'gemini-2' | 'other';

/** Model with tier info for grouped display */
export interface TieredModel {
  name: string;
  displayName: string;
  percentage: number;
  tier: ModelTier;
  exhausted?: boolean;
}

/** Get tier label for display */
export function getTierLabel(tier: ModelTier): string {
  switch (tier) {
    case 'primary':
      return i18n.t('utils.tierPrimary');
    case 'gemini-3':
      return i18n.t('utils.tierGemini3');
    case 'gemini-2':
      return i18n.t('utils.tierGemini2');
    case 'other':
      return i18n.t('utils.tierOther');
  }
}

/** Determine tier for a model */
function getModelTier(name: string): ModelTier {
  const lower = name.toLowerCase();
  if (lower.includes('claude') || lower.includes('gpt')) return 'primary';
  if (lower.includes('gemini 3') || lower.includes('gemini-3')) return 'gemini-3';
  if (lower.includes('gemini 2') || lower.includes('gemini-2')) return 'gemini-2';
  return 'other';
}

/**
 * Convert models to tiered format with exhausted primary models injected.
 * Groups models by tier for visual display in tooltip.
 */
export function getModelsWithTiers<
  T extends { name: string; displayName?: string; percentage: number },
>(models: T[]): TieredModel[] {
  if (models.length === 0) return [];

  const primaryModels = filterPrimaryModels(models);
  const result: TieredModel[] = [];

  // If primary models exhausted, add known ones with 0%
  if (primaryModels.length === 0) {
    for (const known of KNOWN_PRIMARY_MODELS) {
      result.push({
        name: known.name,
        displayName: known.displayName,
        percentage: 0,
        tier: 'primary',
        exhausted: true,
      });
    }
  }

  // Add all models with tier info
  for (const m of models) {
    const displayName = m.displayName || m.name;
    const tier = getModelTier(displayName);
    result.push({
      name: m.name,
      displayName,
      percentage: m.percentage,
      tier,
      // Mark primary models at 0% as exhausted for red styling
      exhausted: tier === 'primary' && m.percentage === 0,
    });
  }

  // Sort by tier priority, then alphabetically within tier
  const tierOrder: ModelTier[] = ['primary', 'gemini-3', 'gemini-2', 'other'];
  return result.sort((a, b) => {
    const tierDiff = tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
    if (tierDiff !== 0) return tierDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Group tiered models by tier for sectioned display
 */
export function groupModelsByTier(models: TieredModel[]): Map<ModelTier, TieredModel[]> {
  const groups = new Map<ModelTier, TieredModel[]>();
  for (const m of models) {
    const existing = groups.get(m.tier) || [];
    existing.push(m);
    groups.set(m.tier, existing);
  }
  return groups;
}

export type CodexWindowKind =
  | 'usage-5h'
  | 'usage-weekly'
  | 'code-review-5h'
  | 'code-review-weekly'
  | 'code-review'
  | 'additional-5h'
  | 'additional-weekly'
  | 'unknown';

/**
 * Map a Codex window into a semantic bucket. Prefers explicit category metadata
 * (post-2026-04 windows) and falls back to label sniffing for legacy cached data.
 */
export function getCodexWindowKind(labelOrWindow: string | CodexWindowSummary): CodexWindowKind {
  if (typeof labelOrWindow === 'object' && labelOrWindow !== null) {
    const w = labelOrWindow;
    if (w.category === 'additional' && w.cadence) {
      return w.cadence === 'weekly' ? 'additional-weekly' : 'additional-5h';
    }
    if (w.category === 'code-review' && w.cadence) {
      return w.cadence === 'weekly' ? 'code-review-weekly' : 'code-review-5h';
    }
    if (w.category === 'usage' && w.cadence) {
      return w.cadence === 'weekly' ? 'usage-weekly' : 'usage-5h';
    }
    // Missing or incomplete category metadata -> fall through to label sniffing.
    return getCodexWindowKindFromLabel(w.label);
  }
  return getCodexWindowKindFromLabel(labelOrWindow);
}

function getCodexWindowKindFromLabel(label: string): CodexWindowKind {
  const lower = (label || '').toLowerCase();
  const isCodeReview = lower.includes('code review') || lower.includes('code_review');
  const isPrimary = lower.includes('primary');
  const isSecondary = lower.includes('secondary');

  if (isCodeReview) {
    if (isPrimary) return 'code-review-5h';
    if (isSecondary) return 'code-review-weekly';
    return 'code-review';
  }

  if (isPrimary) return 'usage-5h';
  if (isSecondary) return 'usage-weekly';
  return 'unknown';
}

/**
 * Strip a leading "GPT-X.Y-Codex-" prefix from a feature label and turn the
 * remainder into a "Codex <Feature>" display name. Other labels pass through unchanged.
 *
 * Examples:
 *   "GPT-5.3-Codex-Spark" -> "Codex Spark"
 *   "OmniReview"          -> "OmniReview"
 *   ""                    -> ""
 */
export function prettifyCodexFeatureLabel(featureLabel: unknown): string {
  const trimmed = typeof featureLabel === 'string' ? featureLabel.trim() : '';
  if (!trimmed) return '';
  const stripped = trimmed.replace(/^GPT-[\d.]+-Codex-/i, '');
  if (stripped !== trimmed && stripped.length > 0) {
    return `Codex ${stripped}`;
  }
  return trimmed;
}

type CodexWindowSummary = Pick<
  CodexQuotaWindow,
  'label' | 'resetAfterSeconds' | 'category' | 'cadence' | 'featureLabel'
>;

/**
 * Infer code-review window cadence by comparing against usage windows.
 * This keeps labels stable as countdown values decrease over time.
 */
function inferCodeReviewCadence(
  window: CodexWindowSummary,
  allWindows: CodexWindowSummary[]
): '5h' | 'weekly' | null {
  const kind = getCodexWindowKind(window);
  if (kind === 'code-review-weekly') return 'weekly';

  const reset = window.resetAfterSeconds;
  if (typeof reset !== 'number' || !isFinite(reset) || reset <= 0) return null;

  const usage5h = allWindows.find(
    (w) =>
      getCodexWindowKind(w) === 'usage-5h' &&
      typeof w.resetAfterSeconds === 'number' &&
      isFinite(w.resetAfterSeconds) &&
      w.resetAfterSeconds > 0
  );
  const usageWeekly = allWindows.find(
    (w) =>
      getCodexWindowKind(w) === 'usage-weekly' &&
      typeof w.resetAfterSeconds === 'number' &&
      isFinite(w.resetAfterSeconds) &&
      w.resetAfterSeconds > 0
  );

  if (!usage5h || !usageWeekly) return null;

  const diffTo5h = Math.abs(reset - (usage5h.resetAfterSeconds as number));
  const diffToWeekly = Math.abs(reset - (usageWeekly.resetAfterSeconds as number));
  return diffToWeekly <= diffTo5h ? 'weekly' : '5h';
}

export function getCodexWindowDisplayLabel(
  labelOrWindow: string | CodexWindowSummary,
  allWindows: CodexWindowSummary[] = []
): string {
  const label = typeof labelOrWindow === 'string' ? labelOrWindow : labelOrWindow.label;
  const currentWindow: CodexWindowSummary =
    typeof labelOrWindow === 'string'
      ? { label, resetAfterSeconds: null }
      : {
          label,
          resetAfterSeconds: labelOrWindow.resetAfterSeconds,
          category: labelOrWindow.category,
          cadence: labelOrWindow.cadence,
          featureLabel: labelOrWindow.featureLabel,
        };
  const context = allWindows.length > 0 ? allWindows : [currentWindow];

  switch (getCodexWindowKind(currentWindow)) {
    case 'usage-5h':
      return i18n.t('quotaTooltip.fiveHourLimit');
    case 'usage-weekly':
      return i18n.t('quotaTooltip.weeklyLimit');
    case 'code-review-5h':
    case 'code-review-weekly':
    case 'code-review': {
      const inferred = inferCodeReviewCadence(currentWindow, context);
      if (inferred === '5h') return i18n.t('utils.codeReview5h');
      if (inferred === 'weekly') return i18n.t('utils.codeReviewWeekly');
      return i18n.t('utils.codeReview');
    }
    case 'additional-5h':
    case 'additional-weekly': {
      const pretty = prettifyCodexFeatureLabel(currentWindow.featureLabel ?? '');
      const name = pretty || label;
      const kind = getCodexWindowKind(currentWindow);
      if (kind === 'additional-5h') return i18n.t('utils.codexAdditional5h', { name });
      if (kind === 'additional-weekly') return i18n.t('utils.codexAdditionalWeekly', { name });
      return i18n.t('utils.codexAdditional', { name });
    }
    case 'unknown':
      return label;
  }
}

export interface CodexQuotaBreakdown {
  fiveHourWindow: CodexQuotaWindow | null;
  weeklyWindow: CodexQuotaWindow | null;
  codeReviewWindows: CodexQuotaWindow[];
  /** Additional rate-limit windows (e.g. GPT-5.3 Codex Spark). Excluded from core 5h/weekly summary. */
  additionalWindows: CodexQuotaWindow[];
  unknownWindows: CodexQuotaWindow[];
}

/**
 * Break down Codex windows into core usage windows (5h + weekly), code review,
 * additional (e.g. Spark), and unknown buckets.
 *
 * Prefers explicit category metadata when present so 'additional' windows
 * (e.g. GPT-5.3 Codex Spark) do not displace core usage windows in the summary.
 * Falls back to label sniffing for legacy cached data without metadata.
 */
export function getCodexQuotaBreakdown(windows: CodexQuotaWindow[]): CodexQuotaBreakdown {
  if (!windows || windows.length === 0) {
    return {
      fiveHourWindow: null,
      weeklyWindow: null,
      codeReviewWindows: [],
      additionalWindows: [],
      unknownWindows: [],
    };
  }

  let fiveHourWindow: CodexQuotaWindow | null = null;
  let weeklyWindow: CodexQuotaWindow | null = null;
  const codeReviewWindows: CodexQuotaWindow[] = [];
  const additionalWindows: CodexQuotaWindow[] = [];
  const unknownWindows: CodexQuotaWindow[] = [];
  // Eligible windows for the 5h/weekly fallback (must NOT include code-review or additional).
  const nonCodeReviewWindows: CodexQuotaWindow[] = [];

  const hasCategoryMetadata = windows.some((w) => Boolean(w.category));

  if (hasCategoryMetadata) {
    for (const window of windows) {
      if (window.category === 'usage') {
        if (window.cadence === '5h' && !fiveHourWindow) fiveHourWindow = window;
        else if (window.cadence === 'weekly' && !weeklyWindow) weeklyWindow = window;
        nonCodeReviewWindows.push(window);
      } else if (window.category === 'code-review') {
        codeReviewWindows.push(window);
      } else if (window.category === 'additional') {
        additionalWindows.push(window);
      } else {
        // Window has no category but the batch carries metadata for others -> treat as unknown.
        unknownWindows.push(window);
        nonCodeReviewWindows.push(window);
      }
    }
  } else {
    // Legacy path: classify via label sniffing for cached windows without metadata.
    for (const window of windows) {
      const kind = getCodexWindowKind(window.label);

      switch (kind) {
        case 'usage-5h':
          if (!fiveHourWindow) fiveHourWindow = window;
          nonCodeReviewWindows.push(window);
          break;
        case 'usage-weekly':
          if (!weeklyWindow) weeklyWindow = window;
          nonCodeReviewWindows.push(window);
          break;
        case 'code-review-5h':
        case 'code-review-weekly':
        case 'code-review':
          codeReviewWindows.push(window);
          break;
        case 'additional-5h':
        case 'additional-weekly':
          // Unreachable from label-only kind, but kept for exhaustiveness.
          additionalWindows.push(window);
          break;
        case 'unknown':
          unknownWindows.push(window);
          nonCodeReviewWindows.push(window);
          break;
      }
    }
  }

  // Fallback for API label changes: infer 5h/weekly from reset horizon when explicit labels are absent.
  // 'additional' windows are intentionally excluded from this pool to avoid leaking Spark windows
  // into the core usage badges on a fresh Pro account.
  if ((!fiveHourWindow || !weeklyWindow) && nonCodeReviewWindows.length > 0) {
    const withReset = nonCodeReviewWindows
      .filter((w) => typeof w.resetAfterSeconds === 'number' && w.resetAfterSeconds >= 0)
      .sort((a, b) => (a.resetAfterSeconds || 0) - (b.resetAfterSeconds || 0));

    if (!fiveHourWindow) {
      fiveHourWindow = withReset[0] || nonCodeReviewWindows[0] || null;
    }

    if (!weeklyWindow) {
      weeklyWindow =
        withReset.length > 1
          ? withReset[withReset.length - 1]
          : nonCodeReviewWindows.find((w) => w !== fiveHourWindow) || null;
    }
  }

  return {
    fiveHourWindow,
    weeklyWindow,
    codeReviewWindows,
    additionalWindows,
    unknownWindows,
  };
}

/**
 * Get minimum remaining percentage across Codex rate limit windows
 */
export function getMinCodexQuota(windows: CodexQuotaWindow[]): number | null {
  if (!windows || windows.length === 0) return null;

  const { fiveHourWindow, weeklyWindow } = getCodexQuotaBreakdown(windows);
  const usageWindows = [fiveHourWindow, weeklyWindow].filter(
    (w, index, arr): w is CodexQuotaWindow => !!w && arr.indexOf(w) === index
  );

  // Primary account quota should be driven by core usage windows, not code-review windows.
  const sourceWindows = usageWindows.length > 0 ? usageWindows : windows;
  const percentages = sourceWindows.map((w) => w.remainingPercent);
  return Math.min(...percentages);
}

/**
 * Get earliest reset time from Codex windows
 */
export function getCodexResetTime(windows: CodexQuotaWindow[]): string | null {
  if (!windows || windows.length === 0) return null;

  const { fiveHourWindow, weeklyWindow } = getCodexQuotaBreakdown(windows);
  const usageWindows = [fiveHourWindow, weeklyWindow].filter(
    (w, index, arr): w is CodexQuotaWindow => !!w && arr.indexOf(w) === index
  );
  const sourceWindows = usageWindows.length > 0 ? usageWindows : windows;
  const resets = sourceWindows.map((w) => w.resetAt).filter((t): t is string => t !== null);
  if (resets.length === 0) return null;
  return resets.sort()[0];
}

/**
 * Get minimum remaining percentage across Claude policy windows.
 */
export function getMinClaudePolicyQuota(quota: ClaudeQuotaResult): number | null {
  if (!quota.success) return null;

  const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly].filter(
    (window): window is NonNullable<typeof window> => !!window
  );
  if (coreWindows.length > 0) {
    return Math.min(...coreWindows.map((window) => window.remainingPercent));
  }

  const usageWindows = quota.windows.filter((window) => window.rateLimitType !== 'overage');
  if (usageWindows.length > 0) {
    return Math.min(...usageWindows.map((window) => window.remainingPercent));
  }

  return null;
}

/**
 * Get earliest reset time from Claude policy windows.
 */
export function getClaudePolicyResetTime(quota: ClaudeQuotaResult): string | null {
  if (!quota.success) return null;

  const coreResets = [quota.coreUsage?.fiveHour?.resetAt, quota.coreUsage?.weekly?.resetAt].filter(
    (value): value is string => !!value
  );
  if (coreResets.length > 0) {
    return coreResets.sort()[0];
  }

  const resets = quota.windows
    .filter((window) => window.rateLimitType !== 'overage')
    .map((window) => window.resetAt)
    .filter((value): value is string => value !== null);
  if (resets.length === 0) return null;
  return resets.sort()[0];
}

/**
 * Get minimum remaining percentage across Gemini CLI buckets
 */
export function getMinGeminiQuota(buckets: GeminiCliBucket[]): number | null {
  if (!buckets || buckets.length === 0) return null;
  const percentages = buckets.map((b) => b.remainingPercent);
  return Math.min(...percentages);
}

/**
 * Get earliest reset time from Gemini buckets
 */
export function getGeminiResetTime(buckets: GeminiCliBucket[]): string | null {
  if (!buckets || buckets.length === 0) return null;
  const resets = buckets.map((b) => b.resetTime).filter((t): t is string => t !== null);
  if (resets.length === 0) return null;
  return resets.sort()[0];
}

/**
 * Get minimum remaining percentage across GitHub Copilot quota snapshots
 */
export function getMinGhcpQuota(snapshots: GhcpQuotaResult['snapshots']): number | null {
  if (!snapshots) return null;

  const percentages = [snapshots.premiumInteractions, snapshots.chat, snapshots.completions]
    .filter((snapshot) => snapshot.reported !== false)
    .map((snapshot) => (snapshot.unlimited ? 100 : snapshot.percentRemaining))
    .filter((p) => typeof p === 'number' && isFinite(p));

  if (percentages.length === 0) return null;
  return Math.min(...percentages);
}

/**
 * Get reset time from GitHub Copilot quota result
 */
export function getGhcpResetTime(quotaResetDate: string | null): string | null {
  return quotaResetDate;
}

// ==================== Unified Quota Type Guards ====================

/** Unified quota result type for provider-agnostic handling */
export type UnifiedQuotaResult =
  | QuotaResult
  | CodexQuotaResult
  | ClaudeQuotaResult
  | GeminiCliQuotaResult
  | GhcpQuotaResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Type guard: Check if quota result is from Antigravity (agy) provider */
export function isAgyQuotaResult(quota: UnifiedQuotaResult): quota is QuotaResult {
  if (!isRecord(quota)) return false;
  const models = (quota as Partial<QuotaResult>).models;
  return typeof quota.success === 'boolean' && Array.isArray(models);
}

/** Type guard: Check if quota result is from Codex provider */
export function isCodexQuotaResult(quota: UnifiedQuotaResult): quota is CodexQuotaResult {
  if (!isRecord(quota)) return false;

  const candidate = quota as Partial<CodexQuotaResult>;
  if (typeof candidate.success !== 'boolean') return false;
  if (!Array.isArray(candidate.windows)) return false;
  if (!('planType' in candidate)) return false;

  return candidate.windows.every(
    (window) =>
      isRecord(window) &&
      typeof window.label === 'string' &&
      isFiniteNumber(window.usedPercent) &&
      isFiniteNumber(window.remainingPercent)
  );
}

/** Type guard: Check if quota result is from Claude provider */
export function isClaudeQuotaResult(quota: UnifiedQuotaResult): quota is ClaudeQuotaResult {
  if (!isRecord(quota)) return false;

  const candidate = quota as Partial<ClaudeQuotaResult>;
  if (typeof candidate.success !== 'boolean') return false;
  if (!Array.isArray(candidate.windows)) return false;
  if ('planType' in candidate) return false;

  return candidate.windows.every(
    (window) =>
      isRecord(window) &&
      typeof window.rateLimitType === 'string' &&
      isFiniteNumber(window.remainingPercent) &&
      typeof window.status === 'string'
  );
}

/** Type guard: Check if quota result is from Gemini CLI provider */
export function isGeminiQuotaResult(quota: UnifiedQuotaResult): quota is GeminiCliQuotaResult {
  if (!isRecord(quota)) return false;

  const candidate = quota as Partial<GeminiCliQuotaResult>;
  if (typeof candidate.success !== 'boolean') return false;
  if (!Array.isArray(candidate.buckets)) return false;

  return candidate.buckets.every(
    (bucket) =>
      isRecord(bucket) &&
      typeof bucket.id === 'string' &&
      isFiniteNumber(bucket.remainingFraction) &&
      isFiniteNumber(bucket.remainingPercent) &&
      Array.isArray(bucket.modelIds)
  );
}

/** Type guard: Check if quota result is from GitHub Copilot (ghcp) provider */
export function isGhcpQuotaResult(quota: UnifiedQuotaResult): quota is GhcpQuotaResult {
  if (!isRecord(quota)) return false;

  const candidate = quota as Partial<GhcpQuotaResult>;
  const snapshots = candidate.snapshots as Record<string, unknown> | null | undefined;
  if (typeof candidate.success !== 'boolean') return false;
  if (!isRecord(snapshots)) return false;

  const snapshotKeys: Array<keyof GhcpQuotaResult['snapshots']> = [
    'premiumInteractions',
    'chat',
    'completions',
  ];
  return snapshotKeys.every((key) => {
    const snapshot = snapshots[key] as Record<string, unknown> | undefined;
    return (
      isRecord(snapshot) &&
      isFiniteNumber(snapshot.percentRemaining) &&
      isFiniteNumber(snapshot.percentUsed)
    );
  });
}

// ==================== Unified Quota Helpers ====================

export interface QuotaFailureInfo {
  label: string;
  summary: string;
  actionHint: string | null;
  technicalDetail: string | null;
  rawDetail: string | null;
  tone: 'warning' | 'muted' | 'destructive';
}

function buildQuotaTechnicalDetail(quota: UnifiedQuotaResult): string | null {
  const details: string[] = [];
  if (typeof quota.httpStatus === 'number') {
    details.push(`HTTP ${quota.httpStatus}`);
  }
  if (typeof quota.errorCode === 'string' && quota.errorCode.trim()) {
    details.push(quota.errorCode.trim());
  }
  return details.length > 0 ? details.join(' | ') : null;
}

function buildQuotaRawDetail(
  quota: UnifiedQuotaResult,
  summary: string,
  technicalDetail: string | null
): string | null {
  const rawDetail = quota.errorDetail?.trim() || null;
  if (!rawDetail) return null;

  const normalizedRawDetail = rawDetail.toLowerCase();
  if (normalizedRawDetail === summary.toLowerCase()) {
    return null;
  }
  if (technicalDetail && normalizedRawDetail === technicalDetail.toLowerCase()) {
    return null;
  }

  return rawDetail;
}

export function getQuotaFailureInfo(
  quota: UnifiedQuotaResult | null | undefined
): QuotaFailureInfo | null {
  if (!quota || quota.success) {
    return null;
  }

  const summary = quota.error?.trim() || 'Quota information unavailable';
  const actionHint = quota.actionHint?.trim() || null;
  const errorCode = quota.errorCode?.trim().toLowerCase() || '';
  const technicalDetail = buildQuotaTechnicalDetail(quota);
  const rawDetail = buildQuotaRawDetail(quota, summary, technicalDetail);
  const lowerSummary = summary.toLowerCase();
  const entitlement = 'entitlement' in quota ? quota.entitlement : undefined;

  if (
    quota.errorCode === 'capacity_exhausted' ||
    entitlement?.capacityState === 'capacity_exhausted' ||
    lowerSummary.includes('no capacity available') ||
    lowerSummary.includes('capacity exhausted')
  ) {
    return {
      label: 'Capacity',
      summary,
      actionHint:
        actionHint ||
        'Retry later or switch to another model. This is a temporary provider capacity issue.',
      technicalDetail,
      rawDetail,
      tone: 'warning',
    };
  }

  if (
    quota.needsReauth ||
    errorCode === 'token_expired' ||
    errorCode === 'reauth_required' ||
    lowerSummary.includes('token expired') ||
    lowerSummary.includes('re-authenticate') ||
    lowerSummary.includes('reauth') ||
    lowerSummary.includes('expired or invalid')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelReauth'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintReauth'),
      technicalDetail,
      rawDetail,
      tone: 'warning',
    };
  }

  if (
    errorCode === 'deactivated_workspace' ||
    quota.httpStatus === 402 ||
    lowerSummary.includes('workspace deactivated') ||
    lowerSummary.includes('payment or workspace access required')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelWorkspace'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintWorkspace'),
      technicalDetail,
      rawDetail,
      tone: 'warning',
    };
  }

  if (
    entitlement?.accessState === 'not_entitled' ||
    quota.isForbidden ||
    quota.httpStatus === 403 ||
    errorCode === 'quota_api_forbidden' ||
    lowerSummary.includes('forbidden')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelNoAccess'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintNoAccess'),
      technicalDetail,
      rawDetail,
      tone: 'muted',
    };
  }

  if (
    quota.httpStatus === 429 ||
    errorCode === 'rate_limited' ||
    lowerSummary.includes('rate limited')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelRetry'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintRetry'),
      technicalDetail,
      rawDetail,
      tone: 'warning',
    };
  }

  if (
    errorCode === 'auth_file_missing' ||
    errorCode === 'missing_account_id' ||
    lowerSummary.includes('auth file not found') ||
    lowerSummary.includes('missing chatgpt-account-id')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelReconnect'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintReconnect'),
      technicalDetail,
      rawDetail,
      tone: 'muted',
    };
  }

  if (
    quota.retryable ||
    errorCode === 'network_timeout' ||
    errorCode === 'network_error' ||
    errorCode === 'provider_unavailable' ||
    lowerSummary.includes('timeout') ||
    lowerSummary.includes('network') ||
    lowerSummary.includes('fetch failed') ||
    lowerSummary.includes('service unavailable')
  ) {
    return {
      label: i18n.t('accountCard.failureLabelTemporary'),
      summary,
      actionHint: actionHint || i18n.t('accountCard.failureHintTemporary'),
      technicalDetail,
      rawDetail,
      tone: 'warning',
    };
  }

  return {
    label: i18n.t('accountCard.failureLabelUnavailable'),
    summary,
    actionHint,
    technicalDetail,
    rawDetail,
    tone: 'muted',
  };
}

/**
 * Get minimum quota percentage for any provider
 * Centralizes provider-specific logic to eliminate duplication
 */
export function getProviderMinQuota(
  provider: string,
  quota: UnifiedQuotaResult | null | undefined
): number | null {
  if (!quota?.success) return null;
  const normalizedProvider = provider.trim().toLowerCase();

  switch (normalizedProvider) {
    case 'agy':
      if (isAgyQuotaResult(quota)) {
        return getMinClaudeQuota(quota.models);
      }
      return null;
    case 'codex':
      if (isCodexQuotaResult(quota)) {
        return getMinCodexQuota(quota.windows);
      }
      return null;
    case 'claude':
    case 'anthropic':
      if (isClaudeQuotaResult(quota)) {
        return getMinClaudePolicyQuota(quota);
      }
      return null;
    case 'gemini':
      if (isGeminiQuotaResult(quota)) {
        return getMinGeminiQuota(quota.buckets);
      }
      return null;
    case 'ghcp':
    case 'github-copilot':
      if (isGhcpQuotaResult(quota)) {
        return getMinGhcpQuota(quota.snapshots);
      }
      return null;
    default:
      return null;
  }
}

/**
 * Get earliest reset time for any provider
 * Centralizes provider-specific logic to eliminate duplication
 */
export function getProviderResetTime(
  provider: string,
  quota: UnifiedQuotaResult | null | undefined
): string | null {
  if (!quota?.success) return null;
  const normalizedProvider = provider.trim().toLowerCase();

  switch (normalizedProvider) {
    case 'agy':
      if (isAgyQuotaResult(quota)) {
        return getClaudeResetTime(quota.models);
      }
      return null;
    case 'codex':
      if (isCodexQuotaResult(quota)) {
        return getCodexResetTime(quota.windows);
      }
      return null;
    case 'claude':
    case 'anthropic':
      if (isClaudeQuotaResult(quota)) {
        return getClaudePolicyResetTime(quota);
      }
      return null;
    case 'gemini':
      if (isGeminiQuotaResult(quota)) {
        return getGeminiResetTime(quota.buckets);
      }
      return null;
    case 'ghcp':
    case 'github-copilot':
      if (isGhcpQuotaResult(quota)) {
        return getGhcpResetTime(quota.quotaResetDate);
      }
      return null;
    default:
      return null;
  }
}
