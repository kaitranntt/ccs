import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { regenerateConfig } from '../config/generator';
import { getAuthDir, getConfigPathForPort } from '../config/path-resolver';
import {
  fetchCliproxyRoutingResponse,
  getCliproxyRoutingTarget,
  getRoutingErrorMessage,
} from './routing-strategy-http';
import type { CliproxyRoutingStrategy } from '../types';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import { getInstalledCliproxyVersion } from '../binary-manager';
import { compareVersions } from '../../utils/update-checker';
import { getConfigYamlPath } from '../../config/loader/io-locks';
import { createLogger } from '../../services/logging';

// Diagnostic-only logger for internal binary-compatibility notices. The
// user-facing result of enablePoolRouting is returned via the result
// message; this logger captures the version-compat caveat for diagnostics.
const logger = createLogger('cliproxy:routing:strategy');

export const DEFAULT_CLIPROXY_ROUTING_STRATEGY: CliproxyRoutingStrategy = 'round-robin';
export const DEFAULT_CLIPROXY_SESSION_AFFINITY_ENABLED = false;
export const DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL = '1h';

/**
 * Pool routing defaults written to config when pool routing is enabled.
 * fill-first + session affinity drains one account before using another,
 * maximising per-account context depth while honouring cooldown windows.
 */
export const POOL_ROUTING_STRATEGY: CliproxyRoutingStrategy = 'fill-first';
export const POOL_SESSION_AFFINITY_ENABLED = true;
export const POOL_SESSION_AFFINITY_TTL = '1h';
export const POOL_MAX_RETRY_CREDENTIALS = 3;

/**
 * Providers for which pool routing is available and the opt-in prompt
 * shows the full cooling/routing disclosure.  Others (codex, gemini)
 * have failover behaviour that is unverified for pool routing; they get
 * a softened prompt variant or no prompt until spike Test D confirms.
 */
export const POOL_ROUTING_VERIFIED_PROVIDERS = new Set(['claude', 'agy']);

/**
 * Minimum CLIProxy version that supports pool routing keys:
 * max-retry-credentials and the cooling flip.
 * Older binaries silently ignore unknown keys — pool rails would appear active
 * but have no effect.  Warn the user at enable time if below this version.
 *
 * NOTE: Update this constant when upstream first ships these keys.
 * Current best estimate based on spec; adjust after spike Test D confirms.
 */
export const POOL_ROUTING_MIN_VERSION = '6.9.45';

/**
 * Pool-active override warning text.  When pool routing is enabled the generator
 * forces fill-first/affinity/cooling and ignores the stored strategy/affinity, so
 * an apply via API or dashboard will not take effect.  The CLI prints this same
 * text before applying; appending it to the apply result message lets dashboard
 * and API consumers surface the same caveat (the CLI warns, the dashboard did not).
 */
function poolActiveOverrideNote(kind: 'strategy' | 'affinity'): string {
  const what = kind === 'strategy' ? 'stored strategy' : 'stored affinity setting';
  return (
    `[!] Pool routing is active. The ${what} will not take effect\n` +
    `    until pool routing is disabled: ccs cliproxy pool --disable`
  );
}

/** Whether pool routing is enabled in the local unified config. */
function isLocalPoolRoutingEnabled(): boolean {
  return loadOrCreateUnifiedConfig().cliproxy?.pool_routing?.enabled === true;
}

export interface EnablePoolRoutingResult {
  /** Whether the pool routing state actually changed */
  changed: boolean;
  /** Whether an existing explicit user routing setting was preserved */
  preservedExplicitSetting: boolean;
  /**
   * True when the config could not be regenerated and the pool flag was rolled
   * back.  Pool routing is NOT active; the message carries recovery guidance.
   */
  failed?: boolean;
  message: string;
}

export interface DisablePoolRoutingResult {
  changed: boolean;
  /** True when the config could not be regenerated and the flag was rolled back. */
  failed?: boolean;
  message: string;
}

/**
 * Read the raw (pre-defaults-merger) CCS config YAML.
 * The loaded config always injects `strategy: round-robin`, `session_affinity: false`,
 * `session_affinity_ttl: 1h` as defaults — so we cannot use the merged config to
 * detect whether the user actually wrote these keys.  This helper reads the raw YAML
 * and returns the partial routing block as-written on disk.
 *
 * Returns null if the config file does not exist or cannot be parsed.
 */
