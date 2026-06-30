/**
 * `ccs bar install` — download the CCS Bar app from the floating
 * `ccs-bar-latest` GitHub release tag and install to ~/Applications.
 *
 * Intentionally uses a FLOATING tag (not the exact CLI version) so the
 * Swift app can be rebuilt and published independently. After extraction,
 * the real app version is read from the bundle's Contents/Info.plist
 * (CFBundleShortVersionString) and pinned to ~/.ccs/bar/.version.
 *
 * Post-install compat check: single GET {baseUrl}/api/bar/summary.
 * 200 = server serves the bar API (compatible).
 * 404 = server too old (actionable warning).
 * Other / unreachable = soft-warn, never hard-fail install.
 *
 * Mirrors the download/version-pin pattern in src/cliproxy/binary-manager.ts.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCcsDir } from '../../config/config-loader-facade';
import { hasAnyFlag } from '../arg-extractor';
import { getLaunchJsonPath } from './bar-paths';
import type { LaunchJson } from './bar-paths';
import { createBarLaunchDescriptor } from './launch-descriptor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Floating release tag — never pin to exact CLI semver. */
const BAR_RELEASE_TAG = 'ccs-bar-latest';
const BAR_APP_NAME = 'CCS Bar.app';
const BAR_ASSET_NAME = 'CCS-Bar.app.zip';
const BAR_GITHUB_REPO = 'kaitranntt/ccs';

/**
 * Allowlist of hostnames from which we will accept asset downloads.
 * GitHub releases redirect from github.com to objects.githubusercontent.com.
 * Artifact authenticity is enforced separately with the GitHub release asset
 * SHA-256 digest before extraction.
 */
