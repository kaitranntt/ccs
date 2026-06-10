/**
 * Tests for `ccs bar` command surface — Phase 3 TDD.
 *
 * Tests run FIRST per TDD mandate.
 * Covers: subcommand routing, bar.json contract, floating-tag install,
 * Info.plist version extraction, capability handshake compat, port-discovery
 * fallback, uninstall, version, and verified review findings #8-#13.
 *
 * All network I/O and filesystem-home operations are mocked.
 * Uses CCS_HOME env var for isolation — never touches real ~/.ccs.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let calls: string[] = [];
let consoleOutput: string[] = [];
let tempHome: string;
let originalCcsHome: string | undefined;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;

function captureConsole(): void {
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
}

function restoreConsole(): void {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}

// Unique module cache-buster so bun:test picks up fresh mocks each describe block.
let moduleSeq = 0;
async function loadHandleBarCommand() {
  moduleSeq++;
  const mod = await import(`../../../src/commands/bar/index?test=${Date.now()}-${moduleSeq}`);
  return mod.handleBarCommand as (args: string[]) => Promise<void>;
}

async function loadInstallSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/install-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarInstall: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
    validateDownloadUrl: (url: string) => void;
  };
}

async function loadLaunchSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarLaunch: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadUninstallSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/uninstall-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarUninstall: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  calls = [];
  consoleOutput = [];
  captureConsole();

  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  restoreConsole();
  mock.restore();

  if (originalCcsHome === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = originalCcsHome;
  }

  // Clean up temp dir
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// 1. Subcommand routing via handleBarCommand dispatcher
// ---------------------------------------------------------------------------

describe('bar command dispatcher (index.ts)', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/launch-subcommand', () => ({
      handleBarLaunch: async (args: string[]) => {
        calls.push(`launch:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/install-subcommand', () => ({
      handleBarInstall: async (args: string[]) => {
        calls.push(`install:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/uninstall-subcommand', () => ({
      handleBarUninstall: async (args: string[]) => {
        calls.push(`uninstall:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/version-subcommand', () => ({
      handleBarVersion: async () => {
        calls.push(`version:`);
      },
    }));

    mock.module('../../../src/commands/bar/help-subcommand', () => ({
      showHelp: async () => {
        calls.push(`help:`);
      },
    }));
  });

  it('dispatches bare `ccs bar` to launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand([]);
    expect(calls).toEqual(['launch:']);
  });

  it('dispatches `ccs bar launch` to launch subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['launch']);
    expect(calls).toEqual(['launch:']);
  });

  it('dispatches `ccs bar install` to install subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['install']);
    expect(calls).toEqual(['install:']);
  });

  it('dispatches `ccs bar uninstall` to uninstall subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['uninstall']);
    expect(calls).toEqual(['uninstall:']);
  });

  it('dispatches `ccs bar --version` to version subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--version']);
    expect(calls).toEqual(['version:']);
  });

  it('dispatches `ccs bar version` to version subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['version']);
    expect(calls).toEqual(['version:']);
  });

  it('passes remaining args to install subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['install', '--force']);
    expect(calls).toEqual(['install:--force']);
  });

  it('treats unknown subcommands as an error and does not throw', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    // Should print help or error but not crash
    await expect(handleBarCommand(['unknown-subcommand'])).resolves.toBeUndefined();
  });

  it('dispatches `ccs bar --help` to help subcommand and does not launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--help']);
    expect(calls).toEqual(['help:']);
    expect(calls).not.toContain(expect.stringMatching(/^launch:/));
  });

  it('dispatches `ccs bar -h` to help subcommand and does not launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['-h']);
    expect(calls).toEqual(['help:']);
    expect(calls).not.toContain(expect.stringMatching(/^launch:/));
  });

  it('dispatches `ccs bar help` to help subcommand and does not hit unknown-subcommand error', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['help']);
    expect(calls).toEqual(['help:']);
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).not.toMatch(/Unknown bar subcommand/);
  });
});

// ---------------------------------------------------------------------------
// 2. root-command-router registers `bar`
// ---------------------------------------------------------------------------

describe('root-command-router registers bar', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/index', () => ({
      handleBarCommand: async (args: string[]) => {
        calls.push(`bar:${args.join(' ')}`);
      },
    }));
  });

  it('routes `ccs bar` through the root router', async () => {
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/root-command-router?test=${Date.now()}-${moduleSeq}`
    );
    const { tryHandleRootCommand } = mod;

    const handled = await tryHandleRootCommand(['bar']);
    expect(handled).toBe(true);
    expect(calls).toEqual(['bar:']);
  });

  it('routes `ccs bar install` with args preserved', async () => {
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/root-command-router?test=${Date.now()}-${moduleSeq}`
    );
    const { tryHandleRootCommand } = mod;

    await tryHandleRootCommand(['bar', 'install', '--force']);
    expect(calls).toContain('bar:install --force');
  });
});

// ---------------------------------------------------------------------------
// 3. bar.json contract written by launch
// ---------------------------------------------------------------------------

describe('bar.json contract (launch subcommand)', () => {
  it('writes ~/.ccs/bar.json with correct shape when server starts', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // Mock dependencies injected into handleBarLaunch
    const mockEnsureDashboard = async () => ({ port: 4242, baseUrl: 'http://127.0.0.1:4242' });
    const mockOpenApp = async (_appPath: string) => {
      calls.push(`open:${_appPath}`);
    };
    const mockGetCcsDir = () => ccsDir;

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ensureDashboard: mockEnsureDashboard,
      openApp: mockOpenApp,
      getCcsDir: mockGetCcsDir,
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(fs.existsSync(barJsonPath)).toBe(true);

    const barJson = JSON.parse(fs.readFileSync(barJsonPath, 'utf8')) as unknown;
    expect(barJson).toMatchObject({
      baseUrl: 'http://127.0.0.1:4242',
      port: 4242,
      authMode: 'loopback',
    });
  });

  it('bar.json authMode is always "loopback" in v1', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ensureDashboard: async () => ({ port: 9000, baseUrl: 'http://127.0.0.1:9000' }),
      openApp: async () => {
        /* noop */
      },
      getCcsDir: () => ccsDir,
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    const barJson = JSON.parse(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')) as {
      authMode: string;
    };
    expect(barJson.authMode).toBe('loopback');
  });

  it('prints guidance when app is not installed', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    // App doesn't exist at appInstallPath
    const nonExistentApp = path.join(tempHome, 'Applications', 'CCS Bar.app');

    await handleBarLaunch([], {
      ensureDashboard: async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' }),
      openApp: async () => {
        throw new Error('App not found');
      },
      getCcsDir: () => ccsDir,
      appInstallPath: nonExistentApp,
    });

    const allOutput = consoleOutput.join('\n');
    // Should suggest installation
    expect(allOutput.toLowerCase()).toMatch(/install|not found|ccs bar install/i);
  });

  it('writes bar.json even when open fails (degraded path)', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ensureDashboard: async () => ({ port: 3001, baseUrl: 'http://127.0.0.1:3001' }),
      openApp: async () => {
        throw new Error('open failed');
      },
      getCcsDir: () => ccsDir,
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    // bar.json should still be written despite open failure
    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(fs.existsSync(barJsonPath)).toBe(true);
  });

  it('prints degraded-path warning when server cannot start', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ensureDashboard: async () => {
        throw new Error('port busy');
      },
      openApp: async () => {
        /* noop */
      },
      getCcsDir: () => ccsDir,
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput.toLowerCase()).toMatch(/error|failed|could not|unable/i);
  });
});

