import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import * as shellExecutor from '../../../src/utils/shell-executor';
import * as poolOnboardingHint from '../../../src/cliproxy/routing/pool-onboarding-hint';
import {
  closeOpenAICompatProxyServer,
  startOpenAICompatProxyServer,
} from '../../../src/proxy/server/proxy-server';
import type { OpenAICompatProfileConfig } from '../../../src/proxy/profile-router';
import type { ProfileDispatchContext } from '../../../src/dispatcher/dispatcher-context';

// Capture the real proxy module before mock.module so we can restore it in afterAll.
const REAL_PROXY_INDEX = { ...(await import('../../../src/proxy/index')) };
const REAL_PROXY_DAEMON = { ...(await import('../../../src/proxy/proxy-daemon')) };

let activeProxyServer: http.Server | null = null;
let startProxyCallCount = 0;

mock.module('../../../src/proxy/proxy-daemon', () => ({
  ...REAL_PROXY_DAEMON,
  startOpenAICompatProxy: async (profile: OpenAICompatProfileConfig) => {
    startProxyCallCount += 1;
    const authToken = 'test-account-proxy-token';
    activeProxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken,
    });
    const port = await new Promise<number>((resolve, reject) => {
      activeProxyServer!.once('error', reject);
      activeProxyServer!.once('listening', () => {
        const address = activeProxyServer!.address() as AddressInfo;
        resolve(address.port);
      });
    });
    return {
      success: true,
      port,
      authToken,
    };
  },
}));

mock.module('../../../src/proxy', () => ({
  ...REAL_PROXY_INDEX,
  startOpenAICompatProxy: async (profile: OpenAICompatProfileConfig) => {
    startProxyCallCount += 1;
    const authToken = 'test-account-proxy-token';
    activeProxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken,
    });
    const port = await new Promise<number>((resolve, reject) => {
      activeProxyServer!.once('error', reject);
      activeProxyServer!.once('listening', () => {
        const address = activeProxyServer!.address() as AddressInfo;
        resolve(address.port);
      });
    });
    return {
      success: true,
      port,
      authToken,
    };
  },
}));

const { runAccountFlow } = await import('../../../src/dispatcher/flows/account-flow');

function buildAccountDispatchContext(
  accountName: string,
  instancePath: string,
  remainingArgs: string[] = []
): ProfileDispatchContext {
  class StubInstanceManager {
    async ensureInstance() {
      fs.mkdirSync(instancePath, { recursive: true });
      return instancePath;
    }
  }

  class StubProfileRegistry {
    hasAccountUnified() {
      return false;
    }
    touchAccountUnified() {}
    touchProfile() {}
  }

  return {
    profileInfo: {
      name: accountName,
      type: 'account',
      profile: {
        name: accountName,
        created: '2026-01-01T00:00:00.000Z',
        last_used: null,
      },
    },
    resolvedTarget: 'claude',
    claudeCli: '/usr/local/bin/claude',
    targetAdapter: undefined,
    targetBinaryInfo: null,
    targetRemainingArgs: remainingArgs,
    nativeClaudeRemainingArgs: remainingArgs,
    runtimeReasoningOverride: undefined,
    codexRuntimeConfigOverrides: [],
    claudeBrowserExposure: { exposeForLaunch: false } as never,
    claudeAttachConfig: undefined,
    resolveProfileContinuityInheritance: async () => ({}),
    remainingArgs,
    InstanceManager: StubInstanceManager as never,
    ProfileRegistry: StubProfileRegistry as never,
    resolveAccountContextPolicy: () => ({ mode: 'isolated' }) as never,
    isAccountContextMetadata: () => false,
  } as unknown as ProfileDispatchContext;
}

