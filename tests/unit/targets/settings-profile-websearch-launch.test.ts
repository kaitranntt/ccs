import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const STEERING_PROMPT_SNIPPET =
  'prefer the CCS MCP tool WebSearch instead of Bash/curl/http fetches';

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
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readTraceEvents(tracePath: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(tracePath, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('settings profile WebSearch launch', () => {
  let tmpHome = '';
  let ccsDir = '';
  let settingsPath = '';
  let fakeClaudePath = '';
  let claudeArgsLogPath = '';
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-websearch-launch-'));
    ccsDir = path.join(tmpHome, '.ccs');
    settingsPath = path.join(ccsDir, 'glm.settings.json');
    fakeClaudePath = path.join(tmpHome, 'fake-claude.sh');
    claudeArgsLogPath = path.join(tmpHome, 'claude-args.txt');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { glm: settingsPath } }, null, 2) + '\n'
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
  });

  afterEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('continues without local WebSearch when the tool runtime cannot be prepared', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(path.join(ccsDir, 'hooks'), 'not-a-directory', 'utf8');

    const result = runCcs(['glm', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('could not prepare the local WebSearch tool');
    expect(result.stderr).toContain('This session will continue without local WebSearch');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(true);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).toContain('--disallowedTools');
    expect(launchedArgs).toContain('WebSearch');
    expect(launchedArgs).toContain('--append-system-prompt');
    expect(launchedArgs).toContain(STEERING_PROMPT_SNIPPET);
  });

  it('continues delegated headless launch when the local WebSearch tool runtime cannot be prepared', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(path.join(ccsDir, 'hooks'), 'not-a-directory', 'utf8');

    const result = runCcs(['glm', '-p', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('could not prepare the local WebSearch tool');
    expect(result.stderr).toContain('This session will continue without local WebSearch');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(true);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).toContain('--disallowedTools');
    expect(launchedArgs).toContain('WebSearch');
    expect(launchedArgs).toContain('--append-system-prompt');
    expect(launchedArgs).toContain(STEERING_PROMPT_SNIPPET);
  });

  it('keeps launch non-fatal when WebSearch is disabled', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      'version: 12\nwebsearch:\n  enabled: false\n',
      'utf8'
    );
    fs.writeFileSync(path.join(ccsDir, 'hooks'), 'not-a-directory', 'utf8');

    const result = runCcs(['glm', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('could not prepare the local WebSearch tool');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(true);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).toContain('--disallowedTools');
    expect(launchedArgs).toContain('WebSearch');
    expect(launchedArgs).toContain('--append-system-prompt');
    expect(launchedArgs).toContain(STEERING_PROMPT_SNIPPET);
  });

  it('writes a source-side launch trace for settings profiles when tracing is enabled', () => {
    if (process.platform === 'win32') return;

    const tracePath = path.join(ccsDir, 'logs', 'websearch-trace.jsonl');
    const result = runCcs(['glm', 'smoke'], {
      ...baseEnv,
      CCS_WEBSEARCH_TRACE: '1',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(tracePath)).toBe(true);

    const traceEvents = readTraceEvents(tracePath);
    const launchEvent = traceEvents.find((event) => event.event === 'ccs_websearch_launch') as
      | {
          launcher?: string;
          nativeWebSearchDisallowed?: boolean;
          steeringPromptApplied?: boolean;
          settingsPath?: string;
        }
      | undefined;

    expect(launchEvent?.launcher).toBe('ccs.settings-profile');
    expect(launchEvent?.nativeWebSearchDisallowed).toBe(true);
    expect(launchEvent?.steeringPromptApplied).toBe(true);
    expect(launchEvent?.settingsPath).toBe(settingsPath);
  });
});
