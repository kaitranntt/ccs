import { promises as fs } from 'fs';
import * as path from 'path';
import { parse } from 'smol-toml';

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

export function parseTomlObjectText(
  rawText: string,
  fieldName = 'rawText'
): Record<string, unknown> {
  if (typeof rawText !== 'string') {
    throw new TomlFileValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = rawText.trim();
  if (!trimmed) return {};

  let parsed: unknown;
  try {
    parsed = parse(rawText);
  } catch (error) {
    throw new TomlFileValidationError(`Invalid TOML in ${fieldName}: ${(error as Error).message}`);
  }

  if (!isObject(parsed)) {
    throw new TomlFileValidationError(`${fieldName} TOML root must be a table.`);
  }

  return parsed;
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
  const tempPath = targetPath + '.tmp';
  const dirMode = input.dirMode ?? 0o700;
  const fileMode = input.fileMode ?? 0o600;

  await fs.mkdir(targetDir, { recursive: true, mode: dirMode });

  const targetStat = await statPath(targetPath);
  if (targetStat) {
    if (targetStat.isSymbolicLink()) {
      throw new Error(`Refusing to write: ${fileLabel} is a symlink.`);
    }
    if (!targetStat.isFile()) {
      throw new Error(`Refusing to write: ${fileLabel} is not a regular file.`);
    }

    if (typeof input.expectedMtime !== 'number' || !Number.isFinite(input.expectedMtime)) {
      throw new TomlFileConflictError(
        'File metadata not loaded. Refresh and retry.',
        targetStat.mtimeMs
      );
    }
    if (Math.abs(targetStat.mtimeMs - input.expectedMtime) > 1000) {
      throw new TomlFileConflictError('File modified externally.', targetStat.mtimeMs);
    }
  }

  let wroteTemp = false;
  try {
    const existingTempStat = await statPath(tempPath);
    if (existingTempStat) {
      if (existingTempStat.isSymbolicLink()) {
        throw new Error(`Refusing to write: ${fileLabel}.tmp is a symlink.`);
      }
      if (!existingTempStat.isFile()) {
        throw new Error(`Refusing to write: ${fileLabel}.tmp is not a regular file.`);
      }
    }

    await fs.writeFile(tempPath, input.rawText, { mode: fileMode });
    wroteTemp = true;

    const tempStat = await fs.lstat(tempPath);
    if (tempStat.isSymbolicLink()) {
      throw new Error(`Refusing to write: ${fileLabel}.tmp is a symlink.`);
    }
    if (!tempStat.isFile()) {
      throw new Error(`Refusing to write: ${fileLabel}.tmp is not a regular file.`);
    }

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
  }
}
