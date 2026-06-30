import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('version-checker stale cache fallback', () => {
  let originalCcsHome: string | undefined;
  let tempHome = '';

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-version-checker-'));
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('uses a stale latest-version cache when GitHub lookup fails', async () => {
    const { getVersionCachePath, writeInstalledVersion } = await import('../version-cache');
    const { VERSION_CACHE_DURATION_MS } = await import('../types');
    const { checkForUpdates } = await import('../version-checker');
    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');

    fs.mkdirSync(plusBinDir, { recursive: true });
    writeInstalledVersion(plusBinDir, '6.6.80');
    fs.writeFileSync(
      getVersionCachePath('plus'),
      JSON.stringify({
        latestVersion: '6.9.23-0',
        repo: 'kaitranntt/CLIProxyAPIPlus',
        checkedAt: Date.now() - VERSION_CACHE_DURATION_MS - 1_000,
      }),
      'utf8'
    );

    const result = await checkForUpdates(plusBinDir, '6.6.80', false, 'plus', {
      fetchLatestVersionFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
    });

    expect(result.latestVersion).toBe('6.9.23-0');
    expect(result.currentVersion).toBe('6.6.80');
    expect(result.hasUpdate).toBe(true);
    expect(result.fromCache).toBe(true);
  });

  it('ignores legacy or cross-repo latest-version caches', async () => {
    const { getVersionCachePath, writeInstalledVersion } = await import('../version-cache');
    const { checkForUpdates } = await import('../version-checker');
    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');

    fs.mkdirSync(plusBinDir, { recursive: true });
    writeInstalledVersion(plusBinDir, '6.6.80');
    for (const repo of [undefined, 'router-for-me/CLIProxyAPI']) {
      fs.writeFileSync(
        getVersionCachePath('plus'),
        JSON.stringify({
          latestVersion: '7.2.5',
          checkedAt: Date.now(),
          ...(repo ? { repo } : {}),
        }),
        'utf8'
      );

      const result = await checkForUpdates(plusBinDir, '6.6.80', false, 'plus', {
        fetchLatestVersionFn: async () => '7.1.68-2',
      });

      expect(result.latestVersion).toBe('7.1.68-2');
      expect(result.fromCache).toBe(false);
    }
  });

  it('uses a stale release-list cache when GitHub list lookup fails', async () => {
    const { getVersionListCachePath } = await import('../version-cache');
    const { VERSION_CACHE_DURATION_MS } = await import('../types');
    const { fetchAllVersions } = await import('../version-checker');
    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');

    fs.mkdirSync(plusBinDir, { recursive: true });
    fs.writeFileSync(
      getVersionListCachePath('plus'),
      JSON.stringify({
        versions: ['6.9.23-0', '6.9.22-0', '6.9.19-0'],
        latestStable: '6.9.23-0',
        latest: '6.9.23-0',
        checkedAt: Date.now() - VERSION_CACHE_DURATION_MS - 1_000,
      }),
      'utf8'
    );

    const result = await fetchAllVersions(false, 'plus', {
      fetchJsonFn: async () => {
        throw new Error('GitHub API error: HTTP 403');
      },
    });

    expect(result.versions).toEqual(['6.9.23-0', '6.9.22-0', '6.9.19-0']);
    expect(result.latestStable).toBe('6.9.23-0');
    expect(result.latest).toBe('6.9.23-0');
    expect(result.fromCache).toBe(true);
  });

  it('skips update lookups when runtime startup prefers the installed binary', async () => {
    const { getExecutableName } = await import('../platform-detector');
    const { ensureBinary } = await import('../lifecycle');

    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');
    fs.mkdirSync(plusBinDir, { recursive: true });
    fs.writeFileSync(path.join(plusBinDir, getExecutableName('plus')), 'binary');

    // Verify the contract via dependency injection rather than mock.module().
    // bun's mock.module() is process-wide and is NOT undone by mock.restore(),
    // which previously leaked a stubbed version-checker into unrelated test
    // files (cliproxy-stats-routes-*) that transitively import it.
    let checkForUpdatesCalls = 0;
    const checkForUpdatesSpy = async () => {
      checkForUpdatesCalls += 1;
      return {
        hasUpdate: false,
        currentVersion: '6.8.2-0',
        latestVersion: '6.8.2-0',
        fromCache: false,
        checkedAt: Date.now(),
      };
    };

    const binaryPath = await ensureBinary({
      version: '6.8.2-0',
      releaseUrl: 'https://example.com/releases/download',
      binPath: plusBinDir,
      maxRetries: 1,
      verbose: false,
      forceVersion: false,
      skipAutoUpdate: true,
      allowInstall: true,
      backend: 'plus',
      checkForUpdatesFn: checkForUpdatesSpy,
    });

    expect(binaryPath).toBe(path.join(plusBinDir, getExecutableName('plus')));
    expect(checkForUpdatesCalls).toBe(0);
  });
});
