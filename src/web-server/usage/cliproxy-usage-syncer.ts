/**
 * CLIProxy Usage Syncer
 *
 * Periodically fetches CLIProxy usage data, transforms it, and persists
 * snapshots locally so analytics data survives CLIProxy restarts.
 *
 * Snapshot location: ~/.ccs/cache/cliproxy-usage/latest.json
 * Sync interval: 5 minutes
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  fetchCliproxyUsageRaw,
  fetchCliproxyAuthFiles,
  buildAuthIndexToAccountMap,
} from '../../cliproxy/services/stats-fetcher';
import {
  buildCliproxyUsageHistoryAggregates,
  extractCliproxyUsageHistoryDetails,
  mergeCliproxyUsageHistoryDetails,
  normalizeCliproxyUsageHistoryDetail,
  pruneCliproxyUsageHistoryDetails,
  type CliproxyUsageHistoryDetail,
} from './cliproxy-usage-transformer';
import type { DailyUsage, HourlyUsage, MonthlyUsage } from './types';

import { ok, info, warn } from '../../utils/ui';
import { getCcsDir } from '../../config/config-loader-facade';

interface CliproxyUsageSnapshot {
  version: number;
  timestamp: number;
  details: CliproxyUsageHistoryDetail[];
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
}

type LegacyCliproxyUsageSnapshot = {
  version?: number;
  timestamp?: number;
  daily?: DailyUsage[];
  hourly?: HourlyUsage[];
  monthly?: MonthlyUsage[];
};

type FetchCliproxyUsageRaw = typeof fetchCliproxyUsageRaw;
type FetchCliproxyAuthFiles = typeof fetchCliproxyAuthFiles;

const SNAPSHOT_VERSION = 3;
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_DAYS = Math.max(
  30,
  parseInt(process.env.CCS_CLIPROXY_HISTORY_RETENTION_DAYS ?? '365', 10) || 365
);
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_WRITE_ATTEMPTS = 3;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/** Sync interval in ms, configurable via CCS_CLIPROXY_SYNC_INTERVAL env var (default: 5 min) */
const SYNC_INTERVAL_MS = Math.max(
  30_000,
  parseInt(process.env.CCS_CLIPROXY_SYNC_INTERVAL ?? '300000', 10) || 300_000
);

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let snapshotTimestampOrdinal = 0;

function getCliproxyCacheDir(): string {
  return path.join(getCcsDir(), 'cache', 'cliproxy-usage');
}

function getLatestSnapshotPath(): string {
  return path.join(getCliproxyCacheDir(), 'latest.json');
}

function ensurePrivateDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  fs.chmodSync(dir, PRIVATE_DIR_MODE);
}

function ensureCliproxyCacheDir(): void {
  const ccsDir = getCcsDir();
  const cacheDir = path.join(ccsDir, 'cache');
  const cliproxyCacheDir = path.join(cacheDir, 'cliproxy-usage');

  ensurePrivateDirectory(ccsDir);
  ensurePrivateDirectory(cacheDir);
  ensurePrivateDirectory(cliproxyCacheDir);
}

function getSnapshotTimestamp(): number {
  snapshotTimestampOrdinal = (snapshotTimestampOrdinal + 1) % 1000;
  return Date.now() + snapshotTimestampOrdinal / 1000;
}

function buildHourlyTimestamp(hour: string): string {
  return `${hour.replace(' ', 'T')}:00.000Z`;
}

