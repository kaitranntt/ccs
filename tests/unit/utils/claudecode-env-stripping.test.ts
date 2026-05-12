import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type SpawnCall = {
  command: string;
  args: string[];
  options: Record<string, unknown> | undefined;
};

type SpawnSyncCall = {
  command: string;
  args: string[];
  options: Record<string, unknown> | undefined;
};

const STEERING_PROMPT_SNIPPET =
  'prefer the CCS MCP tool WebSearch instead of Bash/curl/http fetches';
const spawnCalls: SpawnCall[] = [];
const spawnSyncCalls: SpawnSyncCall[] = [];
const launchSettingsSnapshots: Array<{ path: string; content: string }> = [];
const originalPlatform = process.platform;
let baselineSigintListeners: Array<(...args: unknown[]) => void> = [];
let baselineSigtermListeners: Array<(...args: unknown[]) => void> = [];
let baselineSighupListeners: Array<(...args: unknown[]) => void> = [];
let originalCcsHome: string | undefined;
let originalCcsClaudePath: string | undefined;
let originalDisableAutoUpdater: string | undefined;
let originalClaudeConfigDir: string | undefined;
let originalTmux: string | undefined;
const realSpawn = childProcess.spawn.bind(childProcess);
const realSpawnSync = childProcess.spawnSync.bind(childProcess);
const realExecSync = childProcess.execSync.bind(childProcess);

function createMockChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  killed: boolean;
  pid: number;
  unref: () => EventEmitter;
  kill: () => boolean;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    killed: boolean;
    pid: number;
    unref: () => EventEmitter;
    kill: () => boolean;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.pid = process.pid;
  child.unref = () => child;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 1;
    return true;
  };

  return child;
}

function shouldMockCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return normalized.includes('claude');
}

function registerChildProcessMock(): void {
  mock.module('child_process', () => ({
    ...childProcess,
    spawn: (...spawnArgs: unknown[]) => {
      const command = String(spawnArgs[0] ?? '');
      const maybeArgs = spawnArgs[1];
      const args = Array.isArray(maybeArgs) ? (maybeArgs as string[]) : [];
      const options = (Array.isArray(maybeArgs) ? spawnArgs[2] : spawnArgs[1]) as
        | Record<string, unknown>
        | undefined;

      if (!shouldMockCommand(command)) {
        return realSpawn(command, args, options as Parameters<typeof childProcess.spawn>[2]);
      }

      spawnCalls.push({ command, args, options });
      const settingsIndex = args.indexOf('--settings');
      if (settingsIndex >= 0) {
        const settingsPath = args[settingsIndex + 1];
        if (settingsPath && fs.existsSync(settingsPath)) {
          launchSettingsSnapshots.push({
            path: settingsPath,
            content: fs.readFileSync(settingsPath, 'utf8'),
          });
        }
      }

      const child = createMockChild();
      setTimeout(() => child.emit('close', 0), 0);
      return child;
    },
    spawnSync: (...spawnArgs: unknown[]) => {
      const command = String(spawnArgs[0] ?? '');
      const maybeArgs = spawnArgs[1];
      const args = Array.isArray(maybeArgs) ? (maybeArgs as string[]) : [];
      const options = (Array.isArray(maybeArgs) ? spawnArgs[2] : spawnArgs[1]) as
        | Record<string, unknown>
        | undefined;

      if (command === 'tmux') {
        spawnSyncCalls.push({ command, args, options });
        return {
          pid: process.pid,
          output: ['', '', ''],
          stdout: '',
          stderr: '',
          status: 0,
          signal: null,
        };
      }

      return realSpawnSync(command, args, options as Parameters<typeof childProcess.spawnSync>[2]);
    },
    execSync: (...execArgs: unknown[]) =>
      realExecSync(
        execArgs[0] as Parameters<typeof childProcess.execSync>[0],
        execArgs[1] as Parameters<typeof childProcess.execSync>[1]
      ),
  }));
}

function writeConfigWithAutoUpdatePreference(enabled: boolean): void {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-update-pref-'));
  process.env.CCS_HOME = tempHome;
  const ccsDir = path.join(tempHome, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  const yaml = `version: 8
preferences:
  auto_update: ${enabled ? 'true' : 'false'}
`;
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), yaml, 'utf8');
}

