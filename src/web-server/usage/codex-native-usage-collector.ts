import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getCcsDir } from '../../utils/config-manager';
import type { RawUsageEntry } from '../jsonl-parser';
import { resolveCodexConfigPaths } from '../services/codex-dashboard-service';

interface CodexNativeUsageCollectorOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  includeCliproxySessions?: boolean;
  cacheDir?: string;
  disableCache?: boolean;
}

const CODEX_NATIVE_USAGE_CACHE_VERSION = 1;

interface CachedRolloutFile {
  path: string;
  size: number;
  mtimeMs: number;
  entries: RawUsageEntry[];
}

interface CodexNativeUsageCache {
  version: typeof CODEX_NATIVE_USAGE_CACHE_VERSION;
  includeCliproxySessions: boolean;
  generatedAt: number;
  files: Record<string, CachedRolloutFile>;
}

interface CodexTokenSnapshot {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

function isCliProxyBackedProvider(value: string | undefined): boolean {
  return value === 'cliproxy' || value === 'ccs_runtime';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function hasUsage(snapshot: CodexTokenSnapshot): boolean {
  return snapshot.inputTokens > 0 || snapshot.cacheReadTokens > 0 || snapshot.outputTokens > 0;
}

function normalizeTokenSnapshot(value: unknown): CodexTokenSnapshot | null {
  if (!isObject(value)) return null;
  return {
    inputTokens: asNumber(value.input_tokens),
    cacheReadTokens: asNumber(value.cached_input_tokens),
    outputTokens: asNumber(value.output_tokens) + asNumber(value.reasoning_output_tokens),
  };
}

function subtractSnapshots(
  current: CodexTokenSnapshot,
  previous: CodexTokenSnapshot
): CodexTokenSnapshot {
  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    cacheReadTokens: Math.max(0, current.cacheReadTokens - previous.cacheReadTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
  };
}

function snapshotsEqual(left: CodexTokenSnapshot, right: CodexTokenSnapshot): boolean {
  return (
    left.inputTokens === right.inputTokens &&
    left.cacheReadTokens === right.cacheReadTokens &&
    left.outputTokens === right.outputTokens
  );
}

async function collectRolloutFiles(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRolloutFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function getDefaultCacheDir(): string {
  return path.join(getCcsDir(), 'cache');
}

function getCacheFilePath(cacheDir: string, includeCliproxySessions: boolean): string {
  return path.join(
    cacheDir,
    includeCliproxySessions
      ? 'codex-native-usage-with-cliproxy-v1.json'
      : 'codex-native-usage-v1.json'
  );
}

function isCachedRolloutFile(value: unknown): value is CachedRolloutFile {
  if (!isObject(value)) return false;
  return (
    typeof value.path === 'string' &&
    typeof value.size === 'number' &&
    typeof value.mtimeMs === 'number' &&
    Array.isArray(value.entries)
  );
}

function isCodexNativeUsageCache(value: unknown): value is CodexNativeUsageCache {
  if (!isObject(value)) return false;
  if (value.version !== CODEX_NATIVE_USAGE_CACHE_VERSION) return false;
  if (typeof value.includeCliproxySessions !== 'boolean') return false;
  if (typeof value.generatedAt !== 'number') return false;
  if (!isObject(value.files)) return false;
  return Object.values(value.files).every(isCachedRolloutFile);
}

function readUsageCache(
  cacheDir: string,
  includeCliproxySessions: boolean
): CodexNativeUsageCache | null {
  try {
    const cachePath = getCacheFilePath(cacheDir, includeCliproxySessions);
    if (!fs.existsSync(cachePath)) return null;

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as unknown;
    if (!isCodexNativeUsageCache(parsed)) return null;
    if (parsed.includeCliproxySessions !== includeCliproxySessions) return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeUsageCache(cacheDir: string, cache: CodexNativeUsageCache): void {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = getCacheFilePath(cacheDir, cache.includeCliproxySessions);
    const tempPath = `${cachePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(cache), 'utf8');
    fs.renameSync(tempPath, cachePath);
  } catch {
    // Best-effort only.
  }
}

function getMtimeMsFingerprint(stats: fs.Stats): number {
  return stats.mtimeMs;
}

function hasMatchingFingerprint(
  cached: CachedRolloutFile | undefined,
  filePath: string,
  stats: fs.Stats
): cached is CachedRolloutFile {
  return (
    !!cached &&
    cached.path === filePath &&
    cached.size === stats.size &&
    cached.mtimeMs === getMtimeMsFingerprint(stats)
  );
}

async function parseRolloutFile(
  filePath: string,
  includeCliproxySessions: boolean
): Promise<RawUsageEntry[]> {
  const entries: RawUsageEntry[] = [];
  let sessionId = '';
  let projectPath = '';
  let version: string | undefined;
  let modelProvider: string | undefined;
  let model = 'unknown-codex-model';
  let previousTotal: CodexTokenSnapshot | null = null;

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of reader) {
      if (!line.trim()) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.type === 'session_meta' && isObject(parsed.payload)) {
        sessionId = asString(parsed.payload.id) ?? sessionId;
        projectPath = asString(parsed.payload.cwd) ?? projectPath;
        version = asString(parsed.payload.cli_version) ?? version;
        modelProvider = asString(parsed.payload.model_provider) ?? modelProvider;
        continue;
      }

      if (parsed.type === 'turn_context' && isObject(parsed.payload)) {
        model = asString(parsed.payload.model) ?? model;
        projectPath = asString(parsed.payload.cwd) ?? projectPath;
        continue;
      }

      if (
        parsed.type !== 'event_msg' ||
        !isObject(parsed.payload) ||
        parsed.payload.type !== 'token_count' ||
        !sessionId ||
        (isCliProxyBackedProvider(modelProvider) && !includeCliproxySessions)
      ) {
        continue;
      }

      const totalSnapshot = normalizeTokenSnapshot(
        parsed.payload.info && isObject(parsed.payload.info)
          ? (parsed.payload.info as Record<string, unknown>).total_token_usage
          : null
      );
      const lastSnapshot = normalizeTokenSnapshot(
        parsed.payload.info && isObject(parsed.payload.info)
          ? (parsed.payload.info as Record<string, unknown>).last_token_usage
          : null
      );

      if (!totalSnapshot) continue;
      if (previousTotal && snapshotsEqual(totalSnapshot, previousTotal)) continue;

      const delta =
        previousTotal === null
          ? lastSnapshot && hasUsage(lastSnapshot)
            ? lastSnapshot
            : totalSnapshot
          : subtractSnapshots(totalSnapshot, previousTotal);
      previousTotal = totalSnapshot;

      if (!hasUsage(delta)) continue;

      const timestamp = asString(parsed.timestamp);
      if (!timestamp) continue;

      entries.push({
        inputTokens: delta.inputTokens,
        outputTokens: delta.outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: delta.cacheReadTokens,
        model,
        sessionId,
        timestamp,
        projectPath: projectPath || '/',
        version,
        target: 'codex',
      });
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return entries;
}

export async function scanCodexNativeUsageEntries(
  options: CodexNativeUsageCollectorOptions = {}
): Promise<RawUsageEntry[]> {
  const includeCliproxySessions = options.includeCliproxySessions === true;
  const { baseDir } = resolveCodexConfigPaths({
    env: options.env,
    homeDir: options.homeDir,
  });
  const rolloutFiles = await collectRolloutFiles(path.join(baseDir, 'sessions'));
  const entries: RawUsageEntry[] = [];

  if (options.disableCache === true) {
    for (const filePath of rolloutFiles) {
      entries.push(...(await parseRolloutFile(filePath, includeCliproxySessions)));
    }
    return entries;
  }

  const cacheDir = options.cacheDir ?? getDefaultCacheDir();
  const previousCache = readUsageCache(cacheDir, includeCliproxySessions);
  const nextCache: CodexNativeUsageCache = {
    version: CODEX_NATIVE_USAGE_CACHE_VERSION,
    includeCliproxySessions,
    generatedAt: Date.now(),
    files: {},
  };

  for (const filePath of rolloutFiles) {
    const stats = await fs.promises.stat(filePath);
    const cached = previousCache?.files[filePath];

    if (hasMatchingFingerprint(cached, filePath, stats)) {
      entries.push(...cached.entries);
      nextCache.files[filePath] = cached;
      continue;
    }

    const fileEntries = await parseRolloutFile(filePath, includeCliproxySessions);
    entries.push(...fileEntries);
    nextCache.files[filePath] = {
      path: filePath,
      size: stats.size,
      mtimeMs: getMtimeMsFingerprint(stats),
      entries: fileEntries,
    };
  }

  writeUsageCache(cacheDir, nextCache);
  return entries;
}
