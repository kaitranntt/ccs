import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { request as httpRequest } from 'http';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';
import { stopOpenAICompatProxy } from '../../../src/proxy/proxy-daemon';

const BROWSER_PROMPT_SNIPPET = 'prefer the CCS MCP Browser tool';
setDefaultTimeout(30000);

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCcs(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const ccsEntry = path.join(process.cwd(), 'src', 'ccs.ts');
  const result = spawnSync(process.execPath, [ccsEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 8000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readLaunchedArgs(argsLogPath: string): string[] {
  return fs
    .readFileSync(argsLogPath, 'utf8')
    .split('\n')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

function reserveClosedPort(): number {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response('ok');
    },
  });
  const { port } = server;
  server.stop(true);
  return port;
}

async function waitForDevtoolsVersionEndpoint(port: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port: Number.parseInt(port, 10),
            path: '/json/version',
            method: 'GET',
          },
          (res) => {
            res.resume();
            if (res.statusCode === 200) {
              resolve();
              return;
            }
            reject(new Error(`Unexpected status: ${res.statusCode ?? 'unknown'}`));
          }
        );
        req.on('error', reject);
        req.end();
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw new Error('Timed out waiting for mock DevTools endpoint to become ready');
}

describe('settings profile browser launch', () => {
  let tmpHome = '';
  let ccsDir = '';
  let settingsPath = '';
  let fakeClaudePath = '';
  let claudeArgsLogPath = '';
  let claudeEnvLogPath = '';
  let claudeSettingsPathLogPath = '';
  let claudeSettingsSnapshotPath = '';
  let browserProfileDir = '';
  let devtoolsServer: ChildProcess | undefined;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-launch-'));
    ccsDir = path.join(tmpHome, '.ccs');
    settingsPath = path.join(ccsDir, 'glm.settings.json');
    fakeClaudePath = path.join(tmpHome, 'fake-claude.sh');
    claudeArgsLogPath = path.join(tmpHome, 'claude-args.txt');
    claudeEnvLogPath = path.join(tmpHome, 'claude-env.txt');
    claudeSettingsPathLogPath = path.join(tmpHome, 'claude-settings-path.txt');
    claudeSettingsSnapshotPath = path.join(tmpHome, 'claude-settings-snapshot.json');
    browserProfileDir = path.join(tmpHome, 'chrome-user-data');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { glm: settingsPath } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 12', 'websearch:', '  enabled: false', 'image_analysis:', '  enabled: false', ''].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'token',
            ANTHROPIC_MODEL: 'glm-5',
          },
        },
        null,
        2
      ) + '\n'
    );

    fs.writeFileSync(
      fakeClaudePath,
      `#!/bin/sh
printf "%s\n" "$@" > "${claudeArgsLogPath}"
settings_path=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--settings" ]; then
    settings_path="$arg"
    break
  fi
  prev="$arg"
done
printf "%s" "$settings_path" > "${claudeSettingsPathLogPath}"
if [ -n "$settings_path" ] && [ -f "$settings_path" ]; then
  cat "$settings_path" > "${claudeSettingsSnapshotPath}"
fi
{
  printf "userDataDir=%s\n" "$CCS_BROWSER_USER_DATA_DIR"
  printf "legacyProfileDir=%s\n" "$CCS_BROWSER_PROFILE_DIR"
  printf "host=%s\n" "$CCS_BROWSER_DEVTOOLS_HOST"
  printf "port=%s\n" "$CCS_BROWSER_DEVTOOLS_PORT"
  printf "httpUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_HTTP_URL"
  printf "wsUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_WS_URL"
  printf "stripAnthropic=%s\n" "$CCS_STRIP_INHERITED_ANTHROPIC_ENV"
  printf "anthropicBaseUrl=%s\n" "$ANTHROPIC_BASE_URL"
  printf "anthropicAuthToken=%s\n" "$ANTHROPIC_AUTH_TOKEN"
  printf "anthropicApiKey=%s\n" "$ANTHROPIC_API_KEY"
  printf "anthropicApiKeySet=%s\n" "\${ANTHROPIC_API_KEY+x}"
  printf "anthropicModel=%s\n" "$ANTHROPIC_MODEL"
  printf "anthropicSonnet=%s\n" "$ANTHROPIC_DEFAULT_SONNET_MODEL"
  printf "maxOutputTokens=%s\n" "$CLAUDE_CODE_MAX_OUTPUT_TOKENS"
} > "${claudeEnvLogPath}"
exit 0
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeClaudePath, 0o755);

    baseEnv = {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CLAUDE_PATH: fakeClaudePath,
      CCS_DEBUG: '1',
      CCS_BROWSER_USER_DATA_DIR: '',
      CCS_BROWSER_PROFILE_DIR: '',
      CCS_BROWSER_DEVTOOLS_HOST: '',
      CCS_BROWSER_DEVTOOLS_PORT: '',
      CCS_BROWSER_DEVTOOLS_HTTP_URL: '',
      CCS_BROWSER_DEVTOOLS_WS_URL: '',
      CCS_BROWSER_EVAL_MODE: '',
    };
  });

  afterEach(async () => {
    if (devtoolsServer) {
      devtoolsServer.kill();
      devtoolsServer = undefined;
    }
    if (process.platform === 'win32') {
      return;
    }

    await stopOpenAICompatProxy();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('does not block settings-profile launches when browser reuse cannot resolve DevToolsActivePort and the lane stays default-off', () => {
    if (process.platform === 'win32') return;

    fs.mkdirSync(browserProfileDir, { recursive: true });

    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_PROFILE_DIR: browserProfileDir,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('DevToolsActivePort');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(true);
  });

  it('passes selective Anthropic env stripping to settings-profile Claude launches while preserving model defaults', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'profile-token',
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_MODEL: 'gpt-5.4',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '12345',
          },
        },
        null,
        2
      ) + '\n'
    );

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.global_env = {
          enabled: true,
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:9999/api/provider/global',
            ANTHROPIC_AUTH_TOKEN: 'global-routing-token',
            ANTHROPIC_API_KEY: 'global-api-key',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '54321',
          },
        };
      });

      const result = runCcs(['glm', 'smoke'], {
        ...baseEnv,
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        ANTHROPIC_AUTH_TOKEN: 'parent-routing-token',
        ANTHROPIC_API_KEY: 'parent-api-key',
        ANTHROPIC_MODEL: 'gpt-5.4',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
      });

      expect(result.status).toBe(0);
      const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
      expect(launchedEnv).toContain('stripAnthropic=1');
      expect(launchedEnv).toContain('anthropicBaseUrl=https://api.z.ai/api/anthropic');
      expect(launchedEnv).toContain('anthropicAuthToken=profile-token');
      expect(launchedEnv).toContain('anthropicApiKey=');
      expect(launchedEnv).toContain('anthropicApiKeySet=x');
      expect(launchedEnv).not.toContain('global-routing-token');
      expect(launchedEnv).not.toContain('parent-routing-token');
      expect(launchedEnv).not.toContain('global-api-key');
      expect(launchedEnv).not.toContain('parent-api-key');
      expect(launchedEnv).toContain('anthropicModel=gpt-5.4');
      expect(launchedEnv).toContain('anthropicSonnet=gpt-5.4');
      expect(launchedEnv).toContain('maxOutputTokens=12345');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('passes a sanitized settings copy for local OpenAI-compatible proxy launches', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
            ANTHROPIC_AUTH_TOKEN: 'profile-token',
            ANTHROPIC_API_KEY: 'profile-api-key',
            ANTHROPIC_MODEL: 'gpt-5.4',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '12345',
          },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Read',
                hooks: [{ type: 'command', command: 'echo keep-profile-settings' }],
              },
            ],
          },
        },
        null,
        2
      ) + '\n'
    );

    const result = runCcs(['glm', 'smoke'], baseEnv);

    expect(result.status).toBe(0);

    const launchedArgs = readLaunchedArgs(claudeArgsLogPath);
    const settingsIndex = launchedArgs.indexOf('--settings');
    expect(settingsIndex).toBeGreaterThanOrEqual(0);

    const launchSettingsPath = launchedArgs[settingsIndex + 1];
    expect(launchSettingsPath).toBeDefined();
    expect(launchSettingsPath).not.toBe(settingsPath);

    const persistedLaunchSettings = JSON.parse(
      fs.readFileSync(claudeSettingsSnapshotPath, 'utf8')
    ) as {
      env?: Record<string, string>;
      hooks?: {
        PreToolUse?: Array<{
          matcher?: string;
          hooks?: Array<{ command?: string }>;
        }>;
      };
    };

    expect(persistedLaunchSettings.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persistedLaunchSettings.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(persistedLaunchSettings.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(persistedLaunchSettings.env?.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(
      persistedLaunchSettings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command
    ).toBe('echo keep-profile-settings');

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).toContain('stripAnthropic=');
    expect(launchedEnv).toContain('anthropicBaseUrl=http://127.0.0.1:');
    expect(launchedEnv).not.toContain('anthropicBaseUrl=https://api.openai.com/v1');
    expect(launchedEnv).toContain('anthropicModel=gpt-5.4');
    expect(launchedEnv).toContain('maxOutputTokens=12345');
    expect(fs.readFileSync(claudeSettingsPathLogPath, 'utf8')).toBe(launchSettingsPath);
    expect(fs.existsSync(launchSettingsPath as string)).toBe(false);
  });

  it('does not auto-enable browser reuse for settings-profile launches from env overrides alone', async () => {
    if (process.platform === 'win32') return;

    const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server.js');
    const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port.txt');
    fs.writeFileSync(
      mockServerScriptPath,
      `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/browser-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
      'utf8'
    );

    devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
      stdio: 'ignore',
      env: baseEnv,
    });

    const startDeadline = Date.now() + 5000;
    while (!fs.existsSync(mockServerPortPath)) {
      if (Date.now() > startDeadline) {
        throw new Error('Timed out waiting for mock DevTools server to start');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const port = fs.readFileSync(mockServerPortPath, 'utf8').trim();
    await waitForDevtoolsVersionEndpoint(port);

    fs.mkdirSync(browserProfileDir, { recursive: true });
    fs.writeFileSync(
      path.join(browserProfileDir, 'DevToolsActivePort'),
      `${port}\n/devtools/browser/browser-target`,
      'utf8'
    );

    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_PROFILE_DIR: browserProfileDir,
    });

    expect(result.stderr).not.toContain('Browser MCP is enabled, but CCS could not prepare the local browser tool.');
    expect(result.stderr).not.toContain('could not sync the browser MCP config');
    expect(result.stderr).not.toContain('Chrome reuse metadata not found');
    expect(result.status).toBe(0);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain(`userDataDir=${browserProfileDir}`);
    expect(launchedEnv).not.toContain(`port=${port}`);
    expect(launchedEnv).not.toContain(`httpUrl=http://127.0.0.1:${port}`);
    expect(launchedEnv).not.toContain('wsUrl=ws://127.0.0.1/devtools/browser/browser-target');
  });

  it('scrubs inherited CCS_BROWSER_* env from browser-off settings-profile launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_USER_DATA_DIR: '/tmp/stale-settings-browser-runtime',
      CCS_BROWSER_PROFILE_DIR: '/tmp/stale-settings-browser-legacy',
      CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
      CCS_BROWSER_DEVTOOLS_PORT: '9666',
      CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9666',
      CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/stale-settings-env',
    });

    expect(result.status).toBe(0);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain('/tmp/stale-settings-browser-runtime');
    expect(launchedEnv).not.toContain('/tmp/stale-settings-browser-legacy');
    expect(launchedEnv).not.toContain('9666');
    expect(launchedEnv).not.toContain('stale-settings-env');
  });

  it('scrubs CCS_BROWSER_* values embedded in settings-profile env when browser is off', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'token',
            ANTHROPIC_MODEL: 'glm-5',
            CCS_BROWSER_USER_DATA_DIR: '/tmp/settings-browser-runtime',
            CCS_BROWSER_PROFILE_DIR: '/tmp/settings-browser-legacy',
            CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/settings-env',
          },
        },
        null,
        2
      ) + '\n'
    );

    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
    });

    expect(result.status).toBe(0);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain('/tmp/settings-browser-runtime');
    expect(launchedEnv).not.toContain('/tmp/settings-browser-legacy');
    expect(launchedEnv).not.toContain('settings-env');
  });

  it('skips managed browser attach for settings-profile launches when the default CCS browser profile directory is missing', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: 43123,
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['glm', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Claude Browser Attach is not ready yet.');
      expect(result.stderr).toContain('ccs browser setup');
      expect(result.stderr).toContain('Diagnose only: `ccs browser doctor`.');
      expect(result.stderr).toContain('continue without browser tools');
      expect(fs.existsSync(path.join(tmpHome, '.ccs', 'browser', 'chrome-user-data'))).toBe(true);

      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

      const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
      expect(launchedEnv).toContain('userDataDir=');
      expect(launchedEnv).not.toContain('.ccs/browser/chrome-user-data');
      expect(launchedEnv).not.toContain('ws://127.0.0.1/devtools/browser/');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('skips managed browser attach for settings-profile launches when no managed browser session is running', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      const unreachablePort = reserveClosedPort();
      fs.mkdirSync(path.join(tmpHome, '.ccs', 'browser', 'chrome-user-data'), {
        recursive: true,
      });

      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: unreachablePort,
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['glm', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);

      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('uses config-backed browser attach settings for settings-profile launches', async () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server.js');
      const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port.txt');
      fs.writeFileSync(
        mockServerScriptPath,
        `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/config-settings-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
        'utf8'
      );

      devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
        stdio: 'ignore',
        env: baseEnv,
      });

      const startDeadline = Date.now() + 5000;
      while (!fs.existsSync(mockServerPortPath)) {
        if (Date.now() > startDeadline) {
          throw new Error('Timed out waiting for mock DevTools server to start');
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const port = fs.readFileSync(mockServerPortPath, 'utf8').trim();
      await waitForDevtoolsVersionEndpoint(port);

      fs.mkdirSync(browserProfileDir, { recursive: true });
      fs.writeFileSync(
        path.join(browserProfileDir, 'DevToolsActivePort'),
        `${port}\n/devtools/browser/config-settings-target`,
        'utf8'
      );

      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: browserProfileDir,
            devtools_port: Number.parseInt(port, 10),
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['glm', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);
      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).toContain(BROWSER_PROMPT_SNIPPET);

      const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
      expect(launchedEnv).toContain(`userDataDir=${browserProfileDir}`);
      expect(launchedEnv).toContain(`port=${port}`);
      expect(launchedEnv).toContain('wsUrl=ws://127.0.0.1/devtools/browser/config-settings-target');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('keeps settings-profile Claude attach hidden under manual policy until --browser is passed', async () => {
    if (process.platform === 'win32') return;

    const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server-manual-settings.js');
    const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port-manual-settings.txt');
    fs.writeFileSync(
      mockServerScriptPath,
      `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/manual-settings-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
      'utf8'
    );

    devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
      stdio: 'ignore',
      env: baseEnv,
    });

    const startDeadline = Date.now() + 5000;
    while (!fs.existsSync(mockServerPortPath)) {
      if (Date.now() > startDeadline) {
        throw new Error('Timed out waiting for mock DevTools server to start');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const port = fs.readFileSync(mockServerPortPath, 'utf8').trim();
    await waitForDevtoolsVersionEndpoint(port);

    fs.mkdirSync(browserProfileDir, { recursive: true });
    fs.writeFileSync(
      path.join(browserProfileDir, 'DevToolsActivePort'),
      `${port}\n/devtools/browser/manual-settings-target`,
      'utf8'
    );

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'manual',
            user_data_dir: browserProfileDir,
            devtools_port: Number.parseInt(port, 10),
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const hiddenResult = runCcs(['glm', 'smoke'], {
        ...baseEnv,
      });
      expect(hiddenResult.status).toBe(0);
      expect(fs.readFileSync(claudeArgsLogPath, 'utf8')).not.toContain(BROWSER_PROMPT_SNIPPET);
      expect(fs.readFileSync(claudeEnvLogPath, 'utf8')).not.toContain(browserProfileDir);

      const forcedResult = runCcs(['glm', '--browser', 'smoke'], {
        ...baseEnv,
      });
      expect(forcedResult.status).toBe(0);
      expect(fs.readFileSync(claudeArgsLogPath, 'utf8')).toContain(BROWSER_PROMPT_SNIPPET);
      expect(fs.readFileSync(claudeEnvLogPath, 'utf8')).toContain(browserProfileDir);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });
});