function readRawRoutingConfig(): {
  strategy?: unknown;
  session_affinity?: unknown;
  session_affinity_ttl?: unknown;
} | null {
  try {
    const yamlPath = getConfigYamlPath();
    if (!fs.existsSync(yamlPath)) return null;
    const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    const cliproxy = raw['cliproxy'] as Record<string, unknown> | undefined;
    if (!cliproxy || typeof cliproxy !== 'object') return null;
    const routing = cliproxy['routing'] as Record<string, unknown> | undefined;
    if (!routing || typeof routing !== 'object') return null;
    return routing as {
      strategy?: unknown;
      session_affinity?: unknown;
      session_affinity_ttl?: unknown;
    };
  } catch {
    return null;
  }
}

/**
 * Detect whether the user has set a routing strategy that differs from the
 * injected default (round-robin).
 *
 * Background: loadOrCreateUnifiedConfig persists injected defaults to disk on
 * first load, so `strategy: round-robin` may appear in the raw YAML even on a
 * pristine config — it was injected by CCS, not written by the user.  A stored
 * value EQUAL to the default is therefore treated as NOT explicit so that
 * enablePoolRouting does not falsely claim to be "preserving a custom strategy".
 *
 * A value that DIFFERS from the default (e.g. fill-first) is treated as
 * user-managed: preserve it and warn.
 */
export function hasExplicitRoutingStrategy(): boolean {
  const rawRouting = readRawRoutingConfig();
  if (rawRouting?.strategy === undefined) return false;
  // Equal to the injected default -> not explicitly customised by the user
  return rawRouting.strategy !== DEFAULT_CLIPROXY_ROUTING_STRATEGY;
}

/**
 * Detect whether the user has set session-affinity to a value that differs
 * from the injected default (false).
 *
 * Same rationale as hasExplicitRoutingStrategy: loadOrCreateUnifiedConfig may
 * persist `session_affinity: false` as a default, so presence alone is not
 * sufficient — only a value that differs from the default counts as explicit.
 */
export function hasExplicitSessionAffinity(): boolean {
  const rawRouting = readRawRoutingConfig();
  if (rawRouting?.session_affinity === undefined) return false;
  // Equal to the injected default -> not explicitly customised by the user
  return rawRouting.session_affinity !== DEFAULT_CLIPROXY_SESSION_AFFINITY_ENABLED;
}

/**
 * Enable pool routing: write pool_routing.enabled = true and the canonical
 * pool defaults (fill-first, session affinity 1h, max-retry-credentials: 3)
 * to the CCS unified config.  Regenerates the CLIProxy config.yaml so the
 * cooling flip and routing block take effect immediately (CLIProxy hot-reloads).
 *
 * Explicit user routing settings are preserved and a warning is emitted.
 * The pool flag is written regardless — the generator uses fill-first/affinity
 * from the pool defaults when pool is enabled, bypassing any stored routing.
 *
 * Idempotent: calling when already enabled is a no-op.
 */
