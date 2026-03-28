import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

describe('Codex settings bridge launch', () => {
  let tmpHome = '';
  let ccsDir = '';
  let settingsPath = '';
  let fakeCodexPath = '';
  let codexArgsLogPath = '';
  let codexEnvLogPath = '';
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-bridge-launch-'));
    ccsDir = path.join(tmpHome, '.ccs');
    settingsPath = path.join(ccsDir, 'codex-api.settings.json');
    fakeCodexPath = path.join(tmpHome, 'fake-codex.sh');
    codexArgsLogPath = path.join(tmpHome, 'codex-args.txt');
    codexEnvLogPath = path.join(tmpHome, 'codex-env.txt');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { 'codex-api': settingsPath } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
            ANTHROPIC_AUTH_TOKEN: 'bridge-token',
            ANTHROPIC_MODEL: 'gpt-5.3-codex',
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      fakeCodexPath,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.118.0-alpha.3"
  exit 0
fi

if [ "$1" = "--help" ]; then
  cat <<'EOF'
Codex CLI
  -c, --config <key=value>
EOF
  exit 0
fi

printf "%s\\n" "$@" > "${codexArgsLogPath}"
printf "%s" "$CCS_CODEX_API_KEY" > "${codexEnvLogPath}"
exit 0
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeCodexPath, 0o755);

    baseEnv = {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_DEBUG: '1',
    };
  });

  afterEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('launches Codex bridge settings profiles and injects runtime overrides', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['codex-api', '--target', 'codex', '--effort', 'high', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('does not support this profile');

    const argsLog = fs.readFileSync(codexArgsLogPath, 'utf8');
    expect(argsLog).toContain('model_provider="ccs_runtime"');
    expect(argsLog).toContain('model_providers.ccs_runtime.base_url="http://127.0.0.1:8317/api/provider/codex"');
    expect(argsLog).toContain('model_reasoning_effort="high"');
    expect(argsLog).toContain('smoke');
    expect(fs.readFileSync(codexEnvLogPath, 'utf8')).toBe('bridge-token');
  });

  it('rejects native Codex profile flags when CCS manages the bridge runtime', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['codex-api', '--target', 'codex', '--profile', 'other', 'smoke'], baseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not allow --profile/-p');
    expect(fs.existsSync(codexArgsLogPath)).toBe(false);
  });
});
