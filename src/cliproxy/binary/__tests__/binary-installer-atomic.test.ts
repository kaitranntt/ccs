import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getExecutableName } from '../platform-detector';
import { downloadAndInstall } from '../installer';

describe('atomic binary installation', () => {
  let binPath: string;

  beforeEach(() => {
    binPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-atomic-installer-'));
  });

  afterEach(() => {
    fs.rmSync(binPath, { recursive: true, force: true });
  });

  function stagingDirectories(): string[] {
    return fs.readdirSync(binPath).filter((entry) => entry.startsWith('.cliproxy-install-'));
  }

  it('preserves the installed binary and version when verification fails', async () => {
    const binaryPath = path.join(binPath, getExecutableName('original'));
    const versionPath = path.join(binPath, '.version');
    fs.writeFileSync(binaryPath, 'old-binary');
    fs.writeFileSync(versionPath, '6.6.80');

    await expect(
      downloadAndInstall(
        {
          version: '6.7.1',
          releaseUrl: 'https://example.invalid',
          binPath,
          maxRetries: 1,
          verbose: false,
          forceVersion: true,
          skipAutoUpdate: false,
          allowInstall: true,
          backend: 'original',
        },
        false,
        {
          downloadWithRetryFn: async (_url, archivePath) => {
            fs.writeFileSync(archivePath, 'downloaded-archive');
            return { success: true, filePath: archivePath, retries: 0 };
          },
          verifyChecksumFn: async () => ({
            valid: false,
            expected: 'expected-checksum',
            actual: 'actual-checksum',
          }),
          extractArchiveFn: async () => {
            throw new Error('extract should not run');
          },
        }
      )
    ).rejects.toThrow('Checksum mismatch');

    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('old-binary');
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('6.6.80');
    expect(stagingDirectories()).toEqual([]);
  });

  it('atomically swaps the verified staged binary and then records its version', async () => {
    const binaryName = getExecutableName('original');
    const binaryPath = path.join(binPath, binaryName);
    const versionPath = path.join(binPath, '.version');
    fs.writeFileSync(binaryPath, 'old-binary');
    fs.writeFileSync(versionPath, '6.6.80');

    await downloadAndInstall(
      {
        version: '6.7.1',
        releaseUrl: 'https://example.invalid',
        binPath,
        maxRetries: 1,
        verbose: false,
        forceVersion: true,
        skipAutoUpdate: false,
        allowInstall: true,
        backend: 'original',
      },
      false,
      {
        downloadWithRetryFn: async (_url, archivePath) => {
          fs.writeFileSync(archivePath, 'downloaded-archive');
          return { success: true, filePath: archivePath, retries: 0 };
        },
        verifyChecksumFn: async () => ({
          valid: true,
          expected: 'checksum',
          actual: 'checksum',
        }),
        extractArchiveFn: async (_archivePath, destination) => {
          fs.writeFileSync(path.join(destination, binaryName), 'new-binary');
        },
      }
    );

    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('new-binary');
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('6.7.1');
    expect(stagingDirectories()).toEqual([]);
  });

  it('preserves the installed binary and version when the atomic swap fails', async () => {
    const binaryName = getExecutableName('original');
    const binaryPath = path.join(binPath, binaryName);
    const versionPath = path.join(binPath, '.version');
    fs.writeFileSync(binaryPath, 'old-binary');
    fs.writeFileSync(versionPath, '6.6.80');

    await expect(
      downloadAndInstall(
        {
          version: '6.7.1',
          releaseUrl: 'https://example.invalid',
          binPath,
          maxRetries: 1,
          verbose: false,
          forceVersion: true,
          skipAutoUpdate: false,
          allowInstall: true,
          backend: 'original',
        },
        false,
        {
          downloadWithRetryFn: async (_url, archivePath) => {
            fs.writeFileSync(archivePath, 'downloaded-archive');
            return { success: true, filePath: archivePath, retries: 0 };
          },
          verifyChecksumFn: async () => ({
            valid: true,
            expected: 'checksum',
            actual: 'checksum',
          }),
          extractArchiveFn: async (_archivePath, destination) => {
            fs.writeFileSync(path.join(destination, binaryName), 'new-binary');
          },
          renameSyncFn: () => {
            throw Object.assign(new Error('replacement blocked'), { code: 'EPERM' });
          },
        }
      )
    ).rejects.toThrow('replacement blocked');

    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('old-binary');
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('6.6.80');
    expect(stagingDirectories()).toEqual([]);
  });
});