export function enablePoolRouting(
  port: number,
  options: { configPath?: string; authDir?: string } = {}
): EnablePoolRoutingResult {
  const config = loadOrCreateUnifiedConfig();
  const already = config.cliproxy?.pool_routing?.enabled === true;
  const configPath = options.configPath ?? getConfigPathForPort(port);
  const authDir = options.authDir ?? getAuthDir();

  // Already-enabled repair path: the flag may have been persisted by a prior call
  // whose regenerateConfig threw (leaving config.yaml non-pool while the flag says
  // enabled).  Re-run regenerateConfig so `pool --enable` is an idempotent repair
  // command rather than a no-op that can never fix a half-applied state.
  if (already) {
    try {
      regenerateConfig(port, { configPath, authDir });
    } catch (err) {
      return {
        changed: false,
        preservedExplicitSetting: false,
        failed: true,
        message: `[X] Could not write CLIProxy config: ${(err as Error).message}.\n    Pool routing is flagged enabled but the config was not regenerated.\n    Fix the file permission and re-run: ccs cliproxy pool --enable`,
      };
    }
    return {
      changed: false,
      preservedExplicitSetting: false,
      message: 'Pool routing is already enabled.',
    };
  }

  const preservedExplicitSetting = hasExplicitRoutingStrategy() || hasExplicitSessionAffinity();

  // Spec step 3 / architecture: assert minimum CLIProxy version at enable time.
  // Stale binaries silently ignore max-retry-credentials and the cooling flip,
  // so pool rails would appear active but have no effect.  Warn and proceed.
  try {
    const installedVersion = getInstalledCliproxyVersion();
    if (compareVersions(installedVersion, POOL_ROUTING_MIN_VERSION) < 0) {
      logger.warn(
        'pool_routing.binary_below_minimum',
        `CLIProxy v${installedVersion} is older than the pool routing minimum (v${POOL_ROUTING_MIN_VERSION}). ` +
          `The max-retry-credentials and cooling keys may be silently ignored by the running binary. ` +
          `Run 'ccs cliproxy --latest' to update CLIProxy, then restart with 'ccs cliproxy restart'.`,
        {
          installedVersion,
          minimumVersion: POOL_ROUTING_MIN_VERSION,
        }
      );
    }
  } catch {
    // Binary not installed yet (first setup) — skip the version check silently
  }

  mutateConfig((cfg) => {
    if (!cfg.cliproxy) return;
    // Write only the pool flag and retry-cap.  User's routing values (strategy,
    // session_affinity, session_affinity_ttl) are intentionally left untouched so
    // disablePoolRouting can restore them without needing a separate backup.
    // The generator uses pool constants (fill-first, affinity 1h) when pool is
    // enabled, bypassing whatever is stored in cfg.cliproxy.routing.
    cfg.cliproxy.pool_routing = {
      ...cfg.cliproxy.pool_routing,
      enabled: true,
      max_retry_credentials: POOL_MAX_RETRY_CREDENTIALS,
    };
  });

  // The flag is persisted before regenerateConfig.  If regeneration throws, roll
  // the flag back so status surfaces (pool --enable, quota, dashboard) do not
  // report pool ON while config.yaml still runs non-pool routing.
  try {
    regenerateConfig(port, { configPath, authDir });
  } catch (err) {
    mutateConfig((cfg) => {
      if (!cfg.cliproxy) return;
      cfg.cliproxy.pool_routing = {
        ...cfg.cliproxy.pool_routing,
        enabled: false,
      };
    });
    return {
      changed: false,
      preservedExplicitSetting,
      failed: true,
      message: `[X] Could not write CLIProxy config: ${(err as Error).message}.\n    Pool routing was not enabled; fix the file permission and re-run: ccs cliproxy pool --enable`,
    };
  }

  return {
    changed: true,
    preservedExplicitSetting,
    message: preservedExplicitSetting
      ? '[!] Pool routing enabled. Your existing routing setting is preserved in config.\n    The generator uses pool defaults (fill-first, affinity 1h) while pool is active.\n    To restore your setting, disable pool routing first: ccs cliproxy pool --disable'
      : '[OK] Pool routing enabled. CLIProxy config regenerated with cooling ON,\n    fill-first strategy, session affinity 1h, max-retry-credentials 3.\n    CLIProxy will hot-reload the change; live session pins will re-pin on\n    next request.',
  };
}

/**
 * Disable pool routing: clear pool_routing.enabled and restore the non-pool
 * config defaults (disable-cooling: true, round-robin, no affinity).
 * Regenerates the CLIProxy config.yaml.
 *
 * IMPORTANT: disablePoolRouting MUST explicitly restore routing to round-robin
 * and session_affinity to false.  Simply clearing pool_routing.enabled is not
 * sufficient because the upstream CLIProxy default for disable-cooling is false
 * (cooling ON) when the key is absent.  Leaving cooling ON for a user who has
 * disabled pool routing would reintroduce the single-account blackout that v5
 * (commit fb77d72a) fixed.
 *
 * Idempotent: calling when already disabled is a no-op.
 */
