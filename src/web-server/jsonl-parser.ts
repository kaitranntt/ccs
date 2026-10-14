/**
 * JSONL Parser for Claude Code Usage Analytics
 *
 * High-performance streaming parser for ~/.claude/projects/ JSONL files.
 * Replaces better-ccusage dependency with optimized custom implementation.
 *
 * Key features:
 * - Streaming line-by-line parsing (memory efficient)
 * - Only parses "assistant" entries with usage data
 * - Parallel file processing with configurable concurrency
 * - Graceful error handling for malformed entries
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getClaudeConfigDir } from '../utils/claude-config-path';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Raw usage data from JSONL entry */
export interface RawUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string;
  sessionId: string;
  timestamp: string;
  projectPath: string;
  version?: string;
  target?: string;
  /** Shared by every transcript line of one API response; see getDedupeKey */
  dedupeKey?: string;
}

/** Internal structure matching JSONL assistant entries */
interface JsonlAssistantEntry {
  type: 'assistant';
  sessionId: string;
  timestamp: string;
  version?: string;
  cwd?: string;
  target?: string;
  requestId?: string;
  message: {
    id?: string;
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/** Parser options */
export interface ParserOptions {
  /** Max files to parse concurrently (default: 10) */
  concurrency?: number;
  /** Skip files older than this date */
  minDate?: Date;
  /** Custom projects directory (default: ~/.claude/projects) */
  projectsDir?: string;
}

const DEFAULT_SCAN_CONCURRENCY = 10;
const MAX_SCAN_CONCURRENCY = 64;

// ============================================================================
// CORE PARSING FUNCTIONS
// ============================================================================

/**
 * Parse a single JSONL line into RawUsageEntry if valid
 * Returns null for non-assistant entries or entries without usage data
 */
function toNonNegativeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function parseRequiredNonNegativeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Claude Code writes one transcript line per content block, each repeating the
 * response usage, and resumed sessions copy earlier lines into a new file.
 * A request ID pins lines to one response. Without one, only message IDs that
 * are unique per response (Anthropic `msg_`, OpenAI Responses `resp_`) are
 * trusted, since some gateways reuse one placeholder ID for every response.
 */
function getDedupeKey(entry: JsonlAssistantEntry): string | undefined {
  const messageId = entry.message.id;
  if (typeof messageId !== 'string' || !messageId) return undefined;
  if (typeof entry.requestId === 'string' && entry.requestId) {
    return `${messageId}:${entry.requestId}`;
  }
  return /^(msg|resp)_/.test(messageId) ? messageId : undefined;
}

function totalTokens(entry: RawUsageEntry): number {
  return entry.inputTokens + entry.outputTokens + entry.cacheCreationTokens + entry.cacheReadTokens;
}

/**
 * Count each API response once. Keeps the line with the most tokens, since
 * streaming proxies may only report final usage on the last content block.
 */
function dedupeResponses(entries: RawUsageEntry[]): RawUsageEntry[] {
  const result: RawUsageEntry[] = [];
  const indexByKey = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.dedupeKey) {
      result.push(entry);
      continue;
    }
    const index = indexByKey.get(entry.dedupeKey);
    if (index === undefined) {
      indexByKey.set(entry.dedupeKey, result.length);
      result.push(entry);
    } else if (totalTokens(entry) > totalTokens(result[index])) {
      result[index] = entry;
    }
  }

  return result;
}

export function parseUsageEntry(line: string, projectPath: string): RawUsageEntry | null {
  // Strip UTF-8 BOM if present (can occur on first line of some files)
  const cleanLine = line.replace(/^\uFEFF/, '').trim();
  if (!cleanLine) return null;

  try {
    const entry = JSON.parse(cleanLine);

    // Only process assistant entries with usage data
    if (entry.type !== 'assistant') return null;
    if (!entry.message?.usage) return null;
    if (!entry.message?.model) return null;

    const usage = entry.message.usage;
    const assistant = entry as JsonlAssistantEntry;
    const inputTokens = parseRequiredNonNegativeNumber(usage.input_tokens);
    const outputTokens = parseRequiredNonNegativeNumber(usage.output_tokens);
    if (inputTokens === null || outputTokens === null || !isValidTimestamp(assistant.timestamp)) {
      return null;
    }
    const normalizedProjectPath =
      typeof assistant.cwd === 'string' && assistant.cwd.trim().length > 0
        ? assistant.cwd
        : projectPath;

    return {
      inputTokens,
      outputTokens,
      cacheCreationTokens: toNonNegativeNumber(usage.cache_creation_input_tokens),
      cacheReadTokens: toNonNegativeNumber(usage.cache_read_input_tokens),
      model: assistant.message.model,
      sessionId: assistant.sessionId || '',
      timestamp: assistant.timestamp,
      projectPath: normalizedProjectPath,
      version: assistant.version,
      target:
        typeof (entry as { target?: unknown }).target === 'string'
          ? ((entry as { target?: string }).target as string)
          : undefined,
      dedupeKey: getDedupeKey(assistant),
    };
  } catch {
    // Malformed JSON - skip silently
    return null;
  }
}