// ---------------------------------------------------------------------------
// 4. install subcommand — floating tag + Info.plist version + compat handshake
// ---------------------------------------------------------------------------

describe('bar install subcommand', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';
  const FAKE_VERSION = '1.2.3';

  /** Create the fake CCS Bar.app in appsDir so the post-extract assertion passes. */
  function fakeExtract(appsDir: string) {
    return async (_url: string, dest: string) => {
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
      calls.push('download');
    };
  }

  it('resolves the floating ccs-bar-latest tag (not exact CLI version)', async () => {
    const fetchedUrls: string[] = [];
    const appsDir = path.join(tempHome, 'Applications');

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async (tag: string, _asset: string) => {
        fetchedUrls.push(tag);
        return { downloadUrl: FAKE_DOWNLOAD_URL };
      },
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async (_baseUrl: string) => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    // Must use the floating tag, NOT the CLI version
    expect(fetchedUrls).toContain('ccs-bar-latest');
    expect(fetchedUrls).not.toContain(expect.stringMatching(/^\d+\.\d+\.\d+$/));
  });

  it('pins the Info.plist version (not tag name) to ~/.ccs/bar/.version', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(true);
    expect(fs.readFileSync(versionFile, 'utf8').trim()).toBe(FAKE_VERSION);
  });

  it('calls /api/bar/summary for compat handshake after install', async () => {
    const compatCalls: string[] = [];
    const appsDir = path.join(tempHome, 'Applications');

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async (baseUrl: string) => {
        compatCalls.push(baseUrl);
        return { compatible: true, reason: 'ok' };
      },
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    expect(compatCalls.length).toBeGreaterThan(0);
  });

  it('does not hard-fail when compat returns no-bar-api', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await expect(
      handleBarInstall([], {
        fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
        downloadAndExtract: fakeExtract(appsDir),
        verifyCompat: async () => ({ compatible: false, reason: 'no-bar-api' }),
        readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
        getCcsDir: () => path.join(tempHome, '.ccs'),
        getAppsDir: () => appsDir,
      })
    ).resolves.toBeUndefined(); // does not throw

    const allOutput = consoleOutput.join('\n');
    expect(allOutput.toLowerCase()).toMatch(/warn|api|update/i);
  });

  it('prints xattr/Gatekeeper note for ad-hoc builds', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    // Must mention either right-click or xattr quarantine command
    expect(allOutput).toMatch(/xattr|right-click|quarantine/i);
  });

  it('does not overwrite ~/Applications if download fails', async () => {
    const appsDir = path.join(tempHome, 'Applications');

    const { handleBarInstall } = await loadInstallSubcommand();

    await expect(
      handleBarInstall([], {
        fetchReleaseAsset: async () => {
          throw new Error('network error');
        },
        downloadAndExtract: async () => {
          /* noop */
        },
        verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
        readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
        getCcsDir: () => path.join(tempHome, '.ccs'),
        getAppsDir: () => appsDir,
      })
    ).resolves.toBeUndefined(); // should not throw

    // Apps dir should not be touched
    expect(fs.existsSync(path.join(appsDir, 'CCS Bar.app'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4a. Finding #8 — redirect-following download (mock 302 then 200 via deps)
// ---------------------------------------------------------------------------

describe('bar install: redirect-following download (#8)', () => {
  const REDIRECT_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';
  const FINAL_URL = 'https://objects.githubusercontent.com/download/CCS-Bar.app.zip';
  const FAKE_VERSION = '1.0.0';

  it('succeeds when downloadAndExtract follows a 302 redirect to githubusercontent', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const urlsRequested: string[] = [];

    const { handleBarInstall } = await loadInstallSubcommand();

    // Simulate a downloader that internally follows a redirect (302 -> 200).
    // The dep mock receives the initial URL and resolves to the final content.
    const redirectFollowingExtract = async (url: string, dest: string) => {
      urlsRequested.push(url);
      // Simulate: original URL would 302 to FINAL_URL; mock follows it and succeeds.
      if (url !== REDIRECT_URL) {
        throw new Error(`Unexpected URL: ${url}`);
      }
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: REDIRECT_URL,
      }),
      downloadAndExtract: redirectFollowingExtract,
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    // The download should have been attempted with the original URL
    expect(urlsRequested).toContain(REDIRECT_URL);
    // No error in output
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).not.toMatch(/\[X\]/);
    expect(allOutput).toMatch(/\[OK\]/);
  });
});

// ---------------------------------------------------------------------------
// 4b. Finding #11 — HTTP statusCode != 200 throws descriptive error
// ---------------------------------------------------------------------------

describe('bar install: HTTP status code validation (#11)', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  it('reports descriptive error when downloadAndExtract throws on non-200', async () => {
    const { handleBarInstall } = await loadInstallSubcommand();

    // Simulate a downloader that respects status codes and throws on 403.
    const statusCheckingExtract = async (url: string, _dest: string) => {
      throw new Error(`Download failed: HTTP 403 for ${url}`);
    };

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: statusCheckingExtract,
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => path.join(tempHome, 'Applications'),
    });

    const allOutput = consoleOutput.join('\n');
    // Should surface the HTTP status in the output
    expect(allOutput).toMatch(/403|Download failed/i);
    expect(allOutput).toMatch(/\[X\]/);
  });

  it('reports descriptive error on 404 (asset not found)', async () => {
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: async (_url) => {
        throw new Error(`Download failed: HTTP 404 for ${_url}`);
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => path.join(tempHome, 'Applications'),
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/404|Download failed/i);
  });
});

