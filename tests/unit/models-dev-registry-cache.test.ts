import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getCcsDir } from '../../src/utils/config-manager';
import {
  clearModelsDevRegistryCache,
  getCachedModelsDevRegistry,
  refreshModelsDevRegistry,
  setCachedModelsDevRegistry,
  startModelsDevRegistryRefresh,
} from '../../src/web-server/models-dev/registry-cache';

describe('models.dev registry cache', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-models-dev-cache-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
    clearModelsDevRegistryCache();
  });

  afterEach(() => {
    clearModelsDevRegistryCache();
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('normalizes and stores provider-keyed models.dev payloads', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: 'openai',
            name: 'OpenAI',
            models: {
              'gpt-5.5': { id: 'gpt-5.5', cost: { input: 5, output: 30 } },
            },
          },
          ignored: { id: 'ignored' },
        }),
        { status: 200 }
      );

    const registry = await refreshModelsDevRegistry({
      force: true,
      fetchImpl,
      now: () => 123,
    });

    expect(registry?.openai.models?.['gpt-5.5']?.cost?.input).toBe(5);
    expect(getCachedModelsDevRegistry({ allowStale: false, now: 123 })?.openai.id).toBe('openai');
  });

  it('uses stale cache when live refresh fails', async () => {
    setCachedModelsDevRegistry(
      {
        openai: {
          id: 'openai',
          models: {
            'gpt-5.5': { id: 'gpt-5.5', cost: { input: 5, output: 30 } },
          },
        },
      },
      1
    );

    const fetchImpl: typeof fetch = async () => {
      throw new Error('offline');
    };

    const registry = await refreshModelsDevRegistry({
      force: true,
      fetchImpl,
      now: () => 1_000_000_000,
    });

    expect(registry?.openai.models?.['gpt-5.5']?.cost?.output).toBe(30);
  });

  it('filters malformed model entries before caching remote payloads', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: 'openai',
            models: {
              'null-entry': null,
              'string-entry': 'bad',
              'gpt-5.5': { id: 'gpt-5.5', cost: { input: 5, output: 30 } },
            },
          },
        }),
        { status: 200 }
      );

    const registry = await refreshModelsDevRegistry({
      force: true,
      fetchImpl,
      now: () => 123,
    });

    expect(registry?.openai.models?.['gpt-5.5']?.cost?.input).toBe(5);
    expect(registry?.openai.models?.['null-entry']).toBeUndefined();
    expect(registry?.openai.models?.['string-entry']).toBeUndefined();
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.models?.['null-entry']).toBeUndefined();
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.models?.['string-entry']).toBeUndefined();
  });

  it('ignores malformed cache files', () => {
    fs.mkdirSync(getCcsDir(), { recursive: true });
    fs.writeFileSync(path.join(getCcsDir(), 'models-dev-registry-cache.json'), '{not json');
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
  });

  it('starts and coalesces background refreshes without requiring callers to await', async () => {
    let fetchCalls = 0;
    let resolveResponse: (response: Response) => void = () => undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      return responsePromise;
    };

    const first = startModelsDevRegistryRefresh({
      force: true,
      fetchImpl,
      now: () => 456,
    });
    const second = startModelsDevRegistryRefresh({
      force: true,
      fetchImpl,
      now: () => 789,
    });

    expect(first).toBe(second);
    expect(fetchCalls).toBe(1);
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();

    resolveResponse(
      new Response(
        JSON.stringify({
          openai: {
            id: 'openai',
            models: {
              'gpt-5.5': { id: 'gpt-5.5', cost: { input: 5, output: 30 } },
            },
          },
        }),
        { status: 200 }
      )
    );

    await first;
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
  });
});