function writeConfigWithWebSearchSettings(yamlBody: string): void {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-websearch-env-'));
  process.env.CCS_HOME = tempHome;
  const ccsDir = path.join(tempHome, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  const yaml = `version: 8
preferences:
  auto_update: true
websearch:
${yamlBody}
`;
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), yaml, 'utf8');
}

let execClaude: typeof import('../../../src/utils/shell-executor').execClaude;
let stripAnthropicRoutingEnv: typeof import('../../../src/utils/shell-executor').stripAnthropicRoutingEnv;
let stripClaudeCodeEnv: typeof import('../../../src/utils/shell-executor').stripClaudeCodeEnv;
let HeadlessExecutor: typeof import('../../../src/delegation/headless-executor').HeadlessExecutor;
let SharedManager: typeof import('../../../src/management/shared-manager').default;
let stopOpenAICompatProxy: typeof import('../../../src/proxy/proxy-daemon').stopOpenAICompatProxy;

beforeAll(async () => {
  registerChildProcessMock();

  const shellExecutor = await import('../../../src/utils/shell-executor');
  execClaude = shellExecutor.execClaude;
  stripAnthropicRoutingEnv = shellExecutor.stripAnthropicRoutingEnv;
  stripClaudeCodeEnv = shellExecutor.stripClaudeCodeEnv;

  const sharedManagerModule = await import('../../../src/management/shared-manager');
  SharedManager = sharedManagerModule.default;

  const headless = await import('../../../src/delegation/headless-executor');
  HeadlessExecutor = headless.HeadlessExecutor;

  const proxyDaemon = await import('../../../src/proxy/proxy-daemon');
  stopOpenAICompatProxy = proxyDaemon.stopOpenAICompatProxy;
});

afterAll(() => {
  mock.restore();
});

