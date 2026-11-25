import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { getCcsDir } from '../../src/utils/config-manager';
import { resolveModelsDevPricing } from '../../src/web-server/models-dev/pricing-resolver';
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
    const fetchImpl = (async () =>
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
      )) as unknown as typeof fetch;

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

    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const registry = await refreshModelsDevRegistry({
      force: true,
      fetchImpl,
      now: () => 1_000_000_000,
    });

    expect(registry?.openai.models?.['gpt-5.5']?.cost?.output).toBe(30);
  });

  it('filters malformed model entries before caching remote payloads', async () => {
    const fetchImpl = (async () =>
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
      )) as unknown as typeof fetch;

    const registry = await refreshModelsDevRegistry({
      force: true,
      fetchImpl,
      now: () => 123,
    });

    expect(registry?.openai.models?.['gpt-5.5']?.cost?.input).toBe(5);
    expect(registry?.openai.models?.['null-entry']).toBeUndefined();
    expect(registry?.openai.models?.['string-entry']).toBeUndefined();
    expect(
      getCachedModelsDevRegistry({ allowStale: true })?.openai.models?.['null-entry']
    ).toBeUndefined();
    expect(
      getCachedModelsDevRegistry({ allowStale: true })?.openai.models?.['string-entry']
    ).toBeUndefined();
  });

  it('ignores malformed cache files', () => {
    fs.mkdirSync(getCcsDir(), { recursive: true });
    fs.writeFileSync(path.join(getCcsDir(), 'models-dev-registry-cache.json'), '{not json');
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
  });

  it('reads an unchanged registry once across repeated pricing lookups', () => {
    setCachedModelsDevRegistry({ openai: { id: 'openai', models: { test: { id: 'test' } } } });
    const filePath = path.join(getCcsDir(), 'models-dev-registry-cache.json');
    const read = spyOn(fs, 'readFileSync');
    try {
      for (let index = 0; index < 1_000; index++) {
        expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
      }
      expect(read.mock.calls.filter(([file]) => file === filePath)).toHaveLength(1);
    } finally {
      read.mockRestore();
    }
  });

  it('checks freshness even when the normalized registry is already in memory', () => {
    setCachedModelsDevRegistry({ openai: { id: 'openai', models: { test: { id: 'test' } } } }, 1);
    expect(getCachedModelsDevRegistry({ now: 1 })).not.toBeNull();
    expect(getCachedModelsDevRegistry({ now: 86_400_002 })).toBeNull();
    expect(getCachedModelsDevRegistry({ now: 86_400_002, allowStale: true })).not.toBeNull();
  });

  it('reuses model indexes and resolves fresh prices after a registry replacement', () => {
    const model = { id: 'lookup-test', cost: { input: 1, output: 2 } };
    setCachedModelsDevRegistry({ openai: { id: 'openai', models: { 'Lookup-Test': model } } });
    expect(
      resolveModelsDevPricing('lookup-test', { provider: 'codex' })?.pricing.inputPerMillion
    ).toBe(1);
    expect(
      resolveModelsDevPricing('LOOKUP-TEST', { provider: 'codex' })?.pricing.outputPerMillion
    ).toBe(2);
    setCachedModelsDevRegistry({
      openai: {
        id: 'openai',
        models: { 'Lookup-Test': { ...model, cost: { input: 3, output: 4 } } },
      },
    });
    expect(
      resolveModelsDevPricing('lookup-test', { provider: 'codex' })?.pricing.inputPerMillion
    ).toBe(3);
  });

  it('reloads external replacements and never serves a deleted or malformed file', () => {
    const providers = { openai: { id: 'openai', models: { test: { id: 'test' } } } };
    setCachedModelsDevRegistry(providers, 1);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
    const filePath = path.join(getCcsDir(), 'models-dev-registry-cache.json');
    const replacement = `${filePath}.replacement`;
    fs.writeFileSync(
      replacement,
      JSON.stringify({
        version: 1,
        fetchedAt: 2,
        providers: { other: { ...providers.openai, id: 'other' } },
      })
    );
    fs.renameSync(replacement, filePath);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.other.id).toBe('other');
    fs.writeFileSync(filePath, '{bad');
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
    fs.unlinkSync(filePath);
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
    setCachedModelsDevRegistry(providers, 3);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
  });

  it('invalidates writes and keeps the memoized snapshot scoped to the active CCS home', () => {
    const providers = { openai: { id: 'openai', models: { test: { id: 'test' } } } };
    setCachedModelsDevRegistry(providers, 1);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
    setCachedModelsDevRegistry({ other: { ...providers.openai, id: 'other' } }, 2);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.other.id).toBe('other');
    process.env.CCS_HOME = path.join(tempRoot, 'second');
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
    setCachedModelsDevRegistry(providers, 3);
    expect(getCachedModelsDevRegistry({ allowStale: true })?.openai.id).toBe('openai');
    process.env.CCS_HOME = tempRoot;
    expect(getCachedModelsDevRegistry({ allowStale: true })?.other.id).toBe('other');
    clearModelsDevRegistryCache();
    expect(getCachedModelsDevRegistry({ allowStale: true })).toBeNull();
  });

  it('starts and coalesces background refreshes without requiring callers to await', async () => {
    let fetchCalls = 0;
    let resolveResponse: (response: Response) => void = () => undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return responsePromise;
    }) as unknown as typeof fetch;

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