const DOWNLOAD_HOST_ALLOWLIST: ReadonlyArray<string> = [
  'github.com',
  'objects.githubusercontent.com',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleaseAssetResult {
  downloadUrl: string;
  sha256: string;
}

export interface CompatResult {
  compatible: boolean;
  reason: 'ok' | 'no-bar-api' | 'unreachable';
}

export interface InstallDeps {
  /**
   * Resolve the asset download URL from a GitHub release tag.
   * Production: calls GitHub API releases/tags/{tag}.
   * Test: mock that returns a fake URL.
   */
  fetchReleaseAsset: (tag: string, asset: string) => Promise<ReleaseAssetResult>;
  /**
   * Download the zip archive, verify its SHA-256 digest, and extract the .app bundle into dest/.
   * Production: uses undici to stream + verify + extract (with redirect + status check).
   */
  downloadAndExtract: (url: string, dest: string, expectedSha256: string) => Promise<void>;
  /**
   * GET {baseUrl}/api/bar/summary — capability handshake.
   * 200 → compatible; 404 → no-bar-api; else/unreachable → unreachable.
   * Never hard-fails install.
   */
  verifyCompat: (baseUrl: string) => Promise<CompatResult>;
  /**
   * Read CFBundleShortVersionString from {appPath}/Contents/Info.plist.
   * Returns null if the file is absent or unreadable.
   */
  readAppBundleVersion: (appPath: string) => string | null;
  /** Returns path to ~/.ccs (respects CCS_HOME). */
  getCcsDir: () => string;
  /** Destination directory for the .app bundle (~/Applications by default). */
  getAppsDir: () => string;
  /**
   * Invoke handleBarLaunch after a successful install when the user consents.
   * Injectable so tests can assert invocation without starting a real server.
   */
  launchBar: (args: string[]) => Promise<void>;
  /**
   * Ask the user whether to launch CCS Bar now (stdin-TTY-only).
   * Returns true on yes/default, false on no or non-TTY stdin.
   * Injectable for tests.
   */
  promptLaunch: () => Promise<boolean>;
  /**
   * Detect whether CCS Bar is already running.
   * Production: uses /usr/bin/pgrep -x CCSBar (exit 0 = running, exit 1 = not found).
   * Returns false on any error (treat pgrep failure as not running).
   * Injectable for tests — avoids touching the real process table.
   */
  isBarRunning: () => Promise<boolean>;
  /**
   * Remove an existing app bundle before extraction so a malformed archive
   * cannot silently leave the old version in place.
   * Production: fs.rmSync(appPath, { recursive: true, force: true }).
   * Injectable for tests — avoids real filesystem side-effects.
   * Throws on failure; caller catches and aborts install.
   */
  removeExistingApp: (appPath: string) => void;
  /**
   * Write launch.json so the Swift app can spawn the server without a shell PATH.
   * Called after successful install so the descriptor is always fresh.
   * Injectable for tests — asserts the file is written without real fs side-effects.
   * Non-fatal when it throws (install already succeeded).
   */
  writeLaunchDescriptor: (jsonPath: string, descriptor: LaunchJson) => void;
}

// ---------------------------------------------------------------------------
// Host allowlist validation (Finding #9)
// ---------------------------------------------------------------------------

/**
 * Validate that a download URL is https and its hostname is in the allowlist
 * (exact match or *.githubusercontent.com wildcard).
 * Throws a descriptive Error if validation fails.
 */
export function validateDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Download URL is not a valid URL: ${url}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Download URL must use HTTPS, got: ${parsed.protocol} for ${url}`);
  }

  const host = parsed.hostname.toLowerCase();
  const allowed =
    (DOWNLOAD_HOST_ALLOWLIST as string[]).includes(host) || host.endsWith('.githubusercontent.com');

  if (!allowed) {
    throw new Error(
      `Download URL hostname "${host}" is not in the trusted allowlist ` +
        `(${DOWNLOAD_HOST_ALLOWLIST.join(', ')}, *.githubusercontent.com). ` +
        `Refusing to download from untrusted host.`
    );
  }
}

// ---------------------------------------------------------------------------
// Production implementation helpers
// ---------------------------------------------------------------------------

async function defaultFetchReleaseAsset(tag: string, asset: string): Promise<ReleaseAssetResult> {
  const { request } = await import('undici');
  const apiUrl = `https://api.github.com/repos/${BAR_GITHUB_REPO}/releases/tags/${tag}`;
  const { statusCode, body } = await request(apiUrl, {
    headers: {
      'User-Agent': 'ccs-cli',
      Accept: 'application/vnd.github+json',
    },
  });

  if (statusCode !== 200) {
    throw new Error(`GitHub API returned ${statusCode} for tag ${tag}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const release = (await body.json()) as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (release.assets as any[]).find((a: { name: string }) => a.name === asset);
  if (!found) {
    throw new Error(`Asset "${asset}" not found in release ${tag}`);
  }

  const digest = typeof found.digest === 'string' ? found.digest : '';
  const match = /^sha256:([a-fA-F0-9]{64})$/.exec(digest.trim());
  if (!match || !match[1]) {
    throw new Error(
      `Asset "${asset}" in release ${tag} does not include a valid sha256 digest. ` +
        'Refusing to install an unverifiable CCS Bar archive.'
    );
  }

  return { downloadUrl: found.browser_download_url as string, sha256: match[1].toLowerCase() };
}

/**
 * Download a zip from `url` (following up to 5 GitHub 302 redirects, re-validating
 * each hop's Location hostname) and extract its contents into `dest`.
 *
 * Fixes applied:
 * - Fix #6: maxRedirections:0 + manual redirect following so every hop's Location
 *   header is passed through validateDownloadUrl before following it.
 *   The previous maxRedirections:5 let undici follow redirects to ANY host unchecked.
 * - Fix #14: list zip entries with `unzip -l` before extracting; reject the archive
 *   if any entry path contains ".." or starts with "/" (zip-slip guard).
 * - Security: verify the downloaded archive against the release asset SHA-256
 *   digest before any extraction or installation.
 * - Finding #11: check `statusCode` and throw a descriptive error before streaming.
 * - Finding #9: validate host+HTTPS before making the first request.
 */
async function defaultDownloadAndExtract(
  url: string,
  dest: string,
  expectedSha256: string
): Promise<void> {
  const { request } = await import('undici');
  const { createHash } = await import('crypto');
  const { createReadStream, createWriteStream, mkdirSync } = fs;
  const { promisify } = await import('util');
  const { pipeline } = await import('stream');
  const streamPipeline = promisify(pipeline);
  const { execFile } = await import('child_process');
  const execFileAsync = promisify(execFile);

  // Validate initial URL (Finding #9) and require an integrity pin.
  validateDownloadUrl(url);
  if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) {
    throw new Error('Missing or invalid SHA-256 digest for CCS Bar archive. Refusing to install.');
  }

  mkdirSync(dest, { recursive: true });

  // Fix #6: follow redirects manually so each hop is re-validated.
  const MAX_REDIRECTS = 5;
  let currentUrl = url;
  let redirectsFollowed = 0;

  while (true) {
    const { statusCode, headers, body } = await request(currentUrl, {
      maxRedirections: 0, // disable undici's auto-follow; we follow manually
    });

    if (statusCode >= 300 && statusCode < 400) {
      const location = Array.isArray(headers['location'])
        ? headers['location'][0]
        : headers['location'];

      if (!location) {
        throw new Error(`Redirect (HTTP ${statusCode}) from ${currentUrl} has no Location header`);
      }

      // Resolve relative redirects against the current URL
      const resolved = new URL(location, currentUrl).toString();

      // Re-validate the redirect target — this is the key fix for #6
      validateDownloadUrl(resolved);

      if (redirectsFollowed >= MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}) while downloading ${url}`);
      }

      // Drain the body to free the socket before following the redirect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (body as any).dump?.();
      currentUrl = resolved;
      redirectsFollowed++;
      continue;
    }

    if (statusCode !== 200) {
      throw new Error(`Download failed: HTTP ${statusCode} for ${currentUrl}`);
    }

    const tmpZip = path.join(os.tmpdir(), `ccs-bar-${Date.now()}.zip`);

    // Stream body to tmpZip, then verify the archive before inspecting/extracting it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await streamPipeline(body as any, createWriteStream(tmpZip));

    const hash = createHash('sha256');
    await streamPipeline(createReadStream(tmpZip), hash);
    const actualSha256 = hash.digest('hex');
    if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      try {
        fs.unlinkSync(tmpZip);
      } catch {
        /* ignore */
      }
      throw new Error(
        'Downloaded CCS Bar archive failed SHA-256 verification. ' +
          `Expected ${expectedSha256.toLowerCase()}, got ${actualSha256.toLowerCase()}.`
      );
    }

    // Fix #14: zip-slip guard — inspect entries before extraction.
    // `unzip -l` lists entries in a machine-readable format; we scan for ".." or
    // absolute paths that would escape the destination directory.
    try {
      const { stdout: listing } = await execFileAsync('unzip', ['-l', tmpZip]);
      const lines = listing.split('\n');
      for (const line of lines) {
        // Entry lines look like: "  <size>  <date> <time>  <path>"
        // We extract the path from the last whitespace-delimited field.
        const match = /^\s+\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/.exec(line);
        if (!match || !match[1]) continue;
        const entryPath = match[1].trim();
        if (!entryPath || entryPath.endsWith('/')) continue; // skip directory entries

        // Reject absolute paths and paths with traversal components
        if (path.isAbsolute(entryPath) || entryPath.includes('..')) {
          try {
            fs.unlinkSync(tmpZip);
          } catch {
            /* ignore */
          }
          throw new Error(
            `Zip-slip detected: archive entry "${entryPath}" contains a path traversal ` +
              `component. Refusing to extract.`
          );
        }
      }
    } catch (err) {
      // If the guard itself throws (e.g. zip-slip detected above), propagate it.
      // If it's a system error (unzip not available), let extraction proceed and
      // surface the issue then.
      if ((err as Error).message?.includes('Zip-slip')) throw err;
      // Warn but continue — extraction will likely also fail if unzip is missing
      console.error(
        `[!] Zip entry scan failed (will attempt extraction): ${(err as Error).message}`
      );
    }

    // Extract the zip into dest
    await execFileAsync('unzip', ['-o', tmpZip, '-d', dest]);

    // Clean up the temp archive
    try {
      fs.unlinkSync(tmpZip);
    } catch {
      /* ignore */
    }

    break;
  }
}

