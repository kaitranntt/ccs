import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import getPort from 'get-port';
import {
  getOpenAICompatProxyStatus,
  listOpenAICompatProxyStatuses,
  startOpenAICompatProxy,
  stopOpenAICompatProxy,
} from '../../../src/proxy/proxy-daemon';
import { resolveOpenAICompatProxyPreferredPort } from '../../../src/proxy/proxy-port-resolver';
import { resolveOpenAICompatProfileConfig } from '../../../src/proxy/profile-router';
import {
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END,
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START,
  getLegacyOpenAICompatProxyPidPath,
  getLegacyOpenAICompatProxySessionPath,
  getOpenAICompatProxyPidPath,
  getOpenAICompatProxySessionPath,
} from '../../../src/proxy/proxy-daemon-paths';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';

let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-openai-proxy-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(async () => {
  await stopOpenAICompatProxy();
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function findProfileNameWithFreeAdaptivePort(prefix: string): Promise<string> {
  for (let index = 0; index < 200; index += 1) {
    const profileName = `${prefix}-${index}`;
    const preferredPort = resolveOpenAICompatProxyPreferredPort(profileName);
    const availablePort = await getPort({ port: preferredPort, host: '127.0.0.1' });
    if (availablePort === preferredPort) {
      return profileName;
    }
  }

  throw new Error(`No free adaptive proxy port found for ${prefix}`);
}

async function getPortOutsideOpenAICompatAdaptiveRange(): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rangeStart = 45_000 + attempt * 101;
    const port = await getPort({
      port: getPort.makeRange(rangeStart, rangeStart + 100),
      host: '127.0.0.1',
    });
    if (
      port < OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START ||
      port > OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END
    ) {
      return port;
    }
  }

  throw new Error('No stale proxy fixture port found outside the adaptive range');
}

function readProcessCommandLine(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return commandLine.split('\u0000').filter(Boolean).join(' ') || null;
    } catch {
      // Fall back to ps below for platforms without readable procfs entries.
    }
  }

  try {
    return (
      execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
      }).trim() || null
    );
  } catch {
    return null;
  }
}

