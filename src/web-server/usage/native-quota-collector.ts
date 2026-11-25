/**
 * Native subscription quota collector — coordinator and public API facade for
 * Claude Code + Codex subscription quota collection.
 */

import type { BarSummaryRow } from '../routes/bar-routes';
import type { NativeQuotaDeps } from './native-quota-types';
import {
  claudeProfileStates,
  codexProfileStates,
  collectCachedOrParkedProfileRow,
  markDefaultAndSyncCache,
  markPausedAndSyncCache,
  pickRotatingLiveProfile,
  resetNativeQuotaState,
} from './quota-circuit-breaker';
import {
  getDefaultClaudeProfileFromDisk,
  getDefaultCodexProfileFromDisk,
  listClaudeProfilesFromDisk,
  listCodexProfilesFromDisk,
} from './quota-credential-resolver';
import {
  buildParkedClaudeProfileRow,
  collectClaudeRow,
  collectClaudeRowForProfile,
} from './claude-quota-collector';
import {
  buildParkedCodexProfileRow,
  collectCodexRow,
  collectCodexRowForProfile,
} from './codex-quota-collector';

export type { NativeQuotaDeps };
export { resetNativeQuotaState };

function safeResolve<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Build the native subscription rows for /summary.
 */
export async function getNativeAccountRows(
  deps: NativeQuotaDeps = {},
  opts?: { force?: boolean }
): Promise<BarSummaryRow[]> {
  const force = opts?.force ?? false;

  const hasProfileEnumeration =
    deps.listClaudeProfiles !== undefined ||
    deps.listCodexProfiles !== undefined ||
    deps.defaultClaudeProfile !== undefined ||
    deps.defaultCodexProfile !== undefined;

  const isLegacyTestHarness =
    !hasProfileEnumeration &&
    (deps.readCredentials !== undefined || deps.getDefaultCodexAccountId !== undefined);

  if (!isLegacyTestHarness) {
    return getNativeAccountRowsMultiProfile(deps, force);
  }

  const [claude, codex] = await Promise.all([
    collectClaudeRow(deps, force).catch(() => null),
    collectCodexRow(deps, force).catch(() => null),
  ]);

  const rows: BarSummaryRow[] = [];
  if (claude) rows.push(claude);
  if (codex) rows.push(codex);
  return rows;
}

async function getNativeAccountRowsMultiProfile(
  deps: NativeQuotaDeps,
  force: boolean
): Promise<BarSummaryRow[]> {
  const claudeProfiles = safeResolve(deps.listClaudeProfiles ?? listClaudeProfilesFromDisk, []);
  const codexProfiles = safeResolve(deps.listCodexProfiles ?? listCodexProfilesFromDisk, []);
  const claudeDefault = safeResolve(
    deps.defaultClaudeProfile ?? getDefaultClaudeProfileFromDisk,
    null
  );
  const codexDefault = safeResolve(
    deps.defaultCodexProfile ?? getDefaultCodexProfileFromDisk,
    null
  );

  const tasks: Promise<BarSummaryRow | null>[] = [];
  const results: (BarSummaryRow | null)[] = [];
  const now = (deps.now ?? Date.now)();

  const claudeRotating = pickRotatingLiveProfile(
    claudeProfileStates,
    claudeProfiles,
    claudeDefault,
    now
  );
  const codexRotating = pickRotatingLiveProfile(
    codexProfileStates,
    codexProfiles,
    codexDefault,
    now
  );

  for (const p of claudeProfiles) {
    const isDefault = p === claudeDefault;
    if (!isDefault && p !== claudeRotating) {
      results.push(
        markDefaultAndSyncCache(
          claudeProfileStates,
          p,
          collectCachedOrParkedProfileRow(claudeProfileStates, p, now, buildParkedClaudeProfileRow),
          false
        )
      );
      continue;
    }
    tasks.push(
      collectClaudeRowForProfile(p, deps, force)
        .then((r) => {
          if (!r) return null;
          const marked = markDefaultAndSyncCache(claudeProfileStates, p, r, isDefault);
          return isDefault ? marked : markPausedAndSyncCache(claudeProfileStates, p, marked);
        })
        .catch(() => null)
    );
  }

  for (const p of codexProfiles) {
    const isDefault = p === codexDefault;
    if (!isDefault && p !== codexRotating) {
      results.push(
        markDefaultAndSyncCache(
          codexProfileStates,
          p,
          collectCachedOrParkedProfileRow(codexProfileStates, p, now, buildParkedCodexProfileRow),
          false
        )
      );
      continue;
    }
    tasks.push(
      collectCodexRowForProfile(p, deps, force)
        .then((r) => {
          if (!r) return null;
          const marked = markDefaultAndSyncCache(codexProfileStates, p, r, isDefault);
          return isDefault ? marked : markPausedAndSyncCache(codexProfileStates, p, marked);
        })
        .catch(() => null)
    );
  }

  results.push(...(await Promise.all(tasks)));
  const rows = results.filter((r): r is BarSummaryRow => r !== null);

  return rows.sort((a, b) => {
    const sa = (a.surface ?? '') + ':' + (a.profile ?? '');
    const sb = (b.surface ?? '') + ':' + (b.profile ?? '');
    return sa.localeCompare(sb);
  });
}

/**
 * Last-known native rows from cache, WITHOUT any fetch (instant, no network).
 */
export function getCachedNativeAccountRows(): BarSummaryRow[] {
  const rows: BarSummaryRow[] = [];
  for (const state of claudeProfileStates.values()) {
    if (state.cachedRow) rows.push({ ...state.cachedRow, cached: true });
  }
  for (const state of codexProfileStates.values()) {
    if (state.cachedRow) rows.push({ ...state.cachedRow, cached: true });
  }
  return rows;
}