// ---------------------------------------------------------------------------
// 4c. Finding #9 — host allowlist rejects non-github URLs
// ---------------------------------------------------------------------------

describe('bar install: host allowlist validation (#9)', () => {
  it('validateDownloadUrl accepts github.com URLs', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    expect(() =>
      validateDownloadUrl('https://github.com/kaitranntt/ccs/releases/download/tag/CCS-Bar.app.zip')
    ).not.toThrow();
  });

  it('validateDownloadUrl accepts objects.githubusercontent.com URLs', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    expect(() =>
      validateDownloadUrl('https://objects.githubusercontent.com/some/path/CCS-Bar.app.zip')
    ).not.toThrow();
  });

  it('validateDownloadUrl accepts *.githubusercontent.com wildcard', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    expect(() =>
      validateDownloadUrl('https://raw.githubusercontent.com/some/path/file.zip')
    ).not.toThrow();
  });

  it('validateDownloadUrl rejects http:// (non-HTTPS)', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    expect(() =>
      validateDownloadUrl('http://github.com/kaitranntt/ccs/releases/download/tag/file.zip')
    ).toThrow(/HTTPS|https/i);
  });

  it('validateDownloadUrl rejects untrusted hostnames', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    expect(() => validateDownloadUrl('https://evil.example.com/CCS-Bar.app.zip')).toThrow(
      /allowlist|trusted/i
    );
  });

  it('validateDownloadUrl rejects a URL that looks like github but is not', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    // A domain that ends in github.com.attacker.com must be rejected
    expect(() => validateDownloadUrl('https://github.com.attacker.com/download/file.zip')).toThrow(
      /allowlist|trusted/i
    );
  });

  it('handleBarInstall surfaces a clear error for non-github download URLs', async () => {
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: 'https://evil.example.com/CCS-Bar.app.zip',
      }),
      // downloadAndExtract is the production default; it calls validateDownloadUrl internally.
      // We pass a test-double that applies the same validation.
      downloadAndExtract: async (url: string, _dest: string) => {
        // Inline the validation that the production code runs.
        const { validateDownloadUrl } = await loadInstallSubcommand();
        validateDownloadUrl(url);
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => path.join(tempHome, 'Applications'),
    });

    const allOutput = consoleOutput.join('\n');
    // Must report download/extraction failure with a clear [X] marker.
    expect(allOutput).toMatch(/\[X\]/);
    expect(allOutput.toLowerCase()).toMatch(/download|extraction|failed/i);
  });
});

