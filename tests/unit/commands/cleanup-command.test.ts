import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleCleanupCommand } from '../../../src/commands/cleanup-command';
import { getCliproxyDir } from '../../../src/cliproxy/config/config-generator';
import { getLogArchiveDir, getNativeLogsDir } from '../../../src/services/logging';

describe('cleanup command', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cleanup-command-'));
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = '';
  });

  it('reports CCS archives alongside current logs in dry-run mode', async () => {
    const ccsLogsDir = getNativeLogsDir();
    const archiveDir = getLogArchiveDir();
    const cliproxyLogsDir = path.join(getCliproxyDir(), 'logs');

    fs.mkdirSync(archiveDir, { recursive: true });
    fs.mkdirSync(cliproxyLogsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsLogsDir, 'current.jsonl'), 'x'.repeat(100));
    fs.writeFileSync(path.join(archiveDir, 'archived.jsonl.gz'), 'y'.repeat(2_000));

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--dry-run']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('CCS Logs: 1 files (100.00 B)');
      expect(output).toContain('CCS Log Archives: 1 files (1.95 KB)');
      expect(output).toContain('Would delete 2 files (2.05 KB)');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('does not follow a symlinked CCS archive directory during cleanup', async () => {
    if (process.platform === 'win32') return;

    const ccsLogsDir = getNativeLogsDir();
    const archiveDir = getLogArchiveDir();
    const victimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cleanup-victim-'));

    fs.mkdirSync(ccsLogsDir, { recursive: true });
    fs.writeFileSync(path.join(victimDir, 'keepme.log'), 'do not delete');
    fs.symlinkSync(victimDir, archiveDir, 'dir');

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--force']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('No CCS or CLIProxy logs found.');
      expect(fs.existsSync(path.join(victimDir, 'keepme.log'))).toBe(true);
    } finally {
      logSpy.mockRestore();
      fs.rmSync(victimDir, { recursive: true, force: true });
    }
  });

  it('warns instead of reporting no logs when a cleanup directory cannot be read', async () => {
    const archiveDir = getLogArchiveDir();
    fs.mkdirSync(archiveDir, { recursive: true });

    const originalReaddirSync = fs.readdirSync;
    const readdirSpy = spyOn(fs, 'readdirSync').mockImplementation(((
      dirPath: fs.PathLike,
      options?: unknown
    ) => {
      if (String(dirPath) === archiveDir) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }

      return originalReaddirSync(dirPath, options as never);
    }) as unknown as typeof fs.readdirSync);
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--dry-run']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('Could not read CCS Log Archives');
      expect(output).toContain('permission denied');
      expect(output).not.toContain('No CCS or CLIProxy logs found.');
    } finally {
      readdirSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('warns instead of reporting no error logs when CLIProxy logs cannot be read', async () => {
    const cliproxyLogsDir = path.join(getCliproxyDir(), 'logs');
    fs.mkdirSync(cliproxyLogsDir, { recursive: true });

    const originalReaddirSync = fs.readdirSync;
    const readdirSpy = spyOn(fs, 'readdirSync').mockImplementation(((
      dirPath: fs.PathLike,
      options?: unknown
    ) => {
      if (String(dirPath) === cliproxyLogsDir) {
        throw Object.assign(new Error('disk I/O failed'), { code: 'EIO' });
      }

      return originalReaddirSync(dirPath, options as never);
    }) as unknown as typeof fs.readdirSync);
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--errors']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('Could not read CLIProxy logs');
      expect(output).toContain('disk I/O failed');
      expect(output).not.toContain('No error logs found.');
    } finally {
      readdirSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('warns instead of treating CLIProxy log inspection errors as missing directories', async () => {
    const cliproxyLogsDir = path.join(getCliproxyDir(), 'logs');
    fs.mkdirSync(cliproxyLogsDir, { recursive: true });

    const originalLstatSync = fs.lstatSync;
    const lstatSpy = spyOn(fs, 'lstatSync').mockImplementation(((
      targetPath: fs.PathLike,
      options?: unknown
    ) => {
      if (String(targetPath) === cliproxyLogsDir) {
        throw Object.assign(new Error('stat failed'), { code: 'EIO' });
      }

      return originalLstatSync(targetPath, options as never);
    }) as unknown as typeof fs.lstatSync);
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--errors']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('Could not inspect CLIProxy logs');
      expect(output).toContain('stat failed');
      expect(output).not.toContain('No CLIProxy logs directory found.');
    } finally {
      lstatSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