describe('CLAUDECODE environment stripping', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    spawnSyncCalls.length = 0;
    launchSettingsSnapshots.length = 0;
    process.env.CCS_QUIET = '1';

    // Save original env values for restoration in afterEach
    originalCcsHome = process.env.CCS_HOME;
    originalCcsClaudePath = process.env.CCS_CLAUDE_PATH;
    originalDisableAutoUpdater = process.env.DISABLE_AUTOUPDATER;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    originalTmux = process.env.TMUX;

    // Clear CCS-managed env vars that leak from host sessions
    delete process.env.DISABLE_AUTOUPDATER;
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.TMUX;

    baselineSigintListeners = process.listeners('SIGINT');
    baselineSigtermListeners = process.listeners('SIGTERM');
    baselineSighupListeners = process.listeners('SIGHUP');
  });

  afterEach(async () => {
    const tempCcsHome = process.env.CCS_HOME?.startsWith(os.tmpdir())
      ? process.env.CCS_HOME
      : undefined;
    if (tempCcsHome) {
      await stopOpenAICompatProxy();
    }

    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env.CLAUDECODE;
    delete process.env.claudecode;
    delete process.env.CCS_QUIET;
    delete process.env.CCS_WEBSEARCH_TRACE;
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsClaudePath !== undefined) process.env.CCS_CLAUDE_PATH = originalCcsClaudePath;
    else delete process.env.CCS_CLAUDE_PATH;
    if (originalDisableAutoUpdater !== undefined) {
      process.env.DISABLE_AUTOUPDATER = originalDisableAutoUpdater;
    } else {
      delete process.env.DISABLE_AUTOUPDATER;
    }
    if (originalClaudeConfigDir !== undefined)
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    else delete process.env.CLAUDE_CONFIG_DIR;
    if (originalTmux !== undefined) process.env.TMUX = originalTmux;
    else delete process.env.TMUX;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    delete process.env.ANTHROPIC_SMALL_FAST_MODEL;
    delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

    for (const listener of process.listeners('SIGINT')) {
      if (!baselineSigintListeners.includes(listener)) {
        process.removeListener('SIGINT', listener as (...args: unknown[]) => void);
      }
    }
    for (const listener of process.listeners('SIGTERM')) {
      if (!baselineSigtermListeners.includes(listener)) {
        process.removeListener('SIGTERM', listener as (...args: unknown[]) => void);
      }
    }
    for (const listener of process.listeners('SIGHUP')) {
      if (!baselineSighupListeners.includes(listener)) {
        process.removeListener('SIGHUP', listener as (...args: unknown[]) => void);
      }
    }

    if (tempCcsHome) {
      fs.rmSync(tempCcsHome, { recursive: true, force: true });
    }
  });

  it('stripClaudeCodeEnv removes CLAUDECODE case-insensitively', () => {
    const input: NodeJS.ProcessEnv = {
      CLAUDECODE: 'upper',
      claudecode: 'lower',
      ClAuDeCoDe: 'mixed',
      PATH: '/usr/bin',
    };

    const result = stripClaudeCodeEnv(input);
    expect(Object.keys(result).map((k) => k.toUpperCase())).not.toContain('CLAUDECODE');
    expect(result.PATH).toBe('/usr/bin');
  });

  it('stripAnthropicRoutingEnv preserves routing/auth keys from preserveFrom on the non-proxy settings path', () => {
    const settingsEnv: NodeJS.ProcessEnv = {
      ANTHROPIC_BASE_URL: 'https://ollama.com',
      ANTHROPIC_AUTH_TOKEN: 'profile-token',
      ANTHROPIC_API_KEY: 'profile-api-key',
      ANTHROPIC_MODEL: 'minimax-m2.7:cloud',
      OTHER: 'keep',
    };
    const globalEnv: NodeJS.ProcessEnv = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9999',
      ANTHROPIC_AUTH_TOKEN: 'global-stale',
    };

    const merged = stripAnthropicRoutingEnv({ ...globalEnv, ...settingsEnv }, settingsEnv);

    expect(merged.ANTHROPIC_BASE_URL).toBe('https://ollama.com');
    expect(merged.ANTHROPIC_AUTH_TOKEN).toBe('profile-token');
    expect(merged.ANTHROPIC_API_KEY).toBe('profile-api-key');
    expect(merged.ANTHROPIC_MODEL).toBe('minimax-m2.7:cloud');
    expect(merged.OTHER).toBe('keep');
  });

  it('stripAnthropicRoutingEnv with empty preserveFrom strips all routing keys', () => {
    const result = stripAnthropicRoutingEnv(
      {
        ANTHROPIC_BASE_URL: 'http://inherited',
        ANTHROPIC_AUTH_TOKEN: 'inherited-token',
        ANTHROPIC_MODEL: 'claude-opus-4-7',
      },
      { ANTHROPIC_MODEL: 'claude-opus-4-7' }
    );
    expect(result.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(result.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(result.ANTHROPIC_MODEL).toBe('claude-opus-4-7');
  });

  it('stripAnthropicRoutingEnv preserveFrom only emits keys present in preserveFrom', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://inherited',
      ANTHROPIC_AUTH_TOKEN: 'inherited-token',
    };
    expect(stripAnthropicRoutingEnv(env, { ANTHROPIC_BASE_URL: 'https://ollama.com' })).toEqual({
      ANTHROPIC_BASE_URL: 'https://ollama.com',
    });
    expect(stripAnthropicRoutingEnv(env, { ANTHROPIC_AUTH_TOKEN: 'profile-token' })).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'profile-token',
    });
    expect(stripAnthropicRoutingEnv(env, { ANTHROPIC_API_KEY: 'profile-api-key' })).toEqual({
      ANTHROPIC_API_KEY: 'profile-api-key',
    });
    expect(stripAnthropicRoutingEnv(env, { ANTHROPIC_BASE_URL: '' })).toEqual({
      ANTHROPIC_BASE_URL: '',
    });
  });

  it('stripAnthropicRoutingEnv removes routing/auth env case-insensitively while preserving model vars', () => {
    const input: NodeJS.ProcessEnv = {
      anthropic_base_url: 'http://127.0.0.1:8317/api/provider/codex',
      Anthropic_Auth_Token: 'parent-routing-token',
      ANTHROPIC_API_KEY: 'parent-api-key',
      ANTHROPIC_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
      PATH: '/usr/bin',
    };

    const result = stripAnthropicRoutingEnv(input);
    expect(result.anthropic_base_url).toBeUndefined();
    expect(result.Anthropic_Auth_Token).toBeUndefined();
    expect(result.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.4');
    expect(result.PATH).toBe('/usr/bin');
  });

  it('execClaude strips CLAUDECODE from merged env (including overrides)', () => {
    process.env.CLAUDECODE = 'from-parent';
    process.env.claudecode = 'from-parent-lower';

    execClaude('claude', ['--version'], {
      CCS_PROFILE_TYPE: 'default',
      CLAUDECODE: 'from-override',
      CCS_WEBSEARCH_SKIP: '1',
    });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env).toBeDefined();
    expect(Object.keys(env).map((k) => k.toUpperCase())).not.toContain('CLAUDECODE');
    expect(env.CCS_WEBSEARCH_ENABLED || env.CCS_WEBSEARCH_SKIP).toBeDefined();
  });

  it('execClaude keeps behavior when CLAUDECODE is absent', () => {
    execClaude('claude', ['--help'], { CCS_PROFILE_TYPE: 'default' });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env).toBeDefined();
    expect(Object.keys(env).map((k) => k.toUpperCase())).not.toContain('CLAUDECODE');
    expect(env.CCS_PROFILE_TYPE).toBe('default');
  });

  it('execClaude strips CLAUDECODE on Windows shell launch path', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.CLAUDECODE = 'set';

    execClaude('claude.cmd', ['--version'], { CCS_PROFILE_TYPE: 'default' });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(Object.keys(env).map((k) => k.toUpperCase())).not.toContain('CLAUDECODE');
    expect(spawnCalls[0].options?.shell).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('execClaude sets DISABLE_AUTOUPDATER=1 when preferences.auto_update is false', () => {
    writeConfigWithAutoUpdatePreference(false);
    execClaude('claude', ['--version'], { CCS_PROFILE_TYPE: 'default' });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.DISABLE_AUTOUPDATER).toBe('1');
  });

  it('execClaude does not force DISABLE_AUTOUPDATER when preferences.auto_update is true', () => {
    writeConfigWithAutoUpdatePreference(true);
    execClaude('claude', ['--version'], { CCS_PROFILE_TYPE: 'default' });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.DISABLE_AUTOUPDATER).toBeUndefined();
  });

  it('execClaude overrides stale inherited WebSearch provider flags with config-derived values', () => {
    writeConfigWithWebSearchSettings(`  enabled: true
  providers:
    duckduckgo:
      enabled: true
    searxng:
      enabled: false
      url: ''
`);
    process.env.CCS_WEBSEARCH_SEARXNG = '1';
    process.env.CCS_WEBSEARCH_SEARXNG_URL = 'https://search.example.com';
    process.env.CCS_WEBSEARCH_SKIP = '1';

    execClaude('claude', ['--version'], { CCS_PROFILE_TYPE: 'settings' });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.CCS_WEBSEARCH_ENABLED).toBe('1');
    expect(env.CCS_WEBSEARCH_SKIP).toBe('0');
    expect(env.CCS_WEBSEARCH_DUCKDUCKGO).toBe('1');
    expect(env.CCS_WEBSEARCH_SEARXNG).toBe('0');
  });

  it('execClaude normalizes shared plugin metadata before default-profile launch', () => {
    const normalizeSpy = spyOn(
      SharedManager.prototype,
      'normalizeSharedPluginMetadataPaths'
    ).mockImplementation(() => {});

    execClaude('claude', ['--help'], { CCS_PROFILE_TYPE: 'default' });

    expect(normalizeSpy).toHaveBeenCalledWith(undefined);
  });

  it('execClaude normalizes shared plugin metadata using CLAUDE_CONFIG_DIR when provided', () => {
    const normalizeSpy = spyOn(
      SharedManager.prototype,
      'normalizeSharedPluginMetadataPaths'
    ).mockImplementation(() => {});
    const instancePath = path.join(os.tmpdir(), 'ccs-shell-executor-instance');

    execClaude('claude', ['--help'], {
      CCS_PROFILE_TYPE: 'settings',
      CLAUDE_CONFIG_DIR: instancePath,
    });

    expect(normalizeSpy).toHaveBeenCalledWith(instancePath);
  });

  it('execClaude strips inherited ANTHROPIC routing env but keeps model intent for settings-profile Claude launches', () => {
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/api/provider/codex';
    process.env.ANTHROPIC_AUTH_TOKEN = 'ccs-internal-managed';
    process.env.ANTHROPIC_API_KEY = 'stale-api-key';
    process.env.ANTHROPIC_MODEL = 'gpt-5.4';
    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'gpt-5.4';
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'gpt-5.4';
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'gpt-5.4-mini';
    process.env.ANTHROPIC_SMALL_FAST_MODEL = 'gpt-5-codex-mini';

    execClaude('claude', ['--help'], {
      CCS_PROFILE_TYPE: 'settings',
      CCS_STRIP_INHERITED_ANTHROPIC_ENV: '1',
      CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), 'ccs-settings-profile-instance'),
      CCS_WEBSEARCH_SKIP: '1',
    });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.CCS_PROFILE_TYPE).toBe('settings');
    expect(env.CLAUDE_CONFIG_DIR).toContain('ccs-settings-profile-instance');
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.4');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.4');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini');
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('gpt-5-codex-mini');
  });

  it('execClaude preserves routing env supplied via explicit settings-profile envVars', () => {
    process.env.ANTHROPIC_BASE_URL = 'http://parent-leaked';
    process.env.ANTHROPIC_AUTH_TOKEN = 'parent-leaked-token';

    execClaude('claude', ['--help'], {
      CCS_PROFILE_TYPE: 'settings',
      CCS_STRIP_INHERITED_ANTHROPIC_ENV: '1',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
      ANTHROPIC_AUTH_TOKEN: 'reintroduced-routing-token',
      ANTHROPIC_API_KEY: 'reintroduced-api-key',
      ANTHROPIC_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
    });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317/api/provider/codex');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('reintroduced-routing-token');
    expect(env.ANTHROPIC_API_KEY).toBe('reintroduced-api-key');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.4');
  });

  it('execClaude sanitizes tmux teammate env for bridge-backed settings launches while keeping the launched child on the runtime proxy', () => {
    process.env.TMUX = 'session-1';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/api/provider/codex';
    process.env.ANTHROPIC_AUTH_TOKEN = 'parent-routing-token';
    process.env.ANTHROPIC_API_KEY = 'parent-api-key';
    process.env.ANTHROPIC_MODEL = 'gpt-5.4';
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'gpt-5.4';

    execClaude('claude', ['--help'], {
      CCS_PROFILE_TYPE: 'settings',
      CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), 'ccs-settings-profile-instance'),
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:3456',
      ANTHROPIC_AUTH_TOKEN: 'fresh-runtime-token',
      ANTHROPIC_MODEL: 'gpt-5.4',
    });

    expect(spawnCalls.length).toBeGreaterThan(0);
    const childEnv = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(childEnv.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:3456');
    expect(childEnv.ANTHROPIC_AUTH_TOKEN).toBe('fresh-runtime-token');

    const unsetBaseUrlCall = spawnSyncCalls.find(
      (call) => call.command === 'tmux' && call.args.join(' ') === 'setenv -u ANTHROPIC_BASE_URL'
    );
    const unsetAuthTokenCall = spawnSyncCalls.find(
      (call) => call.command === 'tmux' && call.args.join(' ') === 'setenv -u ANTHROPIC_AUTH_TOKEN'
    );
    const modelCall = spawnSyncCalls.find(
      (call) =>
        call.command === 'tmux' &&
        call.args[0] === 'setenv' &&
        call.args[1] === 'ANTHROPIC_MODEL' &&
        call.args[2] === 'gpt-5.4'
    );

    expect(unsetBaseUrlCall).toBeDefined();
    expect(unsetAuthTokenCall).toBeDefined();
    expect(modelCall).toBeDefined();
  });

  it('headless executor spawn path strips CLAUDECODE before spawn', async () => {
    writeConfigWithAutoUpdatePreference(false);
    process.env.CLAUDECODE = 'nested';
    process.env.claudecode = 'nested-lower';

    const result = await (
      HeadlessExecutor as unknown as {
        _spawnAndExecute: (
          claudeCli: string,
          args: string[],
          ctx: {
            cwd: string;
            profile: string;
            timeout: number;
            resumeSession: boolean;
            sessionId: string | null;
            sessionMgr: {
              updateSession: (...args: unknown[]) => void;
              storeSession: (...args: unknown[]) => void;
              cleanupExpired: () => void;
            };
          }
        ) => Promise<unknown>;
      }
    )._spawnAndExecute('claude', ['-p', 'test'], {
      cwd: process.cwd(),
      profile: 'glm',
      timeout: 1000,
      resumeSession: false,
      sessionId: null,
      sessionMgr: {
        updateSession: () => {},
        storeSession: () => {},
        cleanupExpired: () => {},
      },
    });

    expect(result).toBeDefined();
    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(Object.keys(env).map((k) => k.toUpperCase())).not.toContain('CLAUDECODE');
    expect(env.DISABLE_AUTOUPDATER).toBe('1');
  });

  it('headless executor adds third-party WebSearch steering args and env', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    fs.writeFileSync(path.join(ccsDir, 'glm.settings.json'), '{}\n', 'utf8');
    const projectDir = path.join(ccsDir, 'project');
    fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'settings.local.json'),
      JSON.stringify(
        {
          permissions: {
            deny: ['Bash', 'WebFetch'],
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    process.env.CCS_CLAUDE_PATH = 'claude';

    const result = await HeadlessExecutor.execute('glm', 'latest AI chip news', {
      cwd: projectDir,
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const launch = spawnCalls[0];
    expect(launch.args).toContain('--disallowedTools');
    const disallowedToolsIndex = launch.args.indexOf('--disallowedTools');
    expect(disallowedToolsIndex).toBeGreaterThan(-1);
    expect(launch.args[disallowedToolsIndex + 1]).toBe('Bash,WebFetch,WebSearch');
    expect(launch.args).toContain('--append-system-prompt');
    expect(launch.args.join(' ')).toContain(STEERING_PROMPT_SNIPPET);
    const env = launch.options?.env as NodeJS.ProcessEnv;
    expect(env.CCS_PROFILE_TYPE).toBe('settings');
    expect(env.CCS_WEBSEARCH_ENABLED || env.CCS_WEBSEARCH_SKIP).toBeDefined();
    const claudeUserConfig = JSON.parse(
      fs.readFileSync(path.join(process.env.CCS_HOME as string, '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(claudeUserConfig.mcpServers?.['ccs-websearch']).toEqual({
      type: 'stdio',
      command: 'node',
      args: [path.join(ccsDir, 'mcp', 'ccs-websearch-server.cjs')],
      env: {},
    });
  });

  it('headless executor strips inherited routing env for settings-profile delegation while preserving model intent', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_MODEL: 'gpt-5.4',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '12345',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const projectDir = path.join(ccsDir, 'project-headless-settings');
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.CCS_CLAUDE_PATH = 'claude';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/api/provider/codex';
    process.env.ANTHROPIC_AUTH_TOKEN = 'parent-routing-token';
    process.env.ANTHROPIC_API_KEY = 'parent-api-key';
    process.env.ANTHROPIC_MODEL = 'gpt-5.4';

    const result = await HeadlessExecutor.execute('glm', 'latest AI chip news', {
      cwd: projectDir,
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.4');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('12345');
  });

  it('headless executor preserves profile routing env for non-proxy settings-profile delegation', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    fs.writeFileSync(
      path.join(ccsDir, 'ollama-cloud.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://ollama.com',
            ANTHROPIC_AUTH_TOKEN: 'settings-ollama-token',
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_MODEL: 'gemma4:31b-cloud',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '12345',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const projectDir = path.join(ccsDir, 'project-headless-ollama-cloud');
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.CCS_CLAUDE_PATH = 'claude';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/api/provider/codex';
    process.env.ANTHROPIC_AUTH_TOKEN = 'parent-routing-token';
    process.env.ANTHROPIC_API_KEY = 'parent-api-key';

    const result = await HeadlessExecutor.execute('ollama-cloud', 'latest AI chip news', {
      cwd: projectDir,
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ollama.com');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('settings-ollama-token');
    expect(env.ANTHROPIC_API_KEY).toBe('');
    expect(env.ANTHROPIC_MODEL).toBe('gemma4:31b-cloud');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('12345');
  });

  it('headless executor rebuilds OpenAI-compatible bridge env from settings instead of inheriting stale parent routing', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    fs.writeFileSync(
      path.join(ccsDir, 'bridge.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
            ANTHROPIC_AUTH_TOKEN: 'settings-bridge-token',
            ANTHROPIC_MODEL: 'gpt-5.4',
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '12345',
          },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Read',
                hooks: [{ type: 'command', command: 'echo headless-bridge-hook' }],
              },
            ],
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const projectDir = path.join(ccsDir, 'project-headless-bridge');
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.CCS_CLAUDE_PATH = 'claude';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317/api/provider/codex';
    process.env.ANTHROPIC_AUTH_TOKEN = 'parent-routing-token';
    process.env.ANTHROPIC_API_KEY = 'parent-api-key';

    const result = await HeadlessExecutor.execute('bridge', 'latest AI chip news', {
      cwd: projectDir,
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.ANTHROPIC_BASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env.ANTHROPIC_BASE_URL).not.toBe('http://127.0.0.1:8317/api/provider/codex');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeDefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).not.toBe('parent-routing-token');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.4');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('12345');

    const args = spawnCalls[0].args;
    const settingsIndex = args.indexOf('--settings');
    expect(settingsIndex).toBeGreaterThanOrEqual(0);

    const launchSettingsPath = args[settingsIndex + 1];
    expect(launchSettingsPath).toBeDefined();
    expect(launchSettingsPath).not.toBe(path.join(ccsDir, 'bridge.settings.json'));
    const launchSettingsSnapshot = launchSettingsSnapshots.find(
      (snapshot) => snapshot.path === launchSettingsPath
    );
    expect(launchSettingsSnapshot).toBeDefined();

    const persistedLaunchSettings = JSON.parse(launchSettingsSnapshot?.content || '{}') as {
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
    expect(persistedLaunchSettings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe(
      'echo headless-bridge-hook'
    );
    expect(fs.existsSync(launchSettingsPath)).toBe(false);
  });

  it('headless executor prepares image-analysis MCP and suppresses the legacy hook on healthy launches', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    const settingsPath = path.join(ccsDir, 'glm.settings.json');
    fs.writeFileSync(settingsPath, '{}\n', 'utf8');
    process.env.CCS_CLAUDE_PATH = 'claude';

    const result = await HeadlessExecutor.execute('glm', 'describe screenshot', {
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const launch = spawnCalls[0];
    const env = launch.options?.env as NodeJS.ProcessEnv;

    const persistedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };
    expect(
      persistedSettings.hooks?.PreToolUse?.some((hook) => hook.matcher === 'Read') ?? false
    ).toBe(false);
    expect(env.CCS_IMAGE_ANALYSIS_SKIP_HOOK).toBe('1');

    const claudeUserConfig = JSON.parse(
      fs.readFileSync(path.join(process.env.CCS_HOME as string, '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(claudeUserConfig.mcpServers?.['ccs-image-analysis']).toEqual({
      type: 'stdio',
      command: 'node',
      args: [path.join(ccsDir, 'mcp', 'ccs-image-analysis-server.cjs')],
      env: {},
    });
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'image-analyzer-transformer.cjs'))).toBe(false);
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'image-analysis-runtime.cjs'))).toBe(false);
  });

  it('headless executor propagates a WebSearch trace launch id when tracing is enabled', async () => {
    writeConfigWithAutoUpdatePreference(false);
    const ccsDir = path.join(process.env.CCS_HOME as string, '.ccs');
    fs.writeFileSync(path.join(ccsDir, 'glm.settings.json'), '{}\n', 'utf8');
    process.env.CCS_CLAUDE_PATH = 'claude';
    process.env.CCS_WEBSEARCH_TRACE = '1';

    const result = await HeadlessExecutor.execute('glm', 'latest AI chip news', {
      permissionMode: 'default',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    const env = spawnCalls[0].options?.env as NodeJS.ProcessEnv;
    expect(env.CCS_WEBSEARCH_TRACE).toBe('1');
    expect(env.CCS_WEBSEARCH_TRACE_LAUNCH_ID).toBeString();
    expect(env.CCS_WEBSEARCH_TRACE_LAUNCHER).toBe('delegation.headless-executor');
  });
});