/**
 * Single-request capability handshake: GET {baseUrl}/api/bar/summary.
 * 200 → server serves the bar API (compatible).
 * 404 → server is too old and does not serve the bar API.
 * Any other status or network error → soft-warn (unreachable).
 *
 * The route is loopback-gated server-side; install-time baseUrl is always
 * loopback (bar.json baseUrl or http://127.0.0.1:3000), so the gate passes.
 */
async function defaultVerifyCompat(baseUrl: string): Promise<CompatResult> {
  try {
    const { request } = await import('undici');
    const { statusCode, body } = await request(`${baseUrl}/api/bar/summary`, {
      headers: { 'User-Agent': 'ccs-cli' },
    });

    // Drain the body regardless of status to free the socket.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (body as any).dump?.();
    } catch {
      /* ignore drain errors */
    }

    if (statusCode === 200) {
      return { compatible: true, reason: 'ok' };
    }
    if (statusCode === 404) {
      return { compatible: false, reason: 'no-bar-api' };
    }
    return { compatible: false, reason: 'unreachable' };
  } catch {
    // Network error or server not running.
    return { compatible: false, reason: 'unreachable' };
  }
}

/**
 * Read CFBundleShortVersionString from {appPath}/Contents/Info.plist.
 * The plist is XML text post-codesign (verified on the installed app).
 * Returns null on any error (missing file, binary plist, parse failure).
 */
