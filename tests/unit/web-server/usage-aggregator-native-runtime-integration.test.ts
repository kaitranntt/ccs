import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempRoot = '';
let ccsDir = '';
let claudeDir = '';
let codexDir = '';
let aggregator: typeof import('../../../src/web-server/usage/aggregator');
let originalCcsDir: string | undefined;
let originalClaudeConfigDir: string | undefined;
let originalCcsHome: string | undefined;
let originalCodexHome: string | undefined;

function writeUnifiedConfigFixture(): void {
  const yaml = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants: {}
cliproxy_server:
  local:
    port: 65534
`;

  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), yaml, 'utf8');
}

function writeClaudeJsonlFixture(): void {
  const projectDir = path.join(claudeDir, 'projects', 'project-one');
  fs.mkdirSync(projectDir, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'claude-session',
    timestamp: '2026-03-02T10:00:00.000Z',
    cwd: '/tmp/project',
    message: {
      model: 'claude-sonnet-4-5',
      usage: {
        input_tokens: 100,
        output_tokens: 40,
      },
    },
  });
  fs.writeFileSync(path.join(projectDir, 'usage.jsonl'), `${line}\n`, 'utf8');
}

function writeCliproxySnapshotFixture(): void {
  const snapshotDir = path.join(ccsDir, 'cache', 'cliproxy-usage');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(snapshotDir, 'latest.json'),
    JSON.stringify({
      version: 3,
      timestamp: Date.now(),
      details: [
        {
          model: 'gemini-2.5-pro',
          timestamp: '2026-03-02T10:00:00.000Z',
          source: 'account-a',
          authIndex: '0',
          inputTokens: 50,
          outputTokens: 10,
          cacheReadTokens: 5,
          requestCount: 1,
          cost: 0.2,
          failed: false,
        },
      ],
      daily: [
        {
          date: '2026-03-02',
          source: 'cliproxy',
          inputTokens: 50,
          outputTokens: 10,
          cacheCreationTokens: 0,
          cacheReadTokens: 5,
          cost: 0.2,
          totalCost: 0.2,
          modelsUsed: ['gemini-2.5-pro'],
          modelBreakdowns: [
            {
              modelName: 'gemini-2.5-pro',
              inputTokens: 50,
              outputTokens: 10,
              cacheCreationTokens: 0,
              cacheReadTokens: 5,
              cost: 0.2,
            },
          ],
        },
      ],
      hourly: [
        {
          hour: '2026-03-02 10:00',
          source: 'cliproxy',
          inputTokens: 50,
          outputTokens: 10,
          cacheCreationTokens: 0,
          cacheReadTokens: 5,
          cost: 0.2,
          totalCost: 0.2,
          modelsUsed: ['gemini-2.5-pro'],
          modelBreakdowns: [
            {
              modelName: 'gemini-2.5-pro',
              inputTokens: 50,
              outputTokens: 10,
              cacheCreationTokens: 0,
              cacheReadTokens: 5,
              cost: 0.2,
            },
          ],
        },
      ],
      monthly: [
        {
          month: '2026-03',
          source: 'cliproxy',
          inputTokens: 50,
          outputTokens: 10,
          cacheCreationTokens: 0,
          cacheReadTokens: 5,
          totalCost: 0.2,
          modelsUsed: ['gemini-2.5-pro'],
          modelBreakdowns: [
            {
              modelName: 'gemini-2.5-pro',
              inputTokens: 50,
              outputTokens: 10,
              cacheCreationTokens: 0,
              cacheReadTokens: 5,
              cost: 0.2,
            },
          ],
        },
      ],
    }),
    'utf8'
  );
}

function writeCodexFixture(modelProvider = 'openai'): void {
  const rolloutDir = path.join(codexDir, 'sessions', '2026', '03', '02');
  fs.mkdirSync(rolloutDir, { recursive: true });
  const rolloutPath = path.join(rolloutDir, 'rollout-native-codex.jsonl');
  const lines = [
    JSON.stringify({
      timestamp: '2026-03-02T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'codex-session',
        timestamp: '2026-03-02T10:00:00.000Z',
        cwd: '/tmp/codex-project',
        cli_version: '0.126.0',
        source: 'cli',
        model_provider: modelProvider,
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:00:01.000Z',
      type: 'turn_context',
      payload: {
        turn_id: 'turn-1',
        cwd: '/tmp/codex-project',
        model: 'gpt-5',
        effort: 'high',
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:05:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 30,
            cached_input_tokens: 5,
            output_tokens: 2,
            reasoning_output_tokens: 1,
            total_tokens: 32,
          },
          last_token_usage: {
            input_tokens: 30,
            cached_input_tokens: 5,
            output_tokens: 2,
            reasoning_output_tokens: 1,
            total_tokens: 32,
          },
          model_context_window: 200000,
        },
      },
    }),
  ];

  fs.writeFileSync(rolloutPath, `${lines.join('\n')}\n`, 'utf8');
}

beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-usage-native-agg-'));
  ccsDir = path.join(tempRoot, '.ccs');
  claudeDir = path.join(tempRoot, '.claude');
  codexDir = path.join(tempRoot, '.codex-native');

  originalCcsDir = process.env.CCS_DIR;
  originalCcsHome = process.env.CCS_HOME;
  originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  originalCodexHome = process.env.CODEX_HOME;
  process.env.CCS_DIR = ccsDir;
  process.env.CCS_HOME = tempRoot;
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  process.env.CODEX_HOME = codexDir;

  writeUnifiedConfigFixture();
  writeClaudeJsonlFixture();
  writeCliproxySnapshotFixture();
  writeCodexFixture();

  aggregator = await import('../../../src/web-server/usage/aggregator');
  aggregator.clearUsageCache();
});

afterEach(() => {
  aggregator.shutdownUsageAggregator();
  aggregator.clearUsageCache();

  if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
  else delete process.env.CCS_DIR;

  if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
  else delete process.env.CCS_HOME;

  if (originalClaudeConfigDir !== undefined)
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  else delete process.env.CLAUDE_CONFIG_DIR;

  if (originalCodexHome !== undefined) process.env.CODEX_HOME = originalCodexHome;
  else delete process.env.CODEX_HOME;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('usage aggregator native runtime integration', () => {
  it('merges native codex usage with claude and cliproxy analytics', async () => {
    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      date: '2026-03-02',
      inputTokens: 175,
      outputTokens: 52,
      cacheReadTokens: 10,
    });
    expect(daily[0].modelsUsed).toContain('claude-sonnet-4-5');
    expect(daily[0].modelsUsed).toContain('gemini-2.5-pro');
    expect(daily[0].modelsUsed).toContain('gpt-5');
  });

  it('ignores cliproxy-backed codex rollouts to avoid double counting', async () => {
    writeCodexFixture('cliproxy');
    aggregator.clearUsageCache();

    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      inputTokens: 150,
      outputTokens: 50,
      cacheReadTokens: 5,
    });
    expect(daily[0].modelsUsed).not.toContain('gpt-5');
  });

  it('ignores ccs_runtime-backed codex bridge rollouts to avoid double counting', async () => {
    writeCodexFixture('ccs_runtime');
    aggregator.clearUsageCache();

    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      inputTokens: 150,
      outputTokens: 50,
      cacheReadTokens: 5,
    });
    expect(daily[0].modelsUsed).not.toContain('gpt-5');
  });
});
