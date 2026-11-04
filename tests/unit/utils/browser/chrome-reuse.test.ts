import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveConfiguredBrowserProfileDir,
  resolveBrowserRuntimeEnv,
  resolveDefaultChromeUserDataDir,
} from '../../../../src/utils/browser/chrome-reuse';

describe('chrome reuse resolver', () => {
  const originalHome = process.env.HOME;
  const originalLocalAppData = process.env.LOCALAPPDATA;
  const originalUserProfile = process.env.USERPROFILE;
  const originalBrowserUserDataDir = process.env.CCS_BROWSER_USER_DATA_DIR;
  const originalBrowserProfileDir = process.env.CCS_BROWSER_PROFILE_DIR;
  const originalBrowserDevtoolsPort = process.env.CCS_BROWSER_DEVTOOLS_PORT;
  const originalBrowserDevtoolsHost = process.env.CCS_BROWSER_DEVTOOLS_HOST;
  const originalBrowserDevtoolsHttpUrl = process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL;
  const originalBrowserDevtoolsWsUrl = process.env.CCS_BROWSER_DEVTOOLS_WS_URL;
  const originalBrowserEvalMode = process.env.CCS_BROWSER_EVAL_MODE;
  let tempDirs: string[] = [];
  let servers: Array<{ stop: () => void }> = [];

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  function writeDevToolsActivePort(profileDir: string, content: string): void {
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'DevToolsActivePort'), content, 'utf8');
  }

  async function startDevToolsServer(versionPayload: Record<string, unknown>) {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request: Request) {
        if (new URL(request.url).pathname === '/json/version') {
          return Response.json(versionPayload);
        }
        return new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    return server;
  }

  async function startFailingDevToolsServer(status: number, body = 'error') {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request: Request) {
        if (new URL(request.url).pathname === '/json/version') {
          return new Response(body, { status });
        }
        return new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    return server;
  }

  async function startMalformedJsonDevToolsServer() {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request: Request) {
        if (new URL(request.url).pathname === '/json/version') {
          return new Response('{invalid-json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    return server;
  }

  function reserveClosedPort(): number {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        return new Response('ok');
      },
    });
    const port = server.port;
    if (port === undefined) {
      server.stop();
      throw new Error('Failed to reserve a DevTools test port');
    }
    server.stop();
    return port;
  }

  beforeEach(() => {
    delete process.env.CCS_BROWSER_USER_DATA_DIR;
    delete process.env.CCS_BROWSER_PROFILE_DIR;
    delete process.env.CCS_BROWSER_DEVTOOLS_PORT;
    delete process.env.CCS_BROWSER_DEVTOOLS_HOST;
    delete process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL;
    delete process.env.CCS_BROWSER_DEVTOOLS_WS_URL;
    delete process.env.CCS_BROWSER_EVAL_MODE;
  });

  afterEach(() => {
    for (const server of servers) {
      server.stop();
    }
    servers = [];

    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];

    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }

    if (originalBrowserUserDataDir === undefined) {
      delete process.env.CCS_BROWSER_USER_DATA_DIR;
    } else {
      process.env.CCS_BROWSER_USER_DATA_DIR = originalBrowserUserDataDir;
    }

    if (originalBrowserProfileDir === undefined) {
      delete process.env.CCS_BROWSER_PROFILE_DIR;
    } else {
      process.env.CCS_BROWSER_PROFILE_DIR = originalBrowserProfileDir;
    }

    if (originalBrowserDevtoolsPort === undefined) {
      delete process.env.CCS_BROWSER_DEVTOOLS_PORT;
    } else {
      process.env.CCS_BROWSER_DEVTOOLS_PORT = originalBrowserDevtoolsPort;
    }

    if (originalBrowserDevtoolsHost === undefined) {
      delete process.env.CCS_BROWSER_DEVTOOLS_HOST;
    } else {
      process.env.CCS_BROWSER_DEVTOOLS_HOST = originalBrowserDevtoolsHost;
    }

    if (originalBrowserDevtoolsHttpUrl === undefined) {
      delete process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL;
    } else {
      process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL = originalBrowserDevtoolsHttpUrl;
    }

    if (originalBrowserDevtoolsWsUrl === undefined) {
      delete process.env.CCS_BROWSER_DEVTOOLS_WS_URL;
    } else {
      process.env.CCS_BROWSER_DEVTOOLS_WS_URL = originalBrowserDevtoolsWsUrl;
    }

    if (originalBrowserEvalMode === undefined) {
      delete process.env.CCS_BROWSER_EVAL_MODE;
    } else {
      process.env.CCS_BROWSER_EVAL_MODE = originalBrowserEvalMode;
    }
  });

  it('uses explicit profile-dir before the default path and resolves the websocket target', async () => {
    const explicitProfileDir = createTempDir('ccs-chrome-explicit-');
    const defaultProfileDir = createTempDir('ccs-chrome-default-');
    const server = await startDevToolsServer({
      Browser: 'Chrome/136.0.0.0',
      webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/target-1',
    });

    writeDevToolsActivePort(explicitProfileDir, `${server.port}\n/devtools/browser/from-explicit`);

    const runtimeEnv = await resolveBrowserRuntimeEnv({
      profileDir: explicitProfileDir,
    });

    expect(runtimeEnv).toEqual({
      CCS_BROWSER_USER_DATA_DIR: explicitProfileDir,
      CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
      CCS_BROWSER_DEVTOOLS_PORT: String(server.port),
      CCS_BROWSER_DEVTOOLS_HTTP_URL: `http://127.0.0.1:${server.port}`,
      CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/target-1',
    });
    expect(fs.existsSync(path.join(defaultProfileDir, 'DevToolsActivePort'))).toBe(false);
  });

  it('only enables browser reuse for an explicitly configured profile directory', () => {
    const isolatedHome = createTempDir('ccs-chrome-config-home-');
    const defaultProfileDir = path.join(
      isolatedHome,
      'Library',
      'Application Support',
      'Google',
      'Chrome'
    );
    writeDevToolsActivePort(defaultProfileDir, '9222\n/devtools/browser/stale-default');
    process.env.HOME = isolatedHome;
    process.env.USERPROFILE = isolatedHome;

    expect(resolveConfiguredBrowserProfileDir()).toBeUndefined();
    expect(resolveConfiguredBrowserProfileDir(defaultProfileDir)).toBe(defaultProfileDir);
  });

  it('uses an explicit devtools port override when metadata is missing', async () => {
    const profileDir = createTempDir('ccs-chrome-explicit-port-');
    const server = await startDevToolsServer({
      Browser: 'Chrome/136.0.0.0',
      webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/explicit-port',
    });

    const runtimeEnv = await resolveBrowserRuntimeEnv({
      profileDir,
      devtoolsPort: String(server.port),
    });

    expect(runtimeEnv.CCS_BROWSER_DEVTOOLS_PORT).toBe(String(server.port));
    expect(runtimeEnv.CCS_BROWSER_DEVTOOLS_WS_URL).toBe(
      'ws://127.0.0.1/devtools/browser/explicit-port'
    );
  });

  it('throws a clear error when DevToolsActivePort metadata is missing', async () => {
    const profileDir = createTempDir('ccs-chrome-missing-metadata-');

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome reuse metadata not found: ${path.join(profileDir, 'DevToolsActivePort')}`
    );
  });

  it('throws a clear error when DevToolsActivePort metadata is invalid', async () => {
    const profileDir = createTempDir('ccs-chrome-invalid-metadata-');
    writeDevToolsActivePort(profileDir, 'not-a-port\n/devtools/browser/target');

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome reuse metadata is invalid: ${path.join(profileDir, 'DevToolsActivePort')}`
    );
  });

  it('throws before launch fallback when the DevTools endpoint is stale or unreachable', async () => {
    const profileDir = createTempDir('ccs-chrome-unreachable-');
    const port = reserveClosedPort();
    writeDevToolsActivePort(profileDir, `${port}\n/devtools/browser/stale`);

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome DevTools endpoint is unreachable: http://127.0.0.1:${port}`
    );
  });

  it('throws a clear error when the DevTools endpoint is reachable without a websocket target', async () => {
    const profileDir = createTempDir('ccs-chrome-missing-ws-');
    const server = await startDevToolsServer({ Browser: 'Chrome/136.0.0.0' });
    writeDevToolsActivePort(profileDir, `${server.port}\n/devtools/browser/no-ws`);

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome DevTools endpoint did not provide a websocket target: http://127.0.0.1:${server.port}/json/version`
    );
  });

  it('throws a clear error when the DevTools endpoint returns a non-200 response', async () => {
    const profileDir = createTempDir('ccs-chrome-bad-status-');
    const server = await startFailingDevToolsServer(500);
    writeDevToolsActivePort(profileDir, `${server.port}\n/devtools/browser/bad-status`);

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome DevTools endpoint is unreachable: http://127.0.0.1:${server.port}`
    );
  });

  it('throws a clear error when the DevTools endpoint returns malformed JSON', async () => {
    const profileDir = createTempDir('ccs-chrome-bad-json-');
    const server = await startMalformedJsonDevToolsServer();
    writeDevToolsActivePort(profileDir, `${server.port}\n/devtools/browser/bad-json`);

    await expect(resolveBrowserRuntimeEnv({ profileDir })).rejects.toThrow(
      `Chrome DevTools endpoint is unreachable: http://127.0.0.1:${server.port}`
    );
  });

  it('resolves platform default Chrome user-data-dir paths', () => {
    const isolatedHome = createTempDir('ccs-chrome-home-');
    const env = {
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      LOCALAPPDATA: 'C:/Users/test/AppData/Local',
    };

    expect(resolveDefaultChromeUserDataDir('darwin', env)).toBe(
      path.join(isolatedHome, 'Library', 'Application Support', 'Google', 'Chrome')
    );
    expect(resolveDefaultChromeUserDataDir('linux', env)).toBe(
      path.join(isolatedHome, '.config', 'google-chrome')
    );
    expect(resolveDefaultChromeUserDataDir('win32', env)).toBe(
      path.normalize('C:/Users/test/AppData/Local/Google/Chrome/User Data')
    );
  });

  it('throws on win32 when LOCALAPPDATA is missing', () => {
    delete process.env.LOCALAPPDATA;

    expect(() => resolveDefaultChromeUserDataDir('win32')).toThrow(
      'LOCALAPPDATA is required to resolve the default Chrome user-data-dir on Windows'
    );
  });

  it('throws a clear error when the resolved profile directory does not exist', async () => {
    const missingProfileDir = path.join(
      createTempDir('ccs-chrome-missing-dir-'),
      'missing-profile'
    );

    await expect(resolveBrowserRuntimeEnv({ profileDir: missingProfileDir })).rejects.toThrow(
      `Chrome profile directory is invalid: ${missingProfileDir}`
    );
  });
});
