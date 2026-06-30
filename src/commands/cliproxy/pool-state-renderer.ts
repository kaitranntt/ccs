/**
 * Pool State Renderer (CLI)
 *
 * Renders the pool context section appended to `ccs cliproxy quota` per provider:
 * - routing mode line (pool on/off, strategy, session affinity)
 * - effective drain order (Phase 4 resolver)
 * - per-account state: available / cooling-until-<time> / paused
 *
 * ASCII only. No color is required for correctness; color is applied via the ui
 * helpers, which already degrade to plain text under NO_COLOR / non-TTY.
 */

import { subheader, color, dim, warn } from '../../utils/ui';
import {
  resolvePoolStateWithProxyCooldowns,
  hasProxySourcedCooling,
  POOL_TIER_AWARE_PROVIDERS,
  type PoolAccountState,
  type PoolRoutingSettings,
  type PoolDrainOrderMode,
  type PoolState,
} from '../../cliproxy/accounts/pool-state';
import {
  getConfiguredCliproxyRoutingStrategy,
  getConfiguredCliproxySessionAffinitySettings,
  POOL_MAX_RETRY_CREDENTIALS,
} from '../../cliproxy/routing/routing-strategy';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import type { CLIProxyProvider } from '../../cliproxy/types';

/**
 * Read pool routing settings from the unified config. Pool routing, when on,
 * uses fill-first + session affinity regardless of stored routing values, so the
 * effective routing shown reflects the pool defaults in that case.
 */
export function readPoolRoutingSettings(): PoolRoutingSettings {
  const config = loadOrCreateUnifiedConfig();
  const poolEnabled = config.cliproxy?.pool_routing?.enabled === true;
  const maxRetryCredentials = config.cliproxy?.pool_routing?.max_retry_credentials;

  if (poolEnabled) {
    // Pool routing overrides routing to fill-first + affinity 1h (see generator).
    return {
      poolEnabled: true,
      strategy: 'fill-first',
      sessionAffinityEnabled: true,
      sessionAffinityTtl: '1h',
      maxRetryCredentials,
    };
  }

  const affinity = getConfiguredCliproxySessionAffinitySettings();
  return {
    poolEnabled: false,
    strategy: getConfiguredCliproxyRoutingStrategy(),
    sessionAffinityEnabled: affinity.enabled,
    sessionAffinityTtl: affinity.ttl,
    maxRetryCredentials,
  };
}

