import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runWithScopedCcsHome } from '../../../src/utils/config-manager';
import { scanCodexNativeUsageEntries } from '../../../src/web-server/usage/codex-native-usage-collector';

type TestUsageCache = {
  includeCliproxySessions: boolean;
  files: Record<string, { mtimeMs: number; entries: unknown[] }>;
};

function readTestUsageCache(cachePath: string): TestUsageCache {
  return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as TestUsageCache;
}

function writeCodexRollout(
  baseDir: string,
  options: {
    sessionId?: string;
    modelProvider?: string;
    model?: string;
    cwd?: string;
  } = {}
): string {
  const sessionId = options.sessionId ?? 'codex-session-1';
  const rolloutDir = path.join(baseDir, 'sessions', '2026', '03', '02');
  const rolloutPath = path.join(rolloutDir, `rollout-${sessionId}.jsonl`);

  const lines = [
    JSON.stringify({
      timestamp: '2026-03-02T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: '2026-03-02T10:00:00.000Z',
        cwd: options.cwd ?? '/tmp/codex-project',
        cli_version: '0.126.0',
        source: 'cli',
        model_provider: options.modelProvider ?? 'openai',
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:00:01.000Z',
      type: 'turn_context',
      payload: {
        turn_id: 'turn-1',
        cwd: options.cwd ?? '/tmp/codex-project',
        model: options.model ?? 'gpt-5',
        effort: 'high',
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:05:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          model_context_window: 200000,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:05:30.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 2,
            total_tokens: 127,
          },
          model_context_window: 200000,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-03-02T10:10:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 150,
            cached_input_tokens: 30,
            output_tokens: 10,
            reasoning_output_tokens: 3,
            total_tokens: 193,
          },
          last_token_usage: {
            input_tokens: 50,
            cached_input_tokens: 10,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 66,
          },
          model_context_window: 200000,
        },
      },
    }),
  ];

  fs.mkdirSync(rolloutDir, { recursive: true });
  fs.writeFileSync(rolloutPath, `${lines.join('\n')}\n`, 'utf8');
  return rolloutPath;
}

function appendCodexTokenCount(rolloutPath: string): void {
  fs.appendFileSync(
    rolloutPath,
    `${JSON.stringify({
      timestamp: '2026-03-02T10:15:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 200,
            cached_input_tokens: 40,
            output_tokens: 20,
            reasoning_output_tokens: 5,
            total_tokens: 265,
          },
          last_token_usage: {
            input_tokens: 50,
            cached_input_tokens: 10,
            output_tokens: 10,
            reasoning_output_tokens: 2,
            total_tokens: 72,
          },
          model_context_window: 200000,
        },
      },
    })}\n`,
    'utf8'
  );
}