function buildDailyTimestamp(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function distributeRequestCounts(total: number, buckets: number): number[] {
  if (buckets <= 0) return [];
  const normalizedTotal = Math.max(buckets, total);
  const base = Math.floor(normalizedTotal / buckets);
  const remainder = normalizedTotal % buckets;
  return Array.from({ length: buckets }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function buildLegacyHistoryDetails(
  snapshot: LegacyCliproxyUsageSnapshot
): CliproxyUsageHistoryDetail[] {
  const details: CliproxyUsageHistoryDetail[] = [];
  const coveredDailyKeys = new Set<string>();

  for (const hour of snapshot.hourly ?? []) {
    const requestCounts = distributeRequestCounts(
      hour.requestCount ?? hour.modelBreakdowns.length,
      hour.modelBreakdowns.length
    );

    hour.modelBreakdowns.forEach((breakdown, index) => {
      details.push({
        model: breakdown.modelName,
        timestamp: buildHourlyTimestamp(hour.hour),
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        cacheReadTokens: breakdown.cacheReadTokens,
        requestCount: requestCounts[index] ?? 1,
        cost: breakdown.cost,
        failed: false,
      });
      coveredDailyKeys.add(`${hour.hour.slice(0, 10)}|${breakdown.modelName}`);
    });
  }

  for (const day of snapshot.daily ?? []) {
    for (const breakdown of day.modelBreakdowns) {
      const key = `${day.date}|${breakdown.modelName}`;
      if (coveredDailyKeys.has(key)) {
        continue;
      }

      details.push({
        model: breakdown.modelName,
        timestamp: buildDailyTimestamp(day.date),
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        cacheReadTokens: breakdown.cacheReadTokens,
        requestCount: 1,
        cost: breakdown.cost,
        failed: false,
      });
    }
  }

  return details;
}

function migrateLegacySnapshot(
  snapshot: LegacyCliproxyUsageSnapshot,
  emitWarnings: boolean
): CliproxyUsageSnapshot | null {
  const details = buildLegacyHistoryDetails(snapshot);
  if (details.length === 0) {
    if (emitWarnings) {
      console.log(
        info('CLIProxy legacy snapshot had no migratable history, will refresh on next sync')
      );
    }
    return null;
  }

  if (emitWarnings) {
    console.log(info('Loaded legacy CLIProxy snapshot into historical format'));
  }

  const { daily, hourly, monthly } = buildCliproxyUsageHistoryAggregates(details);
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Number.isFinite(snapshot.timestamp) ? Number(snapshot.timestamp) : Date.now(),
    details,
    daily,
    hourly,
    monthly,
  };
}

function readSnapshot(emitWarnings = true): CliproxyUsageSnapshot | null {
  try {
    const snapshotPath = getLatestSnapshotPath();
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(raw) as CliproxyUsageSnapshot | LegacyCliproxyUsageSnapshot;

    if (snapshot.version === SNAPSHOT_VERSION) {
      if (!Number.isFinite(snapshot.timestamp)) {
        if (emitWarnings) {
          console.log(info('CLIProxy snapshot timestamp invalid, will refresh on next sync'));
        }
        return null;
      }

      const details = (snapshot as CliproxyUsageSnapshot).details;
      if (!Array.isArray(details)) {
        if (emitWarnings) {
          console.log(info('CLIProxy snapshot details missing, will refresh on next sync'));
        }
        return null;
      }

      const normalizedDetails = details
        .map((detail) => normalizeCliproxyUsageHistoryDetail(detail))
        .filter((detail): detail is CliproxyUsageHistoryDetail => detail !== null);
      const { daily, hourly, monthly } = buildCliproxyUsageHistoryAggregates(normalizedDetails);

      return {
        version: SNAPSHOT_VERSION,
        timestamp: Number(snapshot.timestamp),
        details: normalizedDetails,
        daily,
        hourly,
        monthly,
      };
    }

    if (snapshot.version === 1 || snapshot.version === 2) {
      return migrateLegacySnapshot(snapshot as LegacyCliproxyUsageSnapshot, emitWarnings);
    }

    if (emitWarnings) {
      console.log(info('CLIProxy snapshot version mismatch, will refresh on next sync'));
    }
    return null;
  } catch (err) {
    if (emitWarnings) {
      console.log(warn('Failed to read CLIProxy snapshot:') + ` ${(err as Error).message}`);
    }
    return null;
  }
}

function buildSnapshot(
  baseDetails: CliproxyUsageHistoryDetail[],
  incomingDetails: CliproxyUsageHistoryDetail[]
): CliproxyUsageSnapshot {
  const mergedDetails = pruneCliproxyUsageHistoryDetails(
    mergeCliproxyUsageHistoryDetails(baseDetails, incomingDetails),
    Date.now() - HISTORY_RETENTION_MS
  );
  const { daily, hourly, monthly } = buildCliproxyUsageHistoryAggregates(mergedDetails);

  return {
    version: SNAPSHOT_VERSION,
    timestamp: getSnapshotTimestamp(),
    details: mergedDetails,
    daily,
    hourly,
    monthly,
  };
}

async function writeSnapshotWithMerge(
  incomingDetails: CliproxyUsageHistoryDetail[]
): Promise<void> {
  ensureCliproxyCacheDir();
  const snapshotPath = getLatestSnapshotPath();

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const baseSnapshot = readSnapshot(false);
    const baseTimestamp = baseSnapshot?.timestamp ?? -Infinity;
    const snapshot = buildSnapshot(baseSnapshot?.details ?? [], incomingDetails);
    const tempFile = `${snapshotPath}.${process.pid}.${snapshot.timestamp}.tmp`;

    fs.writeFileSync(tempFile, JSON.stringify(snapshot), {
      encoding: 'utf-8',
      mode: PRIVATE_FILE_MODE,
    });
    fs.chmodSync(tempFile, PRIVATE_FILE_MODE);

    const latestSnapshot = readSnapshot(false);
    const latestTimestamp = latestSnapshot?.timestamp ?? -Infinity;
    if (latestTimestamp > baseTimestamp) {
      fs.rmSync(tempFile, { force: true });
      continue;
    }

    fs.renameSync(tempFile, snapshotPath);
    fs.chmodSync(snapshotPath, PRIVATE_FILE_MODE);
    console.log(ok('CLIProxy usage snapshot updated'));
    return;
  }

  throw new Error('Failed to write CLIProxy snapshot after repeated overlap retries');
}

export async function loadCachedCliproxyData(): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
}> {
  const empty = { daily: [], hourly: [], monthly: [] };

  const snapshot = readSnapshot();
  if (!snapshot) {
    return empty;
  }

  const age = Date.now() - snapshot.timestamp;
  if (age > SNAPSHOT_MAX_AGE_MS) {
    console.log(info('Using stale CLIProxy snapshot while proxy sync is unavailable'));
  }

  return { daily: snapshot.daily, hourly: snapshot.hourly, monthly: snapshot.monthly };
}