/** Format an epoch-ms reset time as a short relative + clock label. */
export function formatCooldownReset(until: number, now: number): string {
  const seconds = Math.max(0, Math.round((until - now) / 1000));
  const relative =
    seconds <= 0
      ? 'now'
      : seconds < 60
        ? `${seconds}s`
        : seconds < 3600
          ? `${Math.round(seconds / 60)}m`
          : seconds < 86400
            ? `${Math.round(seconds / 3600)}h`
            : `${Math.round(seconds / 86400)}d`;
  const clock = new Date(until).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${relative} (${clock})`;
}

/**
 * Human label + tone for a single account state. The three states map to
 * distinct client failure modes, so they are labelled differently on purpose.
 */
export function describeAccountState(
  account: PoolAccountState,
  now: number
): { label: string; tone: 'available' | 'cooling' | 'paused' } {
  switch (account.state) {
    case 'cooling': {
      const reset =
        account.cooldownUntil !== undefined
          ? formatCooldownReset(account.cooldownUntil, now)
          : 'unknown';
      const src = account.cooldownSource === 'memory' ? ' [in-process]' : '';
      return { label: `cooling until ${reset}${src}`, tone: 'cooling' };
    }
    case 'paused':
      // A pause can be manual (the user) OR automatic (ban detection,
      // cross-provider isolation, an expired-but-not-restored quota cooldown).
      // The classifier cannot tell which without a stored reason, so the label
      // must not claim "manual". See pool-state.ts classifyAccount.
      return { label: 'paused (manual or safety)', tone: 'paused' };
    case 'available':
    default:
      return { label: 'available', tone: 'available' };
  }
}

export function modeLabel(mode: PoolDrainOrderMode): string {
  switch (mode) {
    case 'manual':
      return 'manual (--set)';
    case 'tier':
      return 'tier-derived (--by-tier)';
    case 'file':
    default:
      return 'file order';
  }
}

/**
 * Render the drift warning. The honest copy depends on whether a stored order
 * exists: in file mode there is no stored order (the user reset or never set
 * one), so referencing a "stored order" or telling them to "re-apply" would be
 * false. File-mode drift means residual on-disk priorities (e.g. left by a prior
 * managed order) still steer the selector, and the fix is to clear them.
 */
function renderDrainOrderDrift(provider: CLIProxyProvider, pool: PoolState): void {
  if (!pool.drainOrder.hasDrift) {
    return;
  }

  if (pool.drainOrder.mode === 'file') {
    console.log(
      `    ${warn(
        `Drift: residual priorities from a previous managed order still steer the selector;\n` +
          `    clear them with "ccs cliproxy accounts order ${provider} --reset" (or re-auth the accounts).`
      )}`
    );
    return;
  }

  console.log(
    `    ${warn(
      `Drift: stored order does not match auth files; run "ccs cliproxy accounts order ${provider}" to inspect, then re-apply with --set/--by-tier.`
    )}`
  );
}

/**
 * Render the honesty note about cooling visibility.
 *
 * - Pool OFF: cooling is disabled at the proxy (stock stability mode), so no
 *   account ever shows a quota cooldown here. State that plainly.
 * - Pool ON but no live proxy reading available (proxy stopped/older binary, or
 *   the listing returned no cooling entries): the in-proxy 429 cooldowns that
 *   actually drive session hops are not visible, so say so rather than implying
 *   every account is healthy.
 */
function renderCoolingNote(pool: PoolState, settings: PoolRoutingSettings): void {
  if (!settings.poolEnabled) {
    const anyCooling = pool.states.some((s) => s.state === 'cooling');
    if (!anyCooling) {
      console.log(
        dim(
          '    Note: cooling is off (stock stability mode); accounts never show a quota cooldown here.'
        )
      );
    }
    return;
  }

  // Pool ON: only omit the caveat once we actually have live proxy-sourced
  // cooling data to show. Otherwise the states reflect CCS-side checks only.
  if (!hasProxySourcedCooling(pool)) {
    console.log(
      dim(
        '    Note: live in-proxy 429 cooldowns are not shown here; states reflect CCS-side checks only.'
      )
    );
  }
}

/**
 * Render the pool context section for one provider. Returns silently (renders
 * nothing) when the provider has no accounts, so quota output stays clean.
 *
 * Async because it folds in live in-proxy 429 cooldowns (the real session-hop
 * mechanism when pool routing is ON) via a single bounded management API read;
 * that read degrades silently when the proxy is stopped, remote, or older.
 */
export async function renderProviderPoolSection(
  provider: CLIProxyProvider,
  settings: PoolRoutingSettings,
  now: number = Date.now()
): Promise<void> {
  const pool = await resolvePoolStateWithProxyCooldowns({ provider, settings, now });

  if (pool.states.length === 0) {
    return;
  }

  console.log(subheader('Pool context'));

  // Routing mode line. The badge is a plain success-colored label (no marker)
  // so it reads as a status, not an action item.
  const routingBadge = settings.poolEnabled
    ? color('pool routing ON', 'success')
    : dim('pool routing off');
  const affinity = settings.sessionAffinityEnabled
    ? `affinity ${settings.sessionAffinityTtl}`
    : 'no affinity';
  // max-retry only applies when pool routing is on; mirror the generator's
  // default so the displayed value matches the generated config.
  const retry = settings.poolEnabled
    ? `, max-retry ${settings.maxRetryCredentials ?? POOL_MAX_RETRY_CREDENTIALS}`
    : '';
  console.log(`    Routing:  ${routingBadge} | ${settings.strategy} | ${affinity}${retry}`);

  // Drain order line. Order is sorted by the on-disk priority the selector
  // actually reads, so the first account here is the real "next" account.
  const orderMode = modeLabel(pool.drainOrder.mode);
  if (pool.drainOrder.order.length > 0) {
    console.log(`    Order:    ${dim(orderMode)} -> ${pool.drainOrder.order.join(' > ')}`);
  } else {
    console.log(`    Order:    ${dim(orderMode)} ${dim('(no active accounts)')}`);
  }

  renderDrainOrderDrift(provider, pool);

  // Per-account state. Render in drain order first, then any accounts not in the
  // order (paused accounts are excluded from the order but still listed).
  const stateById = new Map(pool.states.map((s) => [s.accountId, s]));
  const ordered: PoolAccountState[] = [];
  for (const id of pool.drainOrder.order) {
    const s = stateById.get(id);
    if (s) ordered.push(s);
  }
  for (const s of pool.states) {
    if (!pool.drainOrder.order.includes(s.accountId)) ordered.push(s);
  }

  for (const account of ordered) {
    const { label, tone } = describeAccountState(account, now);
    // Color-only labels (no markers) so the per-account list reads as a clean
    // status column. Available is success-colored; cooling and paused are
    // warning-colored to flag them without prefixing each line with a marker.
    const rendered = tone === 'available' ? color(label, 'success') : color(label, 'warning');
    const defaultMark = account.isDefault ? color(' *', 'success') : '';
    console.log(`      - ${account.accountId}${defaultMark}: ${rendered}`);
  }

  renderCoolingNote(pool, settings);

  // Resume hint: a pause can be manual OR automatic (ban detection,
  // cross-provider isolation, expired-but-unrestored quota cooldown). Point the
  // user at the real resume command so they can recover whichever caused it.
  if (pool.states.some((s) => s.state === 'paused')) {
    console.log(`    ${dim(`Resume:       ccs cliproxy resume <account>`)}`);
  }

  // Reset/management hints. Dim hint matches the order subcommand's "To update:"
  // style, and the indent stays outside the styling helper.
  const tierHint = POOL_TIER_AWARE_PROVIDERS.has(provider) ? ` (or --by-tier)` : '';
  console.log(
    `    ${dim(`Manage order: ccs cliproxy accounts order ${provider} --set <ids>${tierHint}`)}`
  );
  console.log('');
}