function defaultReadAppBundleVersion(appPath: string): string | null {
  try {
    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    const contents = fs.readFileSync(plistPath, 'utf8');
    const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(
      contents
    );
    if (!match || !match[1]) return null;
    const v = match[1].trim();
    return v || null;
  } catch {
    return null;
  }
}

function defaultGetCcsDir(): string {
  return getCcsDir();
}

function defaultGetAppsDir(): string {
  return path.join(os.homedir(), 'Applications');
}

function defaultRemoveExistingApp(appPath: string): void {
  fs.rmSync(appPath, { recursive: true, force: true });
}

function defaultWriteLaunchDescriptor(jsonPath: string, descriptor: LaunchJson): void {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(descriptor, null, 2));
}

async function defaultLaunchBar(args: string[]): Promise<void> {
  const { handleBarLaunch } = await import('./launch-subcommand');
  await handleBarLaunch(args);
}

/**
 * Detect whether CCS Bar is already running using `/usr/bin/pgrep -x CCSBar`.
 * pgrep exits 0 when a match is found (running), 1 when no match (not running).
 * execFile surfaces exit code 1 as an error, so we catch and return false.
 * Any other error (pgrep unavailable, permission denied) is also treated as not running.
 */
async function defaultIsBarRunning(): Promise<boolean> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('/usr/bin/pgrep', ['-x', 'CCSBar']);
    return true;
  } catch {
    // pgrep exits 1 when no match found; execFile throws for non-zero exit codes.
    return false;
  }
}

/**
 * Ask the user whether to launch CCS Bar now.
 * Only prompts when stdin is a TTY — stdin is what the prompt actually reads.
 * Non-TTY stdin: return false (caller prints guidance).
 * Default answer is yes (Enter = launch).
 */