describe('openai proxy daemon lifecycle', () => {
  it('starts, reports status, serves health/models, and stops', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'hf.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('hf', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected an OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.authToken).toBeTruthy();
    const authToken = started.authToken;
    if (!authToken) {
      throw new Error('Expected proxy auth token');
    }

    const status = await getOpenAICompatProxyStatus();
    expect(status.running).toBe(true);
    expect(status.profileName).toBe('hf');
    expect(status.authToken).toBe(authToken);

    const sessionPath = getOpenAICompatProxySessionPath('hf');
    const proxyDir = path.dirname(sessionPath);
    if (process.platform !== 'win32') {
      expect(fs.statSync(proxyDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(sessionPath).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(proxyDir).some((entry) => entry.endsWith('.token'))).toBe(false);
    if (started.pid) {
      const commandLine = readProcessCommandLine(started.pid);
      if (!commandLine) {
        console.warn(
          `Skipping daemon argv assertion: could not read command line for PID ${started.pid}`
        );
      } else {
        expect(commandLine).toContain('--auth-token-file');
        expect(commandLine).not.toContain(authToken);
        expect(commandLine).not.toMatch(/(^|\s)--auth-token(?:\s|=|$)/);
      }
    }

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const models = (await (
      await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { 'x-api-key': authToken },
      })
    ).json()) as { data?: Array<{ id: string }> };
    expect(models.data?.map((entry) => entry.id)).toEqual(['qwen3-coder']);

    const headRoot = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
    expect(headRoot.status).toBe(200);
    expect(headRoot.headers.get('content-type')).toBe('application/json');
    expect(await headRoot.text()).toBe('');

    const headHealth = await fetch(`http://127.0.0.1:${port}/health`, { method: 'HEAD' });
    expect(headHealth.status).toBe(200);
    expect(headHealth.headers.get('content-type')).toBe('application/json');
    expect(await headHealth.text()).toBe('');

    const stopped = await stopOpenAICompatProxy();
    expect(stopped.success).toBe(true);
    expect((await getOpenAICompatProxyStatus()).running).toBe(false);
  }, 35000);

  it('allows different profiles to run on different ports', async () => {
    const firstPort = await getPort();
    const firstSettingsPath = path.join(tempDir, 'hf.settings.json');
    fs.writeFileSync(
      firstSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );
    const firstProfile = resolveOpenAICompatProfileConfig('hf', firstSettingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!firstProfile) {
      throw new Error('Expected first OpenAI-compatible profile');
    }

    const firstStart = await startOpenAICompatProxy(firstProfile, { port: firstPort });
    expect(firstStart.success).toBe(true);

    const secondPort = await getPort();
    const secondSettingsPath = path.join(tempDir, 'openai.settings.json');
    fs.writeFileSync(
      secondSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-openai',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );
    const secondProfile = resolveOpenAICompatProfileConfig('openai', secondSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-openai',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!secondProfile) {
      throw new Error('Expected second OpenAI-compatible profile');
    }

    const secondStart = await startOpenAICompatProxy(secondProfile, { port: secondPort });
    expect(secondStart.success).toBe(true);
    expect(secondStart.port).toBe(secondPort);

    const health = await fetch(`http://127.0.0.1:${firstPort}/health`);
    expect(health.status).toBe(200);

    const secondHealth = await fetch(`http://127.0.0.1:${secondPort}/health`);
    expect(secondHealth.status).toBe(200);
  });

  it('uses an adaptive implicit port instead of defaulting to 3456 for shared defaults', async () => {
    const settingsPath = path.join(tempDir, 'adaptive-default.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-adaptive-default',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('adaptive-default', settingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-adaptive-default',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!profile) {
      throw new Error('Expected adaptive-default OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile);
    expect(started.success).toBe(true);
    expect(started.port).not.toBe(3456);
  });

  it('keeps a legacy singleton daemon visible across upgrade', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'legacy.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-legacy',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('legacy', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-legacy',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected a legacy OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.pid).toBeDefined();

    const proxyDir = path.dirname(getLegacyOpenAICompatProxyPidPath());
    fs.writeFileSync(getLegacyOpenAICompatProxyPidPath(), String(started.pid), 'utf8');
    fs.writeFileSync(
      getLegacyOpenAICompatProxySessionPath(),
      JSON.stringify(
        {
          profileName: profile.profileName,
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port,
          baseUrl: profile.baseUrl,
          authToken: started.authToken,
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    fs.rmSync(path.join(proxyDir, 'legacy.daemon.pid'), { force: true });
    fs.rmSync(path.join(proxyDir, 'legacy.session.json'), { force: true });

    const status = await getOpenAICompatProxyStatus('legacy');
    expect(status.running).toBe(true);
    expect(status.port).toBe(port);

    const restarted = await startOpenAICompatProxy(profile);
    expect(restarted.success).toBe(true);
    expect(restarted.alreadyRunning).toBe(true);
    expect(restarted.port).toBe(port);

    const stopped = await stopOpenAICompatProxy('legacy');
    expect(stopped.success).toBe(true);
    expect(fs.existsSync(getLegacyOpenAICompatProxyPidPath())).toBe(false);
    expect(fs.existsSync(getLegacyOpenAICompatProxySessionPath())).toBe(false);
  }, 35000);

  it('fails when an explicit port is already occupied', async () => {
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });
    const occupiedPort = server.port;

    try {
      const settingsPath = path.join(tempDir, 'occupied-explicit.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-explicit',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('explicit', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-explicit',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected an explicit-port OpenAI-compatible profile');
      }

      const started = await startOpenAICompatProxy(profile, { port: occupiedPort });
      expect(started.success).toBe(false);
      expect(started.port).toBe(occupiedPort);
      expect(started.error).toContain(`Requested proxy port ${occupiedPort} is already in use`);
    } finally {
      server.stop(true);
    }
  });

  it('fails when a configured profile port is already occupied', async () => {
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });
    const occupiedPort = server.port;

    try {
      mutateUnifiedConfig((config) => {
        config.proxy = {
          ...(config.proxy ?? {}),
          profile_ports: { mapped: occupiedPort },
        };
      });

      const settingsPath = path.join(tempDir, 'occupied-mapped.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-mapped',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('mapped', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-mapped',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected a mapped-port OpenAI-compatible profile');
      }

      const started = await startOpenAICompatProxy(profile);
      expect(started.success).toBe(false);
      expect(started.port).toBe(occupiedPort);
      expect(started.error).toContain(`Requested proxy port ${occupiedPort} is already in use`);
    } finally {
      server.stop(true);
    }
  });

  it('falls back when a configured shared proxy.port is occupied', async () => {
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });
    const occupiedPort = server.port;

    try {
      mutateUnifiedConfig((config) => {
        config.proxy = {
          ...(config.proxy ?? {}),
          port: occupiedPort,
        };
      });

      const settingsPath = path.join(tempDir, 'shared-port.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-shared-port',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('shared-port', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-shared-port',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected shared-port OpenAI-compatible profile');
      }

      const started = await startOpenAICompatProxy(profile);
      expect(started.success).toBe(true);
      expect(started.port).not.toBe(occupiedPort);
    } finally {
      server.stop(true);
    }
  });

  it('keeps the existing proxy running if replacement startup fails', async () => {
    const busyServer = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('busy'),
    });
    const occupiedPort = busyServer.port;
    const firstPort = await getPort({ exclude: [occupiedPort] });

    try {
      const settingsPath = path.join(tempDir, 'rollback.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
            ANTHROPIC_AUTH_TOKEN: 'ollama-rollback',
            ANTHROPIC_MODEL: 'qwen3-coder',
            CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          },
        }),
        'utf8'
      );

      const profile = resolveOpenAICompatProfileConfig('rollback', settingsPath, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
        ANTHROPIC_AUTH_TOKEN: 'ollama-rollback',
        ANTHROPIC_MODEL: 'qwen3-coder',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      if (!profile) {
        throw new Error('Expected a rollback OpenAI-compatible profile');
      }

      const firstStart = await startOpenAICompatProxy(profile, { port: firstPort });
      expect(firstStart.success).toBe(true);

      const restarted = await startOpenAICompatProxy(profile, { port: occupiedPort });
      expect(restarted.success).toBe(false);

      const status = await getOpenAICompatProxyStatus('rollback');
      expect(status.running).toBe(true);
      expect(status.port).toBe(firstPort);
      expect((await fetch(`http://127.0.0.1:${firstPort}/health`)).status).toBe(200);
    } finally {
      busyServer.stop(true);
    }
  });

  it('returns to the adaptive canonical port after a stale fallback session', async () => {
    const profileName = await findProfileNameWithFreeAdaptivePort('outside-range');
    const stalePort = await getPortOutsideOpenAICompatAdaptiveRange();
    const settingsPath = path.join(tempDir, `${profileName}.settings.json`);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-outside-range',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig(profileName, settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-outside-range',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected an outside-range OpenAI-compatible profile');
    }

    fs.mkdirSync(path.dirname(getOpenAICompatProxySessionPath(profileName)), { recursive: true });
    fs.writeFileSync(
      getOpenAICompatProxySessionPath(profileName),
      JSON.stringify(
        {
          profileName: profile.profileName,
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port: stalePort,
          baseUrl: profile.baseUrl,
          authToken: 'stale-token',
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const started = await startOpenAICompatProxy(profile);
    expect(started.success).toBe(true);
    expect(started.port).toBe(resolveOpenAICompatProxyPreferredPort(profileName));
    expect(started.port).not.toBe(stalePort);
  });

  it('does not keep a stopped shared-default profile anchored to legacy port 3456', async () => {
    const settingsPath = path.join(tempDir, 'legacy-shared-default.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-legacy-shared-default',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('legacy-shared-default', settingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-legacy-shared-default',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!profile) {
      throw new Error('Expected legacy-shared-default OpenAI-compatible profile');
    }

    fs.mkdirSync(path.dirname(getOpenAICompatProxySessionPath('legacy-shared-default')), {
      recursive: true,
    });
    fs.writeFileSync(
      getOpenAICompatProxySessionPath('legacy-shared-default'),
      JSON.stringify(
        {
          profileName: profile.profileName,
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port: 3456,
          baseUrl: profile.baseUrl,
          authToken: 'stale-token',
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const started = await startOpenAICompatProxy(profile);
    expect(started.success).toBe(true);
    expect(started.port).not.toBe(3456);
  });

  it('stops legacy daemons even when the legacy session is missing a profile name', async () => {
    const port = await getPort();
    const settingsPath = path.join(tempDir, 'legacy-missing-profile.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
          ANTHROPIC_AUTH_TOKEN: 'ollama-legacy-missing-profile',
          ANTHROPIC_MODEL: 'qwen3-coder',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('legacy-missing-profile', settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama-legacy-missing-profile',
      ANTHROPIC_MODEL: 'qwen3-coder',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    if (!profile) {
      throw new Error('Expected a legacy fallback OpenAI-compatible profile');
    }

    const started = await startOpenAICompatProxy(profile, { port });
    expect(started.success).toBe(true);
    expect(started.pid).toBeDefined();

    const proxyDir = path.dirname(getLegacyOpenAICompatProxyPidPath());
    fs.writeFileSync(getLegacyOpenAICompatProxyPidPath(), String(started.pid), 'utf8');
    fs.writeFileSync(
      getLegacyOpenAICompatProxySessionPath(),
      JSON.stringify(
        {
          settingsPath: profile.settingsPath,
          host: '127.0.0.1',
          port,
          baseUrl: profile.baseUrl,
          authToken: started.authToken,
          model: profile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    fs.rmSync(path.join(proxyDir, 'legacy-missing-profile.daemon.pid'), { force: true });
    fs.rmSync(path.join(proxyDir, 'legacy-missing-profile.session.json'), { force: true });

    const statuses = await listOpenAICompatProxyStatuses();
    expect(statuses.some((status) => status.port === port)).toBe(true);

    const stopped = await stopOpenAICompatProxy();
    expect(stopped.success).toBe(true);
    expect(fs.existsSync(getLegacyOpenAICompatProxyPidPath())).toBe(false);
    expect(fs.existsSync(getLegacyOpenAICompatProxySessionPath())).toBe(false);
  }, 35000);

  it('keeps the requested profile name in stopped status results', async () => {
    const status = await getOpenAICompatProxyStatus('never-started');
    expect(status.running).toBe(false);
    expect(status.profileName).toBe('never-started');
  });

  it('does not treat another profile on the same port as already running', async () => {
    const sharedPort = await getPort();
    const firstSettingsPath = path.join(tempDir, 'profile-b.settings.json');
    fs.writeFileSync(
      firstSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-profile-b',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    const firstProfile = resolveOpenAICompatProfileConfig('profile-b', firstSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-profile-b',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!firstProfile) {
      throw new Error('Expected first OpenAI-compatible profile');
    }

    const firstStart = await startOpenAICompatProxy(firstProfile, { port: sharedPort });
    expect(firstStart.success).toBe(true);

    const secondSettingsPath = path.join(tempDir, 'profile-a.settings.json');
    fs.writeFileSync(
      secondSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-profile-a',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    const secondProfile = resolveOpenAICompatProfileConfig('profile-a', secondSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-profile-a',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!secondProfile) {
      throw new Error('Expected second OpenAI-compatible profile');
    }

    fs.writeFileSync(
      getOpenAICompatProxySessionPath('profile-a'),
      JSON.stringify(
        {
          profileName: 'profile-a',
          settingsPath: secondProfile.settingsPath,
          host: '127.0.0.1',
          port: sharedPort,
          baseUrl: secondProfile.baseUrl,
          authToken: 'stale-token-a',
          model: secondProfile.model,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const secondStart = await startOpenAICompatProxy(secondProfile);
    expect(secondStart.success).toBe(true);
    expect(secondStart.alreadyRunning).not.toBe(true);
    expect(secondStart.authToken).not.toBe('stale-token-a');
  });

  it('replaces pid-only proxy state before starting a new daemon', async () => {
    const firstPort = await getPort();
    const replacementPort = await getPort();
    const settingsPath = path.join(tempDir, 'pid-only.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-pid-only',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );

    const profile = resolveOpenAICompatProfileConfig('pid-only', settingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-pid-only',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!profile) {
      throw new Error('Expected pid-only OpenAI-compatible profile');
    }

    const firstStart = await startOpenAICompatProxy(profile, { port: firstPort });
    expect(firstStart.success).toBe(true);
    expect(firstStart.pid).toBeDefined();

    fs.unlinkSync(getOpenAICompatProxySessionPath('pid-only'));

    const replacement = await startOpenAICompatProxy(profile, { port: replacementPort });
    expect(replacement.success).toBe(true);
    expect(replacement.port).toBe(replacementPort);
    expect(replacement.pid).toBeDefined();
    expect(replacement.pid).not.toBe(firstStart.pid);

    const stalePidPath = getOpenAICompatProxyPidPath('pid-only');
    expect(fs.readFileSync(stalePidPath, 'utf8').trim()).toBe(String(replacement.pid));
    expect((await fetch(`http://127.0.0.1:${replacementPort}/health`)).status).toBe(200);
  });

  it('does not stop another profile when a stale pid file points at its daemon', async () => {
    const firstPort = await getPort();
    const secondPort = await getPort();
    const firstSettingsPath = path.join(tempDir, 'profile-b-stale-pid.settings.json');
    fs.writeFileSync(
      firstSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-profile-b-stale-pid',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );
    const firstProfile = resolveOpenAICompatProfileConfig('profile-b-stale-pid', firstSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-profile-b-stale-pid',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!firstProfile) {
      throw new Error('Expected first OpenAI-compatible profile');
    }

    const firstStart = await startOpenAICompatProxy(firstProfile, { port: firstPort });
    expect(firstStart.success).toBe(true);
    expect(firstStart.pid).toBeDefined();

    const secondSettingsPath = path.join(tempDir, 'profile-a-stale-pid.settings.json');
    fs.writeFileSync(
      secondSettingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
          ANTHROPIC_AUTH_TOKEN: 'sk-profile-a-stale-pid',
          ANTHROPIC_MODEL: 'gpt-4.1',
        },
      }),
      'utf8'
    );
    const secondProfile = resolveOpenAICompatProfileConfig('profile-a-stale-pid', secondSettingsPath, {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-profile-a-stale-pid',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });
    if (!secondProfile) {
      throw new Error('Expected second OpenAI-compatible profile');
    }

    fs.writeFileSync(
      getOpenAICompatProxyPidPath('profile-a-stale-pid'),
      String(firstStart.pid),
      'utf8'
    );

    const secondStart = await startOpenAICompatProxy(secondProfile, { port: secondPort });
    expect(secondStart.success).toBe(true);
    expect(secondStart.port).toBe(secondPort);
    expect((await fetch(`http://127.0.0.1:${firstPort}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${secondPort}/health`)).status).toBe(200);
  });
});