describe('codex native usage collector', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-native-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function getCacheDir(): string {
    const cacheDir = path.join(tempRoot, 'ccs-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
  }

  it('parses token_count events into raw usage entries and suppresses duplicates', async () => {
    writeCodexRollout(tempRoot);

    const entries = await runWithScopedCcsHome(tempRoot, () =>
      scanCodexNativeUsageEntries({
        env: { CODEX_HOME: tempRoot },
        homeDir: tempRoot,
      })
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sessionId: 'codex-session-1',
      projectPath: '/tmp/codex-project',
      model: 'gpt-5',
      version: '0.126.0',
      target: 'codex',
      inputTokens: 100,
      cacheReadTokens: 20,
      outputTokens: 7,
    });
    expect(entries[1]).toMatchObject({
      inputTokens: 50,
      cacheReadTokens: 10,
      outputTokens: 6,
    });
  });

  it('skips cliproxy-backed codex sessions by default to avoid double counting', async () => {
    writeCodexRollout(tempRoot, { modelProvider: 'cliproxy' });

    const entries = await runWithScopedCcsHome(tempRoot, () =>
      scanCodexNativeUsageEntries({
        env: { CODEX_HOME: tempRoot },
        homeDir: tempRoot,
      })
    );

    expect(entries).toHaveLength(0);
  });

  it('also skips ccs_runtime-backed codex bridge sessions by default', async () => {
    writeCodexRollout(tempRoot, { modelProvider: 'ccs_runtime' });

    const entries = await runWithScopedCcsHome(tempRoot, () =>
      scanCodexNativeUsageEntries({
        env: { CODEX_HOME: tempRoot },
        homeDir: tempRoot,
      })
    );

    expect(entries).toHaveLength(0);
  });

  it('reuses cached rollout entries when file size and mtime are unchanged', async () => {
    const rolloutPath = writeCodexRollout(tempRoot);
    const cacheDir = getCacheDir();
    const stableMtime = new Date('2026-03-02T10:20:00.000Z');
    fs.utimesSync(rolloutPath, stableMtime, stableMtime);

    const firstEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    const cachePath = path.join(cacheDir, 'codex-native-usage-v1.json');
    const originalStats = fs.statSync(rolloutPath);
    const originalCache = readTestUsageCache(cachePath);
    const originalCachedRollout = originalCache.files[rolloutPath];
    expect(originalCachedRollout?.mtimeMs).toBe(originalStats.mtimeMs);

    const originalContent = fs.readFileSync(rolloutPath, 'utf8');
    fs.writeFileSync(rolloutPath, '#'.repeat(originalContent.length), 'utf8');
    fs.utimesSync(rolloutPath, stableMtime, stableMtime);

    const secondEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    expect(secondEntries).toEqual(firstEntries);
  });

  it('reparses a rollout file after its size changes', async () => {
    const rolloutPath = writeCodexRollout(tempRoot);
    const cacheDir = getCacheDir();

    const firstEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    appendCodexTokenCount(rolloutPath);

    const secondEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    expect(firstEntries).toHaveLength(2);
    expect(secondEntries).toHaveLength(3);
    expect(secondEntries[2]).toMatchObject({
      inputTokens: 50,
      cacheReadTokens: 10,
      outputTokens: 12,
    });
  });

  it('falls back to parsing rollout files when the cache file is corrupt', async () => {
    writeCodexRollout(tempRoot);
    const cacheDir = getCacheDir();
    fs.writeFileSync(path.join(cacheDir, 'codex-native-usage-v1.json'), '{not-json', 'utf8');

    const entries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    expect(entries).toHaveLength(2);
  });

  it('keeps default and include-cliproxy cache entries separate', async () => {
    writeCodexRollout(tempRoot, { modelProvider: 'cliproxy' });
    const cacheDir = getCacheDir();

    const defaultEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      cacheDir,
    });

    const includedEntries = await scanCodexNativeUsageEntries({
      env: { CODEX_HOME: tempRoot },
      homeDir: tempRoot,
      includeCliproxySessions: true,
      cacheDir,
    });

    expect(defaultEntries).toHaveLength(0);
    expect(includedEntries).toHaveLength(2);

    const defaultCachePath = path.join(cacheDir, 'codex-native-usage-v1.json');
    const includeCachePath = path.join(cacheDir, 'codex-native-usage-with-cliproxy-v1.json');
    expect(fs.existsSync(defaultCachePath)).toBe(true);
    expect(fs.existsSync(includeCachePath)).toBe(true);

    const defaultCache = readTestUsageCache(defaultCachePath);
    const includeCache = readTestUsageCache(includeCachePath);
    const defaultCachedRollout = defaultCache.files[Object.keys(defaultCache.files)[0] ?? ''];
    const includeCachedRollout = includeCache.files[Object.keys(includeCache.files)[0] ?? ''];

    expect(defaultCache.includeCliproxySessions).toBe(false);
    expect(defaultCachedRollout?.entries).toHaveLength(0);
    expect(includeCache.includeCliproxySessions).toBe(true);
    expect(includeCachedRollout?.entries).toHaveLength(2);
  });
});