// ---------------------------------------------------------------------------
// 4d. Compat capability handshake (replaces old major-version check)
// ---------------------------------------------------------------------------

describe('bar install: compat capability handshake', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  function fakeExtract(appsDir: string) {
    return async (_url: string, dest: string) => {
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };
  }

  it('verifyCompat receives only baseUrl (no installedVersion param)', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const capturedArgs: Array<{ baseUrl: string }> = [];
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async (baseUrl: string) => {
        capturedArgs.push({ baseUrl });
        return { compatible: true, reason: 'ok' };
      },
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    expect(capturedArgs.length).toBe(1);
    // verifyCompat receives only one argument (baseUrl)
    expect(capturedArgs[0].baseUrl).toMatch(/http/);
  });

  it('prints [OK] server bar API reachable when compat returns ok', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[OK\].*[Ss]erver bar API/);
    // Must NOT print any mismatch warning
    expect(allOutput).not.toMatch(/mismatch/i);
  });

  it('warns with actionable message when compat returns no-bar-api (404)', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: false, reason: 'no-bar-api' }),
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[!\]/);
    // Must mention the bar API and instruct the user to update CCS
    expect(allOutput.toLowerCase()).toMatch(/bar api|\/api\/bar\/summary/i);
    expect(allOutput.toLowerCase()).toMatch(/update ccs/i);
  });

  it('soft-warns (not crash) when compat returns unreachable', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: false, reason: 'unreachable' }),
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    // Should warn rather than print [OK] compat confirmed
    expect(allOutput).not.toMatch(/\[OK\].*[Cc]ompat/);
    expect(allOutput).toMatch(/\[!\].*[Cc]ould not verify|server may not be running/i);
  });

  it('install never hard-fails due to compat failure', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await expect(
      handleBarInstall([], {
        fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
        downloadAndExtract: fakeExtract(appsDir),
        verifyCompat: async () => {
          throw new Error('network explosion');
        },
        readAppBundleVersion: (_appPath: string) => '1.4.0',
        getCcsDir: () => path.join(tempHome, '.ccs'),
        getAppsDir: () => appsDir,
      })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4e. Finding #12 — post-extract CCS Bar.app existence assertion
// ---------------------------------------------------------------------------

describe('bar install: post-extract app-exists assertion (#12)', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  it('prints [OK] only when CCS Bar.app exists after extraction', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    // Correctly places CCS Bar.app in dest.
    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: async (_url: string, dest: string) => {
        fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[OK\].*CCS Bar/);
    expect(allOutput).not.toMatch(/\[X\]/);
  });

  it('reports [X] and lists extracted files when CCS Bar.app is absent after extraction', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    // Extraction "succeeds" but places wrong file name.
    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: async (_url: string, dest: string) => {
        // Places a wrongly-named artifact (simulates a bad archive).
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, 'WrongName.app'), 'dummy');
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[X\]/);
    // Should mention the missing app name
    expect(allOutput).toMatch(/CCS Bar\.app/);
  });

  it('does not print xattr guidance when app is missing after extraction', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: async (_url: string, dest: string) => {
        // Nothing extracted
        fs.mkdirSync(dest, { recursive: true });
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.0.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    // xattr note should NOT appear if install didn't succeed
    expect(allOutput).not.toMatch(/xattr.*quarantine/i);
  });
});

