import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getExecutableName } from '../platform-detector';
import { downloadAndInstall } from '../installer';
import { ensureBinary } from '../lifecycle';
import { withInstallLifecycleLock } from '../install-lifecycle-lock';

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
        replaceExisting: true,
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

  it('installs a forced version even when an older binary already exists', async () => {
    const binaryPath = path.join(binPath, getExecutableName('original'));
    fs.writeFileSync(binaryPath, 'old-binary');
    let installs = 0;

    const resolvedPath = await ensureBinary(
      {
        version: '6.7.1',
        releaseUrl: 'https://example.invalid',
        binPath,
        maxRetries: 1,
        verbose: false,
        forceVersion: true,
        replaceExisting: true,
        skipAutoUpdate: false,
        allowInstall: true,
        backend: 'original',
      },
      {
        downloadAndInstallFn: async () => {
          installs += 1;
        },
      }
    );

    expect(resolvedPath).toBe(binaryPath);
    expect(installs).toBe(1);
  });

  it('reuses an existing pinned binary during runtime bootstrap', async () => {
    const binaryPath = path.join(binPath, getExecutableName('original'));
    fs.writeFileSync(binaryPath, 'pinned-binary');
    let installs = 0;

    const resolvedPath = await ensureBinary(
      {
        version: '6.6.80',
        releaseUrl: 'https://example.invalid',
        binPath,
        maxRetries: 1,
        verbose: false,
        forceVersion: true,
        replaceExisting: false,
        skipAutoUpdate: false,
        allowInstall: false,
        backend: 'original',
      },
      {
        downloadAndInstallFn: async () => {
          installs += 1;
        },
      }
    );

    expect(resolvedPath).toBe(binaryPath);
    expect(installs).toBe(0);
  });

  it('waits for an externally held compatible install lifecycle lock', async () => {
    const lockTarget = path.join(binPath, '.install-lifecycle-plus');
    fs.mkdirSync(lockTarget, { recursive: true });
    fs.mkdirSync(`${lockTarget}.lock`);
    let entered = false;

    const operation = withInstallLifecycleLock(lockTarget, async () => {
      entered = true;
    });

    await Bun.sleep(50);
    expect(entered).toBe(false);
    fs.rmdirSync(`${lockTarget}.lock`);
    await operation;
    expect(entered).toBe(true);
  });

  it('restores the previous binary when publishing the version marker fails', async () => {
    const binaryName = getExecutableName('original');
    const binaryPath = path.join(binPath, binaryName);
    const versionPath = path.join(binPath, '.version');
    fs.writeFileSync(binaryPath, 'old-binary');
    fs.writeFileSync(versionPath, '6.6.80');
    let renames = 0;

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
          renameSyncFn: (source, destination) => {
            renames += 1;
            if (renames === 2) throw new Error('version marker blocked');
            fs.renameSync(source, destination);
          },
        }
      )
    ).rejects.toThrow('version marker blocked');

    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('old-binary');
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('6.6.80');
    expect(stagingDirectories()).toEqual([]);
  });

  it('serializes concurrent installs so the binary and version stay paired', async () => {
    const binaryName = getExecutableName('original');
    const binaryPath = path.join(binPath, binaryName);
    const versionPath = path.join(binPath, '.version');

    const install = (version: string) =>
      downloadAndInstall(
        {
          version,
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
            fs.writeFileSync(path.join(destination, binaryName), `binary-${version}`);
          },
        }
      );

    await Promise.all([install('6.7.1'), install('6.7.2')]);

    const installedVersion = fs.readFileSync(versionPath, 'utf8');
    expect(fs.readFileSync(binaryPath, 'utf8')).toBe(`binary-${installedVersion}`);
    expect(stagingDirectories()).toEqual([]);
  });

  it('removes staging residue left by an interrupted prior install', async () => {
    const stalePath = path.join(binPath, '.cliproxy-install-stale');
    fs.mkdirSync(stalePath);
    fs.writeFileSync(path.join(stalePath, 'partial-archive'), 'partial');
    const binaryName = getExecutableName('original');

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

    expect(fs.existsSync(stalePath)).toBe(false);
    expect(stagingDirectories()).toEqual([]);
  });
});
