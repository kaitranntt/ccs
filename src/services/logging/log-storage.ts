import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';
import { getResolvedLoggingConfig } from './log-config';
import {
  ensureLoggingDirectories,
  getCurrentLogPath,
  buildArchiveLogPath,
  getLogArchiveDir,
} from './log-paths';
import { pushRecentLogEntry } from './log-buffer';
import { shouldWriteLogLevel, type LogEntry } from './log-types';

const gzipAsync = promisify(zlib.gzip);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
const FLUSH_DEBOUNCE_MS = 10;
const MAX_BUFFERED_ENTRIES = 64;
const MAX_BUFFERED_BYTES = 64 * 1024;

interface PendingLogWrite {
  logPath: string;
  archiveDir: string;
  line: string;
  rotateMb: number;
  retainDays: number;
}

interface LogWriteBatch {
  logPath: string;
  archiveDir: string;
  rotateMb: number;
  retainDays: number;
  payload: string;
  flushed: boolean;
}

let lastPruneAt = 0;
let pendingQueue: PendingLogWrite[] = [];
let pendingBytes = 0;
const inFlightBatches: LogWriteBatch[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();
let beforeExitHookRegistered = false;

function getRotateBytes(rotateMb: number): number {
  return Math.max(1, rotateMb) * 1024 * 1024;
}

function buildArchivePathInDir(archiveDir: string, timestamp: Date): string {
  const compact = timestamp.toISOString().replace(/[:.]/g, '-');
  return path.join(archiveDir, `ccs-${compact}.jsonl.gz`);
}

function drainPendingBatches(): LogWriteBatch[] {
  if (pendingQueue.length === 0) {
    return [];
  }

  const items = pendingQueue;
  pendingQueue = [];
  pendingBytes = 0;

  const batches: LogWriteBatch[] = [];
  for (const item of items) {
    const lastBatch = batches[batches.length - 1];
    if (
      lastBatch &&
      lastBatch.logPath === item.logPath &&
      lastBatch.archiveDir === item.archiveDir
    ) {
      lastBatch.payload += item.line;
      lastBatch.rotateMb = item.rotateMb;
      lastBatch.retainDays = item.retainDays;
    } else {
      batches.push({
        logPath: item.logPath,
        archiveDir: item.archiveDir,
        rotateMb: item.rotateMb,
        retainDays: item.retainDays,
        payload: item.line,
        flushed: false,
      });
    }
  }

  return batches;
}

function clearScheduledFlushTimer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function registerBeforeExitFlush(): void {
  if (beforeExitHookRegistered) {
    return;
  }
  beforeExitHookRegistered = true;
  process.on('beforeExit', () => {
    flushStructuredLogsSync();
  });
}

async function rotateCurrentLogIfNeededAsync(
  currentLogPath: string,
  archiveDir: string,
  rotateMb: number
): Promise<void> {
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(currentLogPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const ageMs = Date.now() - stats.mtimeMs;
  const exceedsSize = stats.size >= getRotateBytes(rotateMb);
  const exceedsAge = ageMs >= ONE_DAY_MS;
  if (!exceedsSize && !exceedsAge) {
    return;
  }

  const currentContent = await fs.promises.readFile(currentLogPath, 'utf8');
  if (!currentContent.trim()) {
    await fs.promises.truncate(currentLogPath, 0);
    return;
  }

  const archivePath = buildArchivePathInDir(archiveDir, new Date(stats.mtimeMs || Date.now()));
  const compressed = await gzipAsync(currentContent);
  await fs.promises.writeFile(archivePath, compressed, { mode: 0o600 });
  await fs.promises.truncate(currentLogPath, 0);
}

function rotateCurrentLogIfNeededSync(
  currentLogPath: string,
  archiveDir: string,
  rotateMb: number
): void {
  if (!fs.existsSync(currentLogPath)) {
    return;
  }

  const stats = fs.statSync(currentLogPath);
  const ageMs = Date.now() - stats.mtimeMs;
  const exceedsSize = stats.size >= getRotateBytes(rotateMb);
  const exceedsAge = ageMs >= ONE_DAY_MS;
  if (!exceedsSize && !exceedsAge) {
    return;
  }

  const currentContent = fs.readFileSync(currentLogPath, 'utf8');
  if (!currentContent.trim()) {
    fs.truncateSync(currentLogPath, 0);
    return;
  }

  const archivePath = buildArchivePathInDir(archiveDir, new Date(stats.mtimeMs || Date.now()));
  fs.writeFileSync(archivePath, zlib.gzipSync(currentContent), { mode: 0o600 });
  fs.truncateSync(currentLogPath, 0);
}

async function pruneExpiredLogArchivesAsync(archiveDir: string, retainDays: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(archiveDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const cutoffMs = Date.now() - retainDays * ONE_DAY_MS;
  for (const entry of entries) {
    const archivePath = path.join(archiveDir, entry);
    try {
      const stats = await fs.promises.lstat(archivePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        continue;
      }
      if (stats.mtimeMs < cutoffMs) {
        await fs.promises.unlink(archivePath);
      }
    } catch {
      continue;
    }
  }
}

export function pruneExpiredLogArchives(): void {
  const config = getResolvedLoggingConfig();
  const archiveDir = getLogArchiveDir();
  if (!fs.existsSync(archiveDir)) {
    return;
  }

  const cutoffMs = Date.now() - config.retain_days * ONE_DAY_MS;
  for (const entry of fs.readdirSync(archiveDir)) {
    const archivePath = path.join(archiveDir, entry);
    try {
      const stats = fs.lstatSync(archivePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        continue;
      }
      if (stats.mtimeMs < cutoffMs) {
        fs.unlinkSync(archivePath);
      }
    } catch {
      continue;
    }
  }
}

async function writeBatchAsync(batch: LogWriteBatch): Promise<void> {
  if (batch.flushed) {
    return;
  }
  await fs.promises.mkdir(path.dirname(batch.logPath), { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(batch.archiveDir, { recursive: true, mode: 0o700 });
  if (batch.flushed) {
    return;
  }
  await rotateCurrentLogIfNeededAsync(batch.logPath, batch.archiveDir, batch.rotateMb);
  if (batch.flushed) {
    return;
  }
  await fs.promises.appendFile(batch.logPath, batch.payload, {
    encoding: 'utf8',
    mode: 0o600,
  });
  batch.flushed = true;
  if (Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS) {
    await pruneExpiredLogArchivesAsync(batch.archiveDir, batch.retainDays);
    lastPruneAt = Date.now();
  }
}

function writeBatchSync(batch: LogWriteBatch): void {
  if (batch.flushed) {
    return;
  }
  fs.mkdirSync(path.dirname(batch.logPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(batch.archiveDir, { recursive: true, mode: 0o700 });
  rotateCurrentLogIfNeededSync(batch.logPath, batch.archiveDir, batch.rotateMb);
  fs.appendFileSync(batch.logPath, batch.payload, {
    encoding: 'utf8',
    mode: 0o600,
  });
  batch.flushed = true;
  if (Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS) {
    pruneExpiredLogArchives();
    lastPruneAt = Date.now();
  }
}

function enqueueAsyncFlush(): Promise<void> {
  clearScheduledFlushTimer();
  const batches = drainPendingBatches();
  if (batches.length === 0) {
    return flushChain;
  }

  inFlightBatches.push(...batches);
  flushChain = flushChain.then(async () => {
    for (const batch of batches) {
      try {
        await writeBatchAsync(batch);
      } catch {
        batch.flushed = true;
        // Logging must never break runtime behavior.
      } finally {
        const index = inFlightBatches.indexOf(batch);
        if (index !== -1) {
          inFlightBatches.splice(index, 1);
        }
      }
    }
  });
  return flushChain;
}

function scheduleAsyncFlush(): void {
  if (pendingQueue.length >= MAX_BUFFERED_ENTRIES || pendingBytes >= MAX_BUFFERED_BYTES) {
    void enqueueAsyncFlush();
    return;
  }

  if (flushTimer !== null) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void enqueueAsyncFlush();
  }, FLUSH_DEBOUNCE_MS);
  if (typeof flushTimer.unref === 'function') {
    flushTimer.unref();
  }
}

export async function flushStructuredLogs(): Promise<void> {
  await enqueueAsyncFlush();
  await flushChain;
}

export function flushStructuredLogsSync(): void {
  clearScheduledFlushTimer();
  const pendingBatches = drainPendingBatches();
  const uncompletedInFlight = inFlightBatches.filter((batch) => !batch.flushed);
  const batches = [...uncompletedInFlight, ...pendingBatches];
  if (batches.length === 0) {
    return;
  }

  for (const batch of batches) {
    try {
      writeBatchSync(batch);
    } catch {
      batch.flushed = true;
      // Logging must never break runtime behavior.
    }
  }
}

export function appendStructuredLogEntry(entry: LogEntry): void {
  const config = getResolvedLoggingConfig();
  if (!config.enabled || !shouldWriteLogLevel(entry.level, config.level)) {
    return;
  }

  try {
    pushRecentLogEntry(entry, config.live_buffer_size);
    registerBeforeExitFlush();
    const line = `${JSON.stringify(entry)}\n`;
    pendingQueue.push({
      logPath: getCurrentLogPath(),
      archiveDir: getLogArchiveDir(),
      line,
      rotateMb: config.rotate_mb,
      retainDays: config.retain_days,
    });
    pendingBytes += Buffer.byteLength(line, 'utf8');
    scheduleAsyncFlush();
  } catch {
    // Logging must never break runtime behavior.
  }
}

export { buildArchiveLogPath, ensureLoggingDirectories };