export function disablePoolRouting(
  port: number,
  options: { configPath?: string; authDir?: string } = {}
): DisablePoolRoutingResult {
  const config = loadOrCreateUnifiedConfig();
  const wasEnabled = config.cliproxy?.pool_routing?.enabled === true;
  const configPath = options.configPath ?? getConfigPathForPort(port);
  const authDir = options.authDir ?? getAuthDir();
  if (!wasEnabled) {
    return {
      changed: false,
      message: 'Pool routing is not enabled.',
    };
  }

  mutateConfig((cfg) => {
    if (!cfg.cliproxy) return;
    // Only clear the pool flag — user's routing values (strategy, session_affinity,
    // session_affinity_ttl) were never overwritten on enable, so they are naturally
    // restored here.  The generator emits disable-cooling: true when pool is off.
    cfg.cliproxy.pool_routing = {
      ...cfg.cliproxy.pool_routing,
      enabled: false,
    };
  });

  // The flag is already cleared (matching user intent).  If regeneration throws we
  // keep enabled:false rather than rolling back to true — re-asserting pool ON
  // would reintroduce the single-account blackout the disable path exists to
  // prevent.  Surface the failure so the user can fix permissions and re-run.
  try {
    regenerateConfig(port, { configPath, authDir });
  } catch (err) {
    return {
      changed: true,
      failed: true,
      message: `[X] Could not write CLIProxy config: ${(err as Error).message}.\n    Pool routing is flagged disabled but the config was not regenerated.\n    Fix the file permission and re-run: ccs cliproxy pool --disable`,
    };
  }

  return {
    changed: true,
    message:
      '[OK] Pool routing disabled. CLIProxy config regenerated with cooling disabled (stability mode).\n' +
      '    Your original routing settings are restored.\n' +
      '    If you have multiple accounts and want fair distribution, round-robin is active.\n' +
      '    To avoid cache-burn with large multi-account fleets, consider reducing to 1 account\n' +
      '    or re-enabling pool routing: ccs cliproxy pool --enable',
  };
}

const GO_DURATION_SEGMENT = String.raw`(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))`;
const GO_DURATION_PATTERN = new RegExp(`^${GO_DURATION_SEGMENT}+$`);

/**
 * Pool routing mode summary surfaced alongside routing state for the dashboard.
 * When pool routing is enabled the generator forces fill-first + session affinity
 * + cooling, regardless of stored routing values.
 */
export interface CliproxyPoolRoutingState {
  enabled: boolean;
  maxRetryCredentials?: number;
  /**
   * Whether CCS can manage pool routing for this target.  enablePoolRouting only
   * writes LOCAL config files, so a remote proxy is never affected by the local
   * pool flag.  For remote targets this is false and `enabled` reflects the local
   * config only (not the remote proxy's behaviour).  Omitted (treated as true)
   * for local targets.  Mirrors CliproxySessionAffinityState.manageable.
   */
  manageable?: boolean;
  /** Explanation surfaced when manageable is false (remote target). */
  message?: string;
}

export interface CliproxyRoutingState {
  strategy: CliproxyRoutingStrategy;
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  message?: string;
  /**
   * Pool routing mode. For local targets `enabled` reflects the active proxy
   * config. For remote targets `manageable` is false and `enabled` reflects only
   * the local config (the remote proxy is not affected by it).
   */
  poolRouting?: CliproxyPoolRoutingState;
}

export interface CliproxyRoutingApplyResult extends CliproxyRoutingState {
  applied: 'live' | 'live-and-config' | 'config-only';
}

export interface CliproxySessionAffinitySettings {
  enabled: boolean;
  ttl?: string;
}

export interface CliproxySessionAffinityState {
  enabled?: boolean;
  ttl?: string;
  source: 'config' | 'unsupported';
  target: 'local' | 'remote';
  reachable: boolean;
  manageable: boolean;
  message?: string;
}

export interface CliproxySessionAffinityApplyResult extends CliproxySessionAffinityState {
  applied: 'config-only' | 'unsupported';
}

export function normalizeCliproxyRoutingStrategy(value: unknown): CliproxyRoutingStrategy | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'round-robin':
    case 'roundrobin':
    case 'rr':
      return 'round-robin';
    case 'fill-first':
    case 'fillfirst':
    case 'ff':
      return 'fill-first';
    default:
      return null;
  }
}

export function normalizeCliproxySessionAffinityEnabled(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'on':
    case 'enable':
    case 'enabled':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'off':
    case 'disable':
    case 'disabled':
      return false;
    default:
      return null;
  }
}