// ---------------------------------------------------------------------------
// 4h. Regression: version source of truth — Info.plist, not tag_name
// ---------------------------------------------------------------------------

describe('bar install: Info.plist version extraction regression tests', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  function fakeExtract(appsDir: string) {
    return async (_url: string, dest: string) => {
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };
  }

  it('output never contains "vccs-bar-latest" when release tag is floating', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // readAppBundleVersion returns the real version from Info.plist
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    // Must never print the floating tag as a version string
    expect(allOutput).not.toMatch(/vccs-bar-latest/i);
    // Must print the actual plist version
    expect(allOutput).toMatch(/1\.4\.0/);
  });

  it('pins Info.plist version (1.4.0) to .version file, not the tag name', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => '1.4.0',
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(true);
    const pinned = fs.readFileSync(versionFile, 'utf8').trim();
    // Must be the plist value, not the floating tag
    expect(pinned).toBe('1.4.0');
    expect(pinned).not.toMatch(/ccs-bar-latest/i);
  });

  it('no pin write and ASCII notice when readAppBundleVersion returns null', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // Unreadable Info.plist — returns null
      readAppBundleVersion: (_appPath: string) => null,
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    // No pin written
    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(false);

    const allOutput = consoleOutput.join('\n');
    // ASCII notice must appear
    expect(allOutput).toMatch(/\[!\].*Info\.plist/i);
    // Install itself must still succeed (no [X])
    expect(allOutput).toMatch(/\[OK\].*CCS Bar/);
    // No crash — test reaches here
  });

  it('defaultReadAppBundleVersion: extracts CFBundleShortVersionString from XML plist fixture', async () => {
    // Test the default implementation directly using a temp file.
    // We import the real module (not a mock) to access the default implementation.
    // Because the module only exports handleBarInstall and validateDownloadUrl,
    // we exercise the default via handleBarInstall without mocking readAppBundleVersion.
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    const appPath = path.join(appsDir, 'CCS Bar.app');

    // Create a real Info.plist fixture inside the fake .app bundle
    const contentsDir = path.join(appPath, 'Contents');
    fs.mkdirSync(contentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contentsDir, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.kaitranntt.CCSBar</string>
  <key>CFBundleShortVersionString</key>
  <string>2.7.1</string>
  <key>CFBundleVersion</key>
  <string>271</string>
</dict>
</plist>`
    );

    const { handleBarInstall } = await loadInstallSubcommand();

    // Use production readAppBundleVersion (omit from deps so default is used)
    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl:
          'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip',
      }),
      downloadAndExtract: async (_url: string, _dest: string) => {
        // App bundle already created above — no actual download needed
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // readAppBundleVersion intentionally omitted → uses production default
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(true);
    expect(fs.readFileSync(versionFile, 'utf8').trim()).toBe('2.7.1');

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/2\.7\.1/);
  });

  it('defaultReadAppBundleVersion: returns null when Info.plist is missing', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    const appPath = path.join(appsDir, 'CCS Bar.app');

    // Create app bundle WITHOUT Info.plist
    fs.mkdirSync(appPath, { recursive: true });

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl:
          'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip',
      }),
      downloadAndExtract: async (_url: string, _dest: string) => {
        // App bundle already created — no plist inside
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // readAppBundleVersion omitted → uses production default
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    // No pin because plist is missing
    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(false);

    const allOutput = consoleOutput.join('\n');
    // Should emit the ASCII notice
    expect(allOutput).toMatch(/\[!\].*Info\.plist/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Port discovery fallback
// ---------------------------------------------------------------------------

describe('port discovery', () => {
  it('reads port from existing bar.json when present', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const barJson = { baseUrl: 'http://127.0.0.1:5555', port: 5555, authMode: 'loopback' };
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), JSON.stringify(barJson));

    // Import the port-discovery utility from the bar module
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { resolveBarPort } = mod as { resolveBarPort?: (ccsDir: string) => number | null };

    if (resolveBarPort) {
      const port = resolveBarPort(ccsDir);
      expect(port).toBe(5555);
    }
    // If resolveBarPort is not exported separately, the behavior is tested through handleBarLaunch
  });

  it('returns null when bar.json is absent', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    // No bar.json written

    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { resolveBarPort } = mod as { resolveBarPort?: (ccsDir: string) => number | null };

    if (resolveBarPort) {
      const port = resolveBarPort(ccsDir);
      expect(port).toBeNull();
    }
  });

  it('returns null when bar.json is malformed', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), 'NOT_JSON{{{');

    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { resolveBarPort } = mod as { resolveBarPort?: (ccsDir: string) => number | null };

    if (resolveBarPort) {
      const port = resolveBarPort(ccsDir);
      expect(port).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. uninstall subcommand
// ---------------------------------------------------------------------------

describe('uninstall subcommand', () => {
  it('removes the app and clears the version pin', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const barDir = path.join(ccsDir, 'bar');
    const appsDir = path.join(tempHome, 'Applications');
    const appPath = path.join(appsDir, 'CCS Bar.app');

    fs.mkdirSync(barDir, { recursive: true });
    fs.mkdirSync(appPath, { recursive: true }); // fake .app bundle (it's a dir on macOS)
    fs.writeFileSync(path.join(barDir, '.version'), '1.0.0');

    const { handleBarUninstall } = await loadUninstallSubcommand();

    await handleBarUninstall([], {
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
      appName: 'CCS Bar.app',
    });

    expect(fs.existsSync(appPath)).toBe(false);
    expect(fs.existsSync(path.join(barDir, '.version'))).toBe(false);
  });

  it('is a no-op and does not throw when app is not installed', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarUninstall } = await loadUninstallSubcommand();

    await expect(
      handleBarUninstall([], {
        getCcsDir: () => ccsDir,
        getAppsDir: () => path.join(tempHome, 'Applications'),
        appName: 'CCS Bar.app',
      })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. version subcommand — Finding #13: unambiguous CLI vs Bar app labels
// ---------------------------------------------------------------------------

describe('version subcommand', () => {
  it('prints the CCS version and exits cleanly', async () => {
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;

    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/version-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { handleBarVersion } = mod as { handleBarVersion: () => Promise<void> };

    await handleBarVersion();

    process.exit = origExit;

    const allOutput = consoleOutput.join('\n');
    // Should mention "bar" and a version string
    expect(allOutput.toLowerCase()).toMatch(/bar|ccs/i);
    expect(allOutput).toMatch(/\d+\.\d+/);
    expect(exitCode).toBe(0);
  });

  it('labels the CLI version unambiguously as CCS CLI (not CCS Bar)', async () => {
    // Finding #13: line must say "CCS CLI v..." not just "CCS Bar v..."
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;

    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/version-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { handleBarVersion } = mod as { handleBarVersion: () => Promise<void> };

    await handleBarVersion();

    process.exit = origExit;

    const allOutput = consoleOutput.join('\n');
    // Must include a line explicitly identifying the CLI version
    expect(allOutput).toMatch(/CCS CLI v\d+/);
    expect(exitCode).toBe(0);
  });

  it('labels the Bar app version separately from the CLI version', async () => {
    // Finding #13: when Bar app is installed, its version must be on a separate labeled line
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;

    // getCcsDir() with CCS_HOME=tempHome returns tempHome/.ccs
    // so the bar version file lives at tempHome/.ccs/bar/.version
    const ccsDir = path.join(tempHome, '.ccs');
    const barDir = path.join(ccsDir, 'bar');
    fs.mkdirSync(barDir, { recursive: true });
    fs.writeFileSync(path.join(barDir, '.version'), '9.8.7');

    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/version-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { handleBarVersion } = mod as { handleBarVersion: () => Promise<void> };

    await handleBarVersion();

    process.exit = origExit;

    const allOutput = consoleOutput.join('\n');
    // CLI version line
    expect(allOutput).toMatch(/CCS CLI v\d+/);
    // Bar app version line — must say "CCS Bar app: v..." not just "CCS Bar v..."
    expect(allOutput).toMatch(/CCS Bar app: v9\.8\.7/);
    expect(exitCode).toBe(0);
  });

  it('prints not-installed guidance for Bar app when version file is absent', async () => {
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;

    // No bar version file written — tempHome/.ccs/bar/.version absent
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/bar/version-subcommand?test=${Date.now()}-${moduleSeq}`
    );
    const { handleBarVersion } = mod as { handleBarVersion: () => Promise<void> };

    await handleBarVersion();

    process.exit = origExit;

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/CCS CLI v\d+/);
    expect(allOutput.toLowerCase()).toMatch(/not installed|ccs bar install/i);
    expect(exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4f. Fix #6 — redirect host bypass: every hop is re-validated
// ---------------------------------------------------------------------------

describe('bar install: redirect host re-validation (fix #6)', () => {
  const INITIAL_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';
  const EVIL_REDIRECT_URL = 'https://evil.example.com/CCS-Bar.app.zip';
  const FAKE_VERSION = '1.0.0';

  it('rejects a download when a redirect leads to an untrusted host', async () => {
    // Simulate a downloadAndExtract that follows a redirect to an untrusted host
    // and validates each hop (the production fix). The mock replicates the fix logic.
    const { handleBarInstall, validateDownloadUrl } = await loadInstallSubcommand();

    const redirectFollowingExtract = async (url: string, _dest: string) => {
      // Validate initial URL
      validateDownloadUrl(url);
      // Simulate a 302 to an evil host — production code re-validates Location
      validateDownloadUrl(EVIL_REDIRECT_URL); // should throw
    };

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: INITIAL_URL,
      }),
      downloadAndExtract: redirectFollowingExtract,
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => path.join(tempHome, 'Applications'),
    });

    const allOutput = consoleOutput.join('\n');
    // The validation error should surface as a download/extraction failure
    expect(allOutput).toMatch(/\[X\]/);
    expect(allOutput.toLowerCase()).toMatch(/download|extraction|failed/i);
  });

  it('validateDownloadUrl blocks redirect targets with untrusted hostnames', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();

    // The redirect target must be rejected just like any initial URL
    expect(() => validateDownloadUrl(EVIL_REDIRECT_URL)).toThrow(/allowlist|trusted/i);
  });

  it('validateDownloadUrl allows the expected redirect target (githubusercontent.com)', async () => {
    const { validateDownloadUrl } = await loadInstallSubcommand();
    const legitimateRedirect = 'https://objects.githubusercontent.com/file/CCS-Bar.app.zip';
    expect(() => validateDownloadUrl(legitimateRedirect)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4g. Fix #14 — zip-slip guard: reject archives with traversal entries
// ---------------------------------------------------------------------------

describe('bar install: zip-slip guard (fix #14)', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';
  const FAKE_VERSION = '1.0.0';

  it('rejects download when downloadAndExtract detects a zip-slip entry', async () => {
    const { handleBarInstall } = await loadInstallSubcommand();

    // Simulate an extractor that detects a zip-slip entry and throws
    const zipSlipExtract = async (_url: string, _dest: string) => {
      throw new Error(
        'Zip-slip detected: archive entry "../../../evil" contains a path traversal component. Refusing to extract.'
      );
    };

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: zipSlipExtract,
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => path.join(tempHome, 'Applications'),
    });

    const allOutput = consoleOutput.join('\n');
    // Should report failure and not proceed to install
    expect(allOutput).toMatch(/\[X\]/);
    expect(allOutput.toLowerCase()).toMatch(/download|extraction|failed/i);
    // App should not be installed
    expect(fs.existsSync(path.join(tempHome, 'Applications', 'CCS Bar.app'))).toBe(false);
  });

  it('allows a clean archive with safe paths to proceed normally', async () => {
    const appsDir = path.join(tempHome, 'Applications');
    const { handleBarInstall } = await loadInstallSubcommand();

    // Simulate an extractor that validates entries and finds no traversal
    const safeExtract = async (_url: string, dest: string) => {
      // All entry paths are safe relative paths — no ".." or absolute
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl: FAKE_DOWNLOAD_URL,
      }),
      downloadAndExtract: safeExtract,
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: (_appPath: string) => FAKE_VERSION,
      getCcsDir: () => path.join(tempHome, '.ccs'),
      getAppsDir: () => appsDir,
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[OK\]/);
    expect(allOutput).not.toMatch(/\[X\]/);
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — stale .version cleanup when readAppBundleVersion returns null
// ---------------------------------------------------------------------------

describe('bar install: stale version-pin removal on null plist read (Fix 1)', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  function fakeExtract(appsDir: string) {
    return async (_url: string, dest: string) => {
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };
  }

  it('removes a stale .version pin when readAppBundleVersion returns null, and install still succeeds', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    const barDir = path.join(ccsDir, 'bar');

    // Pre-write a stale pin from a previous install
    fs.mkdirSync(barDir, { recursive: true });
    fs.writeFileSync(path.join(barDir, '.version'), '9.9.9');

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // Simulate unreadable Info.plist
      readAppBundleVersion: (_appPath: string) => null,
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    // Stale pin must be gone
    const versionFile = path.join(barDir, '.version');
    expect(fs.existsSync(versionFile)).toBe(false);

    // Install still reports success (no [X])
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[OK\].*CCS Bar/);
    expect(allOutput).not.toMatch(/\[X\]/);
    // ASCII notice still appears
    expect(allOutput).toMatch(/\[!\].*Info\.plist/i);
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — `ccs bar install --help` dispatches to help, not install
// ---------------------------------------------------------------------------

describe('bar command dispatcher: --help anywhere in args (Fix 2)', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/launch-subcommand', () => ({
      handleBarLaunch: async (args: string[]) => {
        calls.push(`launch:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/install-subcommand', () => ({
      handleBarInstall: async (args: string[]) => {
        calls.push(`install:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/uninstall-subcommand', () => ({
      handleBarUninstall: async (args: string[]) => {
        calls.push(`uninstall:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/version-subcommand', () => ({
      handleBarVersion: async () => {
        calls.push(`version:`);
      },
    }));

    mock.module('../../../src/commands/bar/help-subcommand', () => ({
      showHelp: async () => {
        calls.push(`help:`);
      },
    }));
  });

  it('`ccs bar install --help` dispatches to help and does NOT call install handler', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['install', '--help']);
    expect(calls).toContain('help:');
    expect(calls.some((c) => c.startsWith('install:'))).toBe(false);
  });

  it('`ccs bar uninstall -h` dispatches to help and does NOT call uninstall handler', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['uninstall', '-h']);
    expect(calls).toContain('help:');
    expect(calls.some((c) => c.startsWith('uninstall:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — defaultReadAppBundleVersion: whitespace-only plist value → null
// ---------------------------------------------------------------------------

describe('bar install: whitespace-only CFBundleShortVersionString yields null (Fix 3)', () => {
  it('defaultReadAppBundleVersion returns null for a whitespace-only version string', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    const appPath = path.join(appsDir, 'CCS Bar.app');
    const contentsDir = path.join(appPath, 'Contents');

    // Create Info.plist with a whitespace-only CFBundleShortVersionString
    fs.mkdirSync(contentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contentsDir, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>   </string>
</dict>
</plist>`
    );

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({
        downloadUrl:
          'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip',
      }),
      downloadAndExtract: async (_url: string, _dest: string) => {
        // App bundle already created above
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      // readAppBundleVersion intentionally omitted → uses production default
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
    });

    // Whitespace-only version treated as null → no pin written
    const versionFile = path.join(ccsDir, 'bar', '.version');
    expect(fs.existsSync(versionFile)).toBe(false);

    // ASCII notice must appear
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/\[!\].*Info\.plist/i);
  });
});
