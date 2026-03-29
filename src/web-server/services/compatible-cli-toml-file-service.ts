import { promises as fs } from 'fs';
import * as path from 'path';
import { stringify } from 'smol-toml';
import { parseTomlObject } from '../../shared/toml-object';

export interface TomlFileDiagnostics {
  label: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  isSymlink: boolean;
  isRegularFile: boolean;
  sizeBytes: number | null;
  mtimeMs: number | null;
  parseError: string | null;
  readError: string | null;
}

export interface TomlFileProbe {
  diagnostics: TomlFileDiagnostics;
  config: Record<string, unknown> | null;
  rawText: string;
}

interface WriteTomlFileInput {
  filePath: string;
  rawText: string;
  expectedMtime?: number;
  fileLabel?: string;
  dirMode?: number;
  fileMode?: number;
}

interface WriteTomlFileResult {
  mtime: number;
}

export class TomlFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TomlFileValidationError';
  }
}

export class TomlFileConflictError extends Error {
  readonly code = 'CONFLICT';
  readonly mtime: number;

  constructor(message: string, mtime: number) {
    super(message);
    this.name = 'TomlFileConflictError';
    this.mtime = mtime;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function statPath(filePath: string): Promise<import('fs').Stats | null> {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function resolveConflictMtime(filePath: string): Promise<number> {
  const stat = await statPath(filePath);
  return stat?.mtimeMs ?? Date.now();
}

async function acquireWriteLock(
  lockPath: string,
  targetPath: string,
  fileLabel: string
): Promise<() => Promise<void>> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(lockPath, 'wx', 0o600);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      const existingLock = await statPath(lockPath);
      if (existingLock?.isSymbolicLink()) {
        throw new Error(`Refusing to write: ${fileLabel}.lock is a symlink.`);
      }
      if (existingLock && !existingLock.isFile()) {
        throw new Error(`Refusing to write: ${fileLabel}.lock is not a regular file.`);
      }
      throw new TomlFileConflictError(
        'File is currently being written by another request. Refresh and retry.',
        await resolveConflictMtime(targetPath)
      );
    }
    throw error;
  }

