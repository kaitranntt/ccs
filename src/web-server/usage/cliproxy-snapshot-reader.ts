/**
 * CLIProxy Snapshot Reader
 *
 * Lightweight reader that extracts the flat CliproxyUsageHistoryDetail array
 * from the persisted snapshot at ~/.ccs/cache/cliproxy-usage/latest.json.
 *
 * This is a read-only helper — it never writes or syncs. The syncer owns
 * the write path; this module owns the "give me the raw details" path
 * needed by the bar-routes aggregator for per-account cost mapping.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCcsDir } from '../../config/config-loader-facade';
import {
  normalizeCliproxyUsageHistoryDetail,
  type CliproxyUsageHistoryDetail,
} from './cliproxy-usage-transformer';

const SUPPORTED_SNAPSHOT_VERSION = 3;

function getLatestSnapshotPath(): string {
  return path.join(getCcsDir(), 'cache', 'cliproxy-usage', 'latest.json');
}

/**
 * Read the persisted CLIProxy usage snapshot and return its raw detail records.
 *
 * Returns an empty array when:
 * - The snapshot file does not exist
 * - The file cannot be parsed as JSON
 * - The snapshot version is unrecognised
 * - The details array is absent or malformed
 *
 * Individual malformed detail records are silently dropped (normalizer returns null).
 */
export async function loadCliproxySnapshotDetails(): Promise<CliproxyUsageHistoryDetail[]> {
  const snapshotPath = getLatestSnapshotPath();

  try {
    if (!fs.existsSync(snapshotPath)) {
      return [];
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(raw) as Record<string, unknown>;

    if (snapshot.version !== SUPPORTED_SNAPSHOT_VERSION) {
      // Legacy / future snapshot — skip rather than mis-interpret
      return [];
    }

    const details = snapshot.details;
    if (!Array.isArray(details)) {
      return [];
    }

    return details
      .map((item) => normalizeCliproxyUsageHistoryDetail(item))
      .filter((item): item is CliproxyUsageHistoryDetail => item !== null);
  } catch {
    // IO / parse errors are non-fatal — bar glance degrades gracefully
    return [];
  }
}
