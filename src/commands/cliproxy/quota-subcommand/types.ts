/**
 * Shared types for the quota-subcommand split.
 *
 * These types are implementation details of the quota CLI but are exposed via
 * the barrel so submodules can avoid circular imports.
 */

/** Arguments accepted by account-management subcommands (default/pause/resume). */
export interface CliproxyProfileArgs {
  name?: string;
  provider?: string;
  model?: string;
  account?: string;
  force?: boolean;
  yes?: boolean;
}

/** Tone of a single quota-failure display line. Drives coloring. */
export type QuotaFailureDisplayTone = 'error' | 'info' | 'dim';

/** A single rendered line in a quota failure block. */
export interface QuotaFailureDisplayEntry {
  tone: QuotaFailureDisplayTone;
  text: string;
}

/** Normalized shape of a Claude window used by the CLI renderer. */
export interface ClaudeDisplayWindow {
  rateLimitType: string;
  label: string;
  remainingPercent: number;
  resetAt: string | null;
  status: string;
}

/** Coarse classification of a Codex rate-limit window label. */
export type CodexWindowKind =
  | 'usage-5h'
  | 'usage-weekly'
  | 'code-review-5h'
  | 'code-review-weekly'
  | 'code-review'
  | 'unknown';

/** Runtime adapter that knows how to fetch/render a single quota provider. */
export interface QuotaProviderRuntime {
  fetch: (verbose: boolean) => Promise<unknown>;
  hasData: (result: unknown) => boolean;
  render: (result: unknown) => void;
  emptyTitle: string;
  emptyMessage: string;
  authCommand: string;
}