  return async () => {
    if (!handle) return;
    try {
      await handle.close();
    } finally {
      try {
        await fs.unlink(lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  };
}

function ensureWritableTarget(
  targetStat: import('fs').Stats | null,
  fileLabel: string
): import('fs').Stats | null {
  if (!targetStat) return null;
  if (targetStat.isSymbolicLink()) {
    throw new Error(`Refusing to write: ${fileLabel} is a symlink.`);
  }
  if (!targetStat.isFile()) {
    throw new Error(`Refusing to write: ${fileLabel} is not a regular file.`);
  }
  return targetStat;
}

function assertExpectedMtime(
  targetStat: import('fs').Stats | null,
  expectedMtime: number | undefined
): void {
  if (!targetStat) {
    if (expectedMtime !== undefined) {
      throw new TomlFileConflictError('File modified externally.', Date.now());
    }
    return;
  }

  if (typeof expectedMtime !== 'number' || !Number.isFinite(expectedMtime)) {
    throw new TomlFileConflictError(
      'File metadata not loaded. Refresh and retry.',
      targetStat.mtimeMs
    );
  }
  if (targetStat.mtimeMs !== expectedMtime) {
    throw new TomlFileConflictError('File modified externally.', targetStat.mtimeMs);
  }
}

async function verifyTargetUnchanged(
  targetPath: string,
  initialTargetStat: import('fs').Stats | null,
  fileLabel: string
): Promise<void> {
  const currentTargetStat = ensureWritableTarget(await statPath(targetPath), fileLabel);

  if (!initialTargetStat) {
    if (currentTargetStat) {
      throw new TomlFileConflictError('File modified externally.', currentTargetStat.mtimeMs);
    }
    return;
  }

  if (!currentTargetStat || currentTargetStat.mtimeMs !== initialTargetStat.mtimeMs) {
    throw new TomlFileConflictError(
      'File modified externally.',
      currentTargetStat?.mtimeMs ?? Date.now()
    );
  }
}

export function parseTomlObjectText(
  rawText: string,
  fieldName = 'rawText'
): Record<string, unknown> {
  if (typeof rawText !== 'string') {
    throw new TomlFileValidationError(`${fieldName} must be a string.`);
  }

  try {
    return parseTomlObject(rawText);
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'TOML root must be a table.') {
      throw new TomlFileValidationError(`${fieldName} TOML root must be a table.`);
    }
    throw new TomlFileValidationError(`Invalid TOML in ${fieldName}: ${message}`);
  }
}

export function stringifyTomlObject(config: Record<string, unknown>): string {
  if (!isObject(config)) {
    throw new TomlFileValidationError('config TOML root must be a table.');
  }

  const text = stringify(config).trimEnd();
  return text ? `${text}\n` : '';
}

export async function probeTomlObjectFile(
  filePath: string,
  label: string,
  displayPath: string
): Promise<TomlFileProbe> {
  const stat = await statPath(filePath);
  if (!stat) {
    return {
      diagnostics: {
        label,
        path: displayPath,
        resolvedPath: filePath,
        exists: false,
        isSymlink: false,
        isRegularFile: false,
        sizeBytes: null,
        mtimeMs: null,
        parseError: null,
        readError: null,
      },
      config: null,
      rawText: '',
    };
  }

  const diagnostics: TomlFileDiagnostics = {
    label,
    path: displayPath,
    resolvedPath: filePath,
    exists: true,
    isSymlink: stat.isSymbolicLink(),
    isRegularFile: stat.isFile(),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    parseError: null,
    readError: null,
  };

  if (diagnostics.isSymlink) {
    diagnostics.readError = 'Refusing symlink file for safety.';
    return { diagnostics, config: null, rawText: '' };
  }

  if (!diagnostics.isRegularFile) {
    diagnostics.readError = 'Target is not a regular file.';
    return { diagnostics, config: null, rawText: '' };
  }

  try {
    const rawText = await fs.readFile(filePath, 'utf8');
    try {
      const config = parseTomlObjectText(rawText, displayPath);
      return { diagnostics, config, rawText };
    } catch (error) {
      diagnostics.parseError = (error as Error).message;
      return { diagnostics, config: null, rawText };
    }
  } catch (error) {
    diagnostics.readError = (error as Error).message;
    return { diagnostics, config: null, rawText: '' };
  }
}

export async function writeTomlFileAtomic(input: WriteTomlFileInput): Promise<WriteTomlFileResult> {
  const fileLabel = input.fileLabel || path.basename(input.filePath);
  parseTomlObjectText(input.rawText, fileLabel);

  const targetPath = input.filePath;
  const targetDir = path.dirname(targetPath);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  const lockPath = `${targetPath}.lock`;
  const dirMode = input.dirMode ?? 0o700;
  const fileMode = input.fileMode ?? 0o600;

  await fs.mkdir(targetDir, { recursive: true, mode: dirMode });

  const releaseLock = await acquireWriteLock(lockPath, targetPath, fileLabel);

  let wroteTemp = false;
  try {
    const targetStat = ensureWritableTarget(await statPath(targetPath), fileLabel);
    assertExpectedMtime(targetStat, input.expectedMtime);

    await fs.writeFile(tempPath, input.rawText, { mode: fileMode, flag: 'wx' });
    wroteTemp = true;

    const tempStat = await fs.lstat(tempPath);
    if (tempStat.isSymbolicLink()) {
      throw new Error(`Refusing to write: ${fileLabel}.tmp is a symlink.`);
    }
    if (!tempStat.isFile()) {
      throw new Error(`Refusing to write: ${fileLabel}.tmp is not a regular file.`);
    }

    await verifyTargetUnchanged(targetPath, targetStat, fileLabel);
    await fs.rename(tempPath, targetPath);
    wroteTemp = false;

    try {
      await fs.chmod(targetPath, fileMode);
    } catch {
      // Best-effort permission hardening.
    }

    const stat = await fs.stat(targetPath);
    return { mtime: stat.mtimeMs };
  } finally {
    if (wroteTemp) {
      try {
        await fs.unlink(tempPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await releaseLock();
  }
}