async function defaultPromptLaunch(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question('Launch CCS Bar now? [Y/n] ', (answer: string) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      // Empty (Enter) or 'y'/'yes' → launch
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

// ---------------------------------------------------------------------------
// Version pin helpers
// ---------------------------------------------------------------------------

function getBarVersionFilePath(ccsDir: string): string {
  return path.join(ccsDir, 'bar', '.version');
}

function pinBarVersion(ccsDir: string, version: string): void {
  const versionFile = getBarVersionFilePath(ccsDir);
  fs.mkdirSync(path.dirname(versionFile), { recursive: true });
  fs.writeFileSync(versionFile, version);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarInstall(
  args: string[],
  deps: Partial<InstallDeps> = {}
): Promise<void> {
  // Parse --launch / --no-launch / --await-quit flags before delegating to deps.
  const forceLaunch = hasAnyFlag(args, ['--launch']);
  const noLaunch = hasAnyFlag(args, ['--no-launch']);
  const awaitQuit = hasAnyFlag(args, ['--await-quit']);

  const fetchReleaseAsset = deps.fetchReleaseAsset ?? defaultFetchReleaseAsset;
  const downloadAndExtract = deps.downloadAndExtract ?? defaultDownloadAndExtract;
  const verifyCompat = deps.verifyCompat ?? defaultVerifyCompat;
  const readAppBundleVersion = deps.readAppBundleVersion ?? defaultReadAppBundleVersion;
  const launchBar = deps.launchBar ?? defaultLaunchBar;
  const promptLaunch = deps.promptLaunch ?? defaultPromptLaunch;
  const isBarRunning = deps.isBarRunning ?? defaultIsBarRunning;
  const removeExistingApp = deps.removeExistingApp ?? defaultRemoveExistingApp;
  const writeLaunchDescriptor = deps.writeLaunchDescriptor ?? defaultWriteLaunchDescriptor;
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const appsDir = (deps.getAppsDir ?? defaultGetAppsDir)();

  // 0. Already-installed detection: show the current version before proceeding.
  const appPath = path.join(appsDir, BAR_APP_NAME);
  if (fs.existsSync(appPath)) {
    const existingVersion = readAppBundleVersion(appPath);
    if (existingVersion !== null) {
      console.log(`[i] CCS Bar v${existingVersion} is already installed. Reinstalling...`);
    } else {
      console.log('[i] CCS Bar is already installed. Reinstalling...');
    }
  } else {
    console.log('[i] Fetching CCS Bar release info...');
  }

  // 1. Resolve the floating tag → download URL.
  let releaseInfo: ReleaseAssetResult;
  try {
    releaseInfo = await fetchReleaseAsset(BAR_RELEASE_TAG, BAR_ASSET_NAME);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to fetch release asset: ${msg}`);
    console.error('[i] Check your network connection and try again.');
    return;
  }

  const { downloadUrl, sha256 } = releaseInfo;
  console.log(`[i] Installing CCS Bar from ${BAR_RELEASE_TAG}...`);

  // 1b. Stage-then-swap: extract into a hidden staging dir on the same filesystem
  //     so the rename to appPath is atomic-ish. The old bundle is only removed
  //     AFTER the new one is verified in staging — a transient download/extraction
  //     failure during reinstall therefore leaves the previous working install intact.
  fs.mkdirSync(appsDir, { recursive: true });
  let stagingDir: string;
  try {
    stagingDir = fs.mkdtempSync(path.join(appsDir, '.ccs-bar-staging-'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not create staging directory in ${appsDir}: ${msg}`);
    return;
  }

  // Helper: remove staging dir, ignoring errors (best-effort cleanup).
  function cleanupStaging(): void {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  // 2. Download and extract into staging, NOT appsDir.
  try {
    await downloadAndExtract(downloadUrl, stagingDir, sha256);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Download or extraction failed: ${msg}`);
    cleanupStaging();
    return;
  }

  // 3. Finding #12: assert that the expected .app bundle was actually extracted
  //    into the staging dir before touching the old install.
  const stagedApp = path.join(stagingDir, BAR_APP_NAME);
  if (!fs.existsSync(stagedApp)) {
    // Report what was actually extracted to help diagnose archive issues.
    let extracted: string[] = [];
    try {
      extracted = fs.readdirSync(stagingDir);
    } catch {
      /* ignore */
    }
    const found = extracted.length > 0 ? extracted.join(', ') : '(none)';
    console.error(`[X] Extraction succeeded but "${BAR_APP_NAME}" was not found in staging.`);
    console.error(`[i] Files found in staging: ${found}`);
    cleanupStaging();
    return;
  }

  // 3b-pre. --await-quit: if the app is running, poll until it exits before swapping.
  //   Without this flag the existing behavior is preserved exactly (no change).
  if (awaitQuit) {
    const POLL_INTERVAL_MS = 300;
    const TIMEOUT_MS = 15_000;
    const deadline = Date.now() + TIMEOUT_MS;

    if (await isBarRunning()) {
      console.log('[i] Waiting for CCS Bar to quit before swapping...');

      let exited = false;
      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!(await isBarRunning())) {
          exited = true;
          break;
        }
      }

      if (!exited) {
        console.error(
          '[!] CCS Bar is still running; quit it from the menu bar and re-run `ccs bar install`.'
        );
        process.exitCode = 1;
        cleanupStaging();
        return;
      }
    }
  }

  // 3b. New bundle verified in staging — now safe to remove the old install.
  if (fs.existsSync(appPath)) {
    try {
      removeExistingApp(appPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[X] Could not remove the existing CCS Bar.app: ${msg}`);
      console.error('[i] Close any running instance and try again.');
      cleanupStaging();
      return;
    }
  }

  // 3c. Atomic-ish rename: move staged bundle into the final location.
  try {
    fs.renameSync(stagedApp, appPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not move staged app into place: ${msg}`);
    cleanupStaging();
    return;
  }

  // Staging dir is now empty (bundle was moved out); remove it.
  cleanupStaging();

  // 4. Read the real version from the extracted bundle's Info.plist.
  const installedVersion = readAppBundleVersion(appPath);

  if (installedVersion !== null) {
    // Pin the real version string.
    try {
      pinBarVersion(ccsDir, installedVersion);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[!] Could not write version pin: ${msg}`);
      // Non-fatal — continue.
    }
    console.log(`[OK] CCS Bar v${installedVersion} installed to ${appsDir}/${BAR_APP_NAME}`);
  } else {
    // Info.plist unreadable — best-effort remove any stale version pin from a previous install,
    // so `ccs bar version` does not show an outdated version string.
    try {
      fs.rmSync(path.join(ccsDir, 'bar', '.version'), { force: true });
    } catch {
      /* non-fatal — ignore */
    }
    // No pin written; ASCII notice; no crash.
    console.log(`[OK] CCS Bar installed to ${appsDir}/${BAR_APP_NAME}`);
    console.log('[!] Could not read app version from Info.plist.');
  }

  // 4b. Write launch.json so the Swift app can spawn the server without a shell PATH.
  //     Non-fatal — install has already succeeded at this point.
  try {
    const launchJsonPath = getLaunchJsonPath(ccsDir);
    const launchDescriptor = createBarLaunchDescriptor();
    writeLaunchDescriptor(launchJsonPath, launchDescriptor);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[!] Could not write launch.json: ${msg}`);
    // Non-fatal — continue to Gatekeeper note + launch handoff.
  }

  // 5. Capability handshake via GET /api/bar/summary.
  //    This server-side check is unrelated to Gatekeeper.
  //    Read bar.json for baseUrl if present; otherwise fall back to localhost:3000.
  const barJsonPath = path.join(ccsDir, 'bar.json');
  let baseUrl = 'http://127.0.0.1:3000';
  try {
    const raw = fs.readFileSync(barJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { baseUrl?: string };
    if (parsed.baseUrl) baseUrl = parsed.baseUrl;
  } catch {
    /* bar.json absent — use fallback */
  }

  try {
    const compat = await verifyCompat(baseUrl);
    if (compat.reason === 'ok') {
      console.log('[OK] Server bar API reachable.');
    } else if (compat.reason === 'no-bar-api') {
      console.log(
        '[!] CCS server does not serve the bar API (/api/bar/summary returned 404).' +
          ' Update CCS, then restart `ccs bar`.'
      );
    } else {
      // unreachable — soft-warn
      console.log('[!] Could not verify server compatibility (server may not be running).');
      console.log('[i] Run `ccs bar` to start the server and recheck.');
    }
  } catch {
    console.log('[!] Could not verify server compatibility (server may not be running).');
    console.log('[i] Run `ccs bar` to start the server and recheck.');
  }

  // 6. Gatekeeper handling: keep quarantine in place for downloaded apps.
  //    CCS Bar is installed from a floating release asset and is not verified by a
  //    pinned checksum/signature here, so do not strip macOS's quarantine marker.
  //    If Gatekeeper blocks first launch, the user can make an explicit manual
  //    trust decision outside the installer.
  console.log('[i] Gatekeeper note:');
  console.log('    macOS may verify this downloaded app on first launch.');
  console.log('    If macOS blocks it, right-click the app and select Open.');

  // 7. Launch handoff.
  //    Already-running check: if CCS Bar is running after a (re)install, skip the
  //    prompt entirely and print a restart hint (the user needs to quit and reopen
  //    to pick up the new version). --launch with the app already running still
  //    proceeds — the launch flow opens/activates the app, which is harmless.
  //
  //    --launch: skip prompt and launch immediately.
  //    --no-launch: skip prompt, print guidance.
  //    stdin-TTY: ask interactively (default yes).
  //    Non-TTY stdin: print guidance, no prompt.
  const barIsRunning = await isBarRunning();

  if (barIsRunning && !forceLaunch) {
    console.log(
      '[!] CCS Bar is currently running an older build. Quit it from the menu bar, then run `ccs bar` to relaunch the updated app.'
    );
  } else if (forceLaunch) {
    await launchBar([]);
  } else if (noLaunch) {
    console.log('[i] Run `ccs bar` to launch.');
  } else {
    const shouldLaunch = await promptLaunch();
    if (shouldLaunch) {
      await launchBar([]);
    } else {
      // User declined or non-TTY stdin — always print guidance so the user
      // knows how to start the app after install.
      console.log('[i] Run `ccs bar` to launch later.');
    }
  }
}