describe('account-flow OpenAI-compatible shaping proxy (Issue #1469)', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let upstreamServer: http.Server | null = null;
  let upstreamPort = 0;
  let capturedUpstreamBodies: Array<Record<string, unknown>> = [];

  beforeEach(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-account-flow-1469-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    startProxyCallCount = 0;
    capturedUpstreamBodies = [];

    upstreamServer = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
      }
      if (req.method !== 'POST') {
        res.writeHead(200);
        res.end();
        return;
      }
      capturedUpstreamBodies.push(JSON.parse(raw) as Record<string, unknown>);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          model: 'o3-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'shaped ok' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        })
      );
    });

    await new Promise<void>((resolve) => {
      upstreamServer!.listen(0, '127.0.0.1', () => {
        upstreamPort = (upstreamServer!.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (activeProxyServer) {
      await closeOpenAICompatProxyServer(activeProxyServer);
      activeProxyServer = null;
    }
    if (upstreamServer) {
      await new Promise<void>((resolve) => upstreamServer!.close(() => resolve()));
      upstreamServer = null;
    }
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  afterAll(() => {
    mock.module('../../../src/proxy/proxy-daemon', () => REAL_PROXY_DAEMON);
    mock.module('../../../src/proxy', () => REAL_PROXY_INDEX);
  });

  it('routes OpenAI-compatible account instances through the shaping proxy and shapes reasoning max_tokens -> max_completion_tokens', async () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'openai-acc');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
          ANTHROPIC_AUTH_TOKEN: 'sk-account-openai-test',
          ANTHROPIC_MODEL: 'custom-reasoning-model',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
          CCS_OPENAI_REASONING_MODEL: '1',
        },
      }),
      'utf8'
    );

    let capturedCli = '';
    let capturedArgs: string[] = [];
    let capturedEnv: NodeJS.ProcessEnv | undefined | null = null;
    let capturedCleanup: (() => void) | undefined;

    const execSpy = spyOn(shellExecutor, 'execClaude').mockImplementation(
      (cli, args, envVars, onExitCleanup) => {
        capturedCli = cli;
        capturedArgs = args;
        capturedEnv = envVars;
        capturedCleanup = onExitCleanup;
      }
    );
    const hintSpy = spyOn(poolOnboardingHint, 'maybeShowPoolOnboardingHint').mockImplementation((() => ({ shown: false })) as unknown as typeof poolOnboardingHint.maybeShowPoolOnboardingHint);

    try {
      await runAccountFlow(
        buildAccountDispatchContext('openai-acc', instancePath, ['-p', 'hello'])
      );
    } finally {
      execSpy.mockRestore();
      hintSpy.mockRestore();
    }

    expect(startProxyCallCount).toBe(1);
    expect(capturedCli).toBe('/usr/local/bin/claude');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CLAUDE_CONFIG_DIR).toBe(instancePath);
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CCS_PROFILE_TYPE).toBe('account');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CCS_WEBSEARCH_SKIP).toBe('1');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CCS_IMAGE_ANALYSIS_SKIP).toBe('1');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.ANTHROPIC_BASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.ANTHROPIC_AUTH_TOKEN).toBe('test-account-proxy-token');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(capturedCleanup).toBeFunction();

    // Isolated launch settings must strip routing env keys so Claude Code does not bypass the proxy
    const settingsFlagIndex = capturedArgs.indexOf('--settings');
    expect(settingsFlagIndex).toBeGreaterThanOrEqual(0);
    const isolatedSettingsPath = capturedArgs[settingsFlagIndex + 1];
    expect(isolatedSettingsPath).toBeTruthy();
    const isolatedSettings = JSON.parse(fs.readFileSync(isolatedSettingsPath, 'utf8')) as {
      env?: Record<string, string>;
    };
    expect(isolatedSettings.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(isolatedSettings.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(isolatedSettings.env?.ANTHROPIC_API_KEY).toBeUndefined();

    // Verify the launched proxy actually shapes reasoning requests (max_tokens -> max_completion_tokens)
    const proxyResponse = await fetch(`${capturedEnv!.ANTHROPIC_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': capturedEnv!.ANTHROPIC_AUTH_TOKEN!,
      },
      body: JSON.stringify({
        model: 'custom-reasoning-model',
        max_tokens: 2048,
        messages: [{ role: 'user', content: 'reason carefully' }],
      }),
    });

    expect(proxyResponse.status).toBe(200);
    expect(capturedUpstreamBodies).toHaveLength(1);
    expect(capturedUpstreamBodies[0]?.max_completion_tokens).toBe(2048);
    expect(capturedUpstreamBodies[0]?.max_tokens).toBeUndefined();
  });

  it('leaves native Claude OAuth accounts untouched without starting an OpenAI-compat proxy', async () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'claude-oauth');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(path.join(instancePath, 'settings.json'), JSON.stringify({}), 'utf8');

    let capturedArgs: string[] = [];
    let capturedEnv: NodeJS.ProcessEnv | undefined | null = null;
    let capturedCleanup: (() => void) | undefined;

    const execSpy = spyOn(shellExecutor, 'execClaude').mockImplementation(
      (_cli, args, envVars, onExitCleanup) => {
        capturedArgs = args;
        capturedEnv = envVars;
        capturedCleanup = onExitCleanup;
      }
    );
    const hintSpy = spyOn(poolOnboardingHint, 'maybeShowPoolOnboardingHint').mockImplementation((() => ({ shown: false })) as unknown as typeof poolOnboardingHint.maybeShowPoolOnboardingHint);

    try {
      await runAccountFlow(
        buildAccountDispatchContext('claude-oauth', instancePath, ['-p', 'hello'])
      );
    } finally {
      execSpy.mockRestore();
      hintSpy.mockRestore();
    }

    expect(startProxyCallCount).toBe(0);
    expect(capturedArgs).toEqual(['-p', 'hello']);
    expect(capturedEnv).toEqual({
      CLAUDE_CONFIG_DIR: instancePath,
      CCS_PROFILE_TYPE: 'account',
      CCS_WEBSEARCH_SKIP: '1',
      CCS_IMAGE_ANALYSIS_SKIP: '1',
    });
    expect(capturedCleanup).toBeUndefined();
  });

  it('leaves account instances with no settings.json untouched', async () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'bare-oauth');
    fs.mkdirSync(instancePath, { recursive: true });

    let capturedArgs: string[] = [];
    let capturedEnv: NodeJS.ProcessEnv | undefined | null = null;

    const execSpy = spyOn(shellExecutor, 'execClaude').mockImplementation(
      (_cli, args, envVars) => {
        capturedArgs = args;
        capturedEnv = envVars;
      }
    );
    const hintSpy = spyOn(poolOnboardingHint, 'maybeShowPoolOnboardingHint').mockImplementation((() => ({ shown: false })) as unknown as typeof poolOnboardingHint.maybeShowPoolOnboardingHint);

    try {
      await runAccountFlow(
        buildAccountDispatchContext('bare-oauth', instancePath, ['--continue'])
      );
    } finally {
      execSpy.mockRestore();
      hintSpy.mockRestore();
    }

    expect(startProxyCallCount).toBe(0);
    expect(capturedArgs).toEqual(['--continue']);
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CLAUDE_CONFIG_DIR).toBe(instancePath);
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.CCS_PROFILE_TYPE).toBe('account');
    expect((capturedEnv as NodeJS.ProcessEnv | null)?.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});