export function normalizeCliproxySessionAffinityTtl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !GO_DURATION_PATTERN.test(trimmed) || !hasPositiveDuration(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getConfiguredCliproxyRoutingStrategy(): CliproxyRoutingStrategy {
  return (
    normalizeCliproxyRoutingStrategy(loadOrCreateUnifiedConfig().cliproxy?.routing?.strategy) ??
    DEFAULT_CLIPROXY_ROUTING_STRATEGY
  );
}

export function getConfiguredCliproxySessionAffinitySettings(): Required<CliproxySessionAffinitySettings> {
  const routing = loadOrCreateUnifiedConfig().cliproxy?.routing;
  return {
    enabled:
      normalizeCliproxySessionAffinityEnabled(routing?.session_affinity) ??
      DEFAULT_CLIPROXY_SESSION_AFFINITY_ENABLED,
    ttl:
      normalizeCliproxySessionAffinityTtl(routing?.session_affinity_ttl) ??
      DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL,
  };
}

export async function fetchLiveCliproxyRoutingStrategy(): Promise<CliproxyRoutingStrategy> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'GET');
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(response, `Failed to read routing strategy (${response.status})`)
    );
  }

  const data = (await response.json()) as { strategy?: string };
  const strategy = normalizeCliproxyRoutingStrategy(data?.strategy);
  if (!strategy) {
    throw new Error('CLIProxy returned an invalid routing strategy');
  }

  return strategy;
}

/**
 * Read the pool routing mode from the unified config.
 * Pool routing is proxy-wide opt-in; this reflects the persisted flag, not a
 * live selector probe.
 */
export function getCliproxyPoolRoutingState(): CliproxyPoolRoutingState {
  const pool = loadOrCreateUnifiedConfig().cliproxy?.pool_routing;
  const enabled = pool?.enabled === true;
  return {
    enabled,
    // When pool routing is enabled the generator applies the POOL_MAX_RETRY_CREDENTIALS
    // default, so surface the same effective value here to match the generated
    // config. When disabled, max-retry does not apply; leave it unset.
    maxRetryCredentials: enabled
      ? (pool?.max_retry_credentials ?? POOL_MAX_RETRY_CREDENTIALS)
      : undefined,
  };
}

export async function readCliproxyRoutingState(): Promise<CliproxyRoutingState> {
  const target = getCliproxyRoutingTarget();
  const poolRouting = getCliproxyPoolRoutingState();

  if (target.isRemote) {
    // Do NOT attach the local pool flag as if it described the remote proxy.
    // enablePoolRouting only writes local config files; the remote proxy keeps
    // its own routing/cooling. Surface manageable:false + a message so the
    // dashboard renders "local only / not applied" instead of claiming the
    // remote proxy is pool-managed. Mirrors readCliproxySessionAffinityState.
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'remote',
      reachable: true,
      poolRouting: {
        enabled: poolRouting.enabled,
        maxRetryCredentials: poolRouting.maxRetryCredentials,
        manageable: false,
        message:
          'Pool routing is managed from the local config only and does not affect this remote proxy. ' +
          'Configure cooling and routing on the host running CLIProxy instead.',
      },
    };
  }

  try {
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'local',
      reachable: true,
      poolRouting,
    };
  } catch {
    return {
      strategy: getConfiguredCliproxyRoutingStrategy(),
      source: 'config',
      target: 'local',
      reachable: false,
      message: 'Local CLIProxy is not reachable. Showing the saved startup default.',
      poolRouting,
    };
  }
}

export async function readCliproxySessionAffinityState(): Promise<CliproxySessionAffinityState> {
  const target = getCliproxyRoutingTarget();

  if (target.isRemote) {
    const reachable = await isLiveCliproxyRoutingReachable();
    return {
      source: 'unsupported',
      target: 'remote',
      reachable,
      manageable: false,
      message: reachable
        ? 'Remote session-affinity management is not supported from CCS yet because upstream management APIs only expose routing.strategy.'
        : 'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.',
    };
  }

  const settings = getConfiguredCliproxySessionAffinitySettings();
  const reachable = await isLiveCliproxyRoutingReachable();

  return {
    enabled: settings.enabled,
    ttl: settings.ttl,
    source: 'config',
    target: 'local',
    reachable,
    manageable: true,
    message: reachable
      ? 'Showing the saved local session-affinity setting. Running local CLIProxy may hot-reload config changes, but CCS does not verify live selector state.'
      : 'Local CLIProxy is not reachable. Showing the saved local startup default.',
  };
}