export async function syncCliproxyUsage(
  fetchRaw: FetchCliproxyUsageRaw = fetchCliproxyUsageRaw,
  fetchAuthFiles: FetchCliproxyAuthFiles = fetchCliproxyAuthFiles
): Promise<void> {
  const raw = await fetchRaw();

  if (raw === null) {
    console.log(warn('CLIProxy usage sync skipped: proxy unavailable'));
    return;
  }

  // Build auth_index → account email map for attribution.
  // Auth file fetch failure is non-fatal: fall back to undefined map (cost = 0).
  let accountMap: Map<string, string> | undefined;
  try {
    const authFiles = await fetchAuthFiles();
    if (authFiles !== null) {
      accountMap = buildAuthIndexToAccountMap(authFiles);
    }
  } catch {
    // Auth files unavailable — proceed without account attribution
  }

  try {
    await writeSnapshotWithMerge(extractCliproxyUsageHistoryDetails(raw, accountMap));
  } catch (err) {
    console.log(warn('Failed to write CLIProxy snapshot:') + ` ${(err as Error).message}`);
  }
}

export function startCliproxySync(syncNow: () => Promise<void> = () => syncCliproxyUsage()): void {
  if (syncIntervalId !== null) {
    return;
  }

  const intervalMin = Math.round(SYNC_INTERVAL_MS / 60_000);
  console.log(info(`Starting CLIProxy usage sync (interval: ${intervalMin} min)`));

  void syncNow();

  syncIntervalId = setInterval(() => {
    void syncNow();
  }, SYNC_INTERVAL_MS);
}

export function stopCliproxySync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
