import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';

const BROWSER_PROMPT_SNIPPET = 'prefer the CCS MCP Browser tool';

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

describe('settings profile browser launch', () => {
  let tmpHome = '';
  let ccsDir = '';
  let settingsPath = '';
  let fakeClaudePath = '';
  let claudeArgsLogPath = '';
  let claudeEnvLogPath = '';
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
{
  printf "userDataDir=%s\n" "$CCS_BROWSER_USER_DATA_DIR"
  printf "host=%s\n" "$CCS_BROWSER_DEVTOOLS_HOST"
  printf "port=%s\n" "$CCS_BROWSER_DEVTOOLS_PORT"
  printf "httpUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_HTTP_URL"
  printf "wsUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_WS_URL"
  printf "evalMode=%s\n" "$CCS_BROWSER_EVAL_MODE"
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
    };
    delete baseEnv.CCS_BROWSER_USER_DATA_DIR;
    delete baseEnv.CCS_BROWSER_PROFILE_DIR;
    delete baseEnv.CCS_BROWSER_DEVTOOLS_PORT;
    delete baseEnv.CCS_BROWSER_DEVTOOLS_HOST;
    delete baseEnv.CCS_BROWSER_DEVTOOLS_HTTP_URL;
    delete baseEnv.CCS_BROWSER_DEVTOOLS_WS_URL;
    delete baseEnv.CCS_BROWSER_EVAL_MODE;
  });

  afterEach(() => {
    if (devtoolsServer) {
      devtoolsServer.kill();
      devtoolsServer = undefined;
    }
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('fails before Claude launch when browser reuse cannot resolve DevToolsActivePort', () => {
    if (process.platform === 'win32') return;

    fs.mkdirSync(browserProfileDir, { recursive: true });

    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_PROFILE_DIR: browserProfileDir,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DevToolsActivePort');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(false);
  });

  it('passes browser reuse env and steering prompt into the Claude launch', async () => {
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
    expect(launchedArgs).toContain('--append-system-prompt');
    expect(launchedArgs).toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).toContain(`userDataDir=${browserProfileDir}`);
    expect(launchedEnv).toContain(`port=${port}`);
    expect(launchedEnv).toContain(`httpUrl=http://127.0.0.1:${port}`);
    expect(launchedEnv).toContain('wsUrl=ws://127.0.0.1/devtools/browser/browser-target');
    expect(launchedEnv).toContain('evalMode=readonly');
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
            user_data_dir: '',
            devtools_port: 9222,
          },
          codex: {
            enabled: true,
          },
        };
      });

      const result = runCcs(['glm', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Launching without browser tools');
      expect(result.stderr).toContain('ccs browser doctor');

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
            user_data_dir: browserProfileDir,
            devtools_port: Number.parseInt(port, 10),
            eval_mode: 'disabled',
          },
          codex: {
            enabled: true,
            eval_mode: 'readonly',
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
      expect(launchedEnv).toContain('evalMode=disabled');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });
});