/**
 * Stream-parse a single JSONL file
 * Yields RawUsageEntry for each valid assistant entry
 */
export async function parseJsonlFile(
  filePath: string,
  projectPath: string
): Promise<RawUsageEntry[]> {
  const entries: RawUsageEntry[] = [];

  let fileStream: fs.ReadStream | null = null;
  let rl: readline.Interface | null = null;
  try {
    fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const entry = parseUsageEntry(line, projectPath);
      if (entry) {
        entries.push(entry);
      }
    }
  } catch {
    // File read/stream error - return whatever was parsed so far
  } finally {
    rl?.close();
    fileStream?.destroy();
  }

  return entries;
}

function decodeProjectPath(projectDir: string): string {
  const raw = path.basename(projectDir).replace(/-/g, '/');
  const safeSegments = raw
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..');

  return `/${safeSegments.join('/')}`;
}

/**
 * Parse all JSONL files in a single project directory
 */
export async function parseProjectDirectory(projectDir: string): Promise<RawUsageEntry[]> {
  const entries: RawUsageEntry[] = [];

  // Get project path from directory name (e.g., "-home-kai-project" -> "/home/kai/project")
  const projectPath = decodeProjectPath(projectDir);

  try {
    const files = await fs.promises.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    // Parse files sequentially within a project to avoid too many open handles
    for (const file of jsonlFiles) {
      const filePath = path.join(projectDir, file);
      const fileEntries = await parseJsonlFile(filePath, projectPath);
      entries.push(...fileEntries);
    }
  } catch {
    // Directory access error - skip silently
  }

  return entries;
}

// ============================================================================
// DIRECTORY SCANNING
// ============================================================================

/**
 * Get default Claude projects directory
 */
export function getDefaultProjectsDir(): string {
  return path.join(getClaudeConfigDir(), 'projects');
}

/**
 * Find all project directories under ~/.claude/projects/
 */
export function findProjectDirectories(projectsDir?: string): string[] {
  const dir = projectsDir || getDefaultProjectsDir();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Scan all projects and parse all JSONL files
 * Main entry point for usage data extraction
 *
 * @param options - Parser configuration
 * @returns All parsed usage entries from all projects
 */
export async function scanProjectsDirectory(options: ParserOptions = {}): Promise<RawUsageEntry[]> {
  const requestedConcurrency = options.concurrency;
  const concurrency =
    typeof requestedConcurrency === 'number' &&
    Number.isInteger(requestedConcurrency) &&
    requestedConcurrency > 0
      ? Math.min(requestedConcurrency, MAX_SCAN_CONCURRENCY)
      : DEFAULT_SCAN_CONCURRENCY;
  const { projectsDir } = options;
  const allEntries: RawUsageEntry[] = [];

  const projectDirs = findProjectDirectories(projectsDir);

  if (projectDirs.length === 0) {
    return allEntries;
  }

  // Process projects in batches for controlled concurrency
  for (let i = 0; i < projectDirs.length; i += concurrency) {
    const batch = projectDirs.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((dir) => parseProjectDirectory(dir)));

    for (const entries of batchResults) {
      allEntries.push(...entries);
    }
  }

  const uniqueEntries = dedupeResponses(allEntries);

  // Filter by date if specified
  if (options.minDate) {
    const minTime = options.minDate.getTime();
    return uniqueEntries.filter((entry) => {
      const entryTime = Date.parse(entry.timestamp);
      return Number.isFinite(entryTime) && entryTime >= minTime;
    });
  }

  return uniqueEntries;
}

/**
 * Get count of JSONL files across all projects (for progress reporting)
 */
export function countJsonlFiles(projectsDir?: string): number {
  const projectDirs = findProjectDirectories(projectsDir);
  let count = 0;

  for (const dir of projectDirs) {
    try {
      const files = fs.readdirSync(dir);
      count += files.filter((f) => f.endsWith('.jsonl')).length;
    } catch {
      // Skip inaccessible directories
    }
  }

  return count;
}