export async function applyCliproxyRoutingStrategy(
  strategy: CliproxyRoutingStrategy
): Promise<CliproxyRoutingApplyResult> {
  const target = getCliproxyRoutingTarget();
  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();

  if (target.isRemote) {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'remote',
      reachable: true,
      applied: 'live',
      message: 'Updated remote CLIProxy routing strategy.',
    };
  }

  // Pool routing overrides the stored strategy at config-generation time, so the
  // apply will not take effect until pool routing is disabled.  Append the same
  // note the CLI prints so dashboard/API consumers see the override too.
  const poolNote = isLocalPoolRoutingEnabled() ? `\n\n${poolActiveOverrideNote('strategy')}` : '';

  mutateConfig((config) => {
    if (config.cliproxy) {
      config.cliproxy.routing = { ...config.cliproxy.routing, strategy };
    }
  });
  regenerateConfig(target.port, { configPath, authDir });

  try {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
      message: 'Updated the running proxy and saved the local startup default.' + poolNote,
    };
  } catch {
    return {
      strategy,
      source: 'config',
      target: 'local',
      reachable: false,
      applied: 'config-only',
      message:
        'Saved the local startup default. It will apply the next time CLIProxy starts.' + poolNote,
    };
  }
}

export async function applyCliproxySessionAffinitySettings(
  settings: CliproxySessionAffinitySettings
): Promise<CliproxySessionAffinityApplyResult> {
  const target = getCliproxyRoutingTarget();
  if (target.isRemote) {
    const reachable = await isLiveCliproxyRoutingReachable();
    return {
      source: 'unsupported',
      target: 'remote',
      reachable,
      manageable: false,
      applied: 'unsupported',
      message: reachable
        ? 'Remote session-affinity management is not supported from CCS yet because upstream management APIs only expose routing.strategy.'
        : 'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.',
    };
  }

  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();
  const current = getConfiguredCliproxySessionAffinitySettings();
  const ttl =
    normalizeCliproxySessionAffinityTtl(settings.ttl) ??
    current.ttl ??
    DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL;

  // Pool routing overrides the stored session-affinity at config-generation time;
  // append the same override note the CLI prints so dashboard/API consumers see it.
  const poolNote = isLocalPoolRoutingEnabled() ? `\n\n${poolActiveOverrideNote('affinity')}` : '';

  mutateConfig((config) => {
    if (config.cliproxy) {
      config.cliproxy.routing = {
        ...config.cliproxy.routing,
        session_affinity: settings.enabled,
        session_affinity_ttl: ttl,
      };
    }
  });
  regenerateConfig(target.port, { configPath, authDir });

  const reachable = await isLiveCliproxyRoutingReachable();
  return {
    enabled: settings.enabled,
    ttl,
    source: 'config',
    target: 'local',
    reachable,
    manageable: true,
    applied: 'config-only',
    message:
      (reachable
        ? 'Saved the local startup default. Running local CLIProxy may hot-reload the session-affinity setting, but CCS does not verify live selector state yet.'
        : 'Saved the local startup default. It will apply the next time local CLIProxy starts.') +
      poolNote,
  };
}

async function updateLiveCliproxyRoutingStrategy(strategy: CliproxyRoutingStrategy): Promise<void> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'PUT', {
    value: strategy,
  });
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(
        response,
        `Failed to update routing strategy (${response.status})`
      )
    );
  }
}

function hasPositiveDuration(value: string): boolean {
  const segments = value.match(new RegExp(GO_DURATION_SEGMENT, 'g'));
  if (!segments) {
    return false;
  }

  return segments.some((segment) => {
    const numeric = parseFloat(segment);
    return Number.isFinite(numeric) && numeric > 0;
  });
}

async function isLiveCliproxyRoutingReachable(): Promise<boolean> {
  try {
    await fetchLiveCliproxyRoutingStrategy();
    return true;
  } catch {
    return false;
  }
}
