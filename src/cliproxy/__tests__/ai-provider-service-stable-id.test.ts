import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

function getCliproxyConfigPath(homeDir: string): string {
  return path.join(homeDir, '.ccs', 'cliproxy', 'config.yaml');
}

function writeCliproxyConfig(homeDir: string, value: Record<string, unknown>): void {
  const configPath = getCliproxyConfigPath(homeDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, yaml.dump(value), 'utf8');
}

function readCliproxyConfig(homeDir: string): Record<string, any> {
  return (
    (yaml.load(fs.readFileSync(getCliproxyConfigPath(homeDir), 'utf8')) as Record<string, any>) ||
    {}
  );
}

async function loadAiProviderService() {
  return import(`../ai-providers/service?stable-id=${Date.now()}`);
}

describe('ai-provider service stable ids', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-ai-provider-ids-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('backfills and persists stable ids for api-key provider entries', async () => {
    const { listAiProviders } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'gemini-api-key': [{ 'api-key': 'alpha' }, { 'api-key': 'beta' }],
    });

    const listed = await listAiProviders();
    const family = listed.families.find((entry) => entry.id === 'gemini-api-key');

    expect(family).toBeDefined();
    expect(family?.entries).toHaveLength(2);
    expect(family?.entries[0]?.id).toBeTruthy();
    expect(family?.entries[1]?.id).toBeTruthy();
    expect(family?.entries[0]?.id).not.toBe(family?.entries[1]?.id);

    const persisted = readCliproxyConfig(tempHome)['gemini-api-key'] as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.id).toBe(family?.entries[0]?.id);
    expect(persisted[1]?.id).toBe(family?.entries[1]?.id);
  });

  it('updates and deletes api-key entries by stable id while preserving the id', async () => {
    const { updateAiProviderEntry, deleteAiProviderEntry } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'gemini-api-key': [
        { 'api-key': 'alpha', id: 'gemini-a' },
        { 'api-key': 'beta', id: 'gemini-b' },
      ],
    });

    await updateAiProviderEntry('gemini-api-key', 'gemini-a', {
      apiKey: 'gamma',
      baseUrl: 'https://example.test/gemini',
    });

    let persisted = readCliproxyConfig(tempHome)['gemini-api-key'] as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.id).toBe('gemini-a');
    expect(persisted[0]?.['api-key']).toBe('gamma');
    expect(persisted[0]?.['base-url']).toBe('https://example.test/gemini');

    await deleteAiProviderEntry('gemini-api-key', 'gemini-a');

    persisted = readCliproxyConfig(tempHome)['gemini-api-key'] as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe('gemini-b');
  });

  it('keeps legacy numeric index updates working during the route transition', async () => {
    const { updateAiProviderEntry } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'gemini-api-key': [{ 'api-key': 'alpha', id: 'gemini-a' }],
    });

    await updateAiProviderEntry('gemini-api-key', '0', {
      apiKey: 'legacy-index-update',
    });

    const persisted = readCliproxyConfig(tempHome)['gemini-api-key'] as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.id).toBe('gemini-a');
    expect(persisted[0]?.['api-key']).toBe('legacy-index-update');
  });

  it('backfills and preserves stable ids for openai-compatible connectors', async () => {
    const { listAiProviders, updateAiProviderEntry } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'openai-compatibility': [
        {
          name: 'openrouter',
          'base-url': 'https://openrouter.ai/api/v1',
          'api-key-entries': [{ 'api-key': 'sk-openrouter' }],
        },
      ],
    });

    const listed = await listAiProviders();
    const family = listed.families.find((entry) => entry.id === 'openai-compatibility');
    const connectorId = family?.entries[0]?.id;

    expect(connectorId).toBeTruthy();

    await updateAiProviderEntry('openai-compatibility', connectorId!, {
      name: 'openrouter',
      baseUrl: 'https://router.example/v1',
      preserveSecrets: true,
    });

    const persisted = readCliproxyConfig(tempHome)['openai-compatibility'] as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.id).toBe(connectorId);
    expect(persisted[0]?.['base-url']).toBe('https://router.example/v1');
    expect(
      (persisted[0]?.['api-key-entries'] as Array<Record<string, unknown>>)[0]?.['api-key']
    ).toBe('sk-openrouter');
  });

  it('redacts custom headers and URL userinfo in provider list views', async () => {
    const { listAiProviders } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'claude-api-key': [
        {
          id: 'claude-secret-route',
          'api-key': 'sk-ant-provider-secret-1234',
          'base-url': 'https://baseuser:basepass@anthropic.example/v1',
          'proxy-url': 'http://proxyuser:proxypass@example.internal:8080',
          headers: {
            Authorization: 'Bearer HEADER-SECRET-123456',
            'X-API-Key': 'x-api-key-secret-abcdef',
          },
        },
      ],
      'openai-compatibility': [
        {
          id: 'openrouter-secret-route',
          name: 'openrouter',
          'base-url': 'https://routeruser:routerpass@openrouter.example/api/v1',
          headers: {
            Authorization: 'Bearer OPENAI-COMPAT-HEADER-SECRET',
          },
          'api-key-entries': [{ 'api-key': 'sk-openrouter-secret-9999' }],
        },
      ],
    });

    const listed = await listAiProviders();
    const claudeEntry = listed.families.find((entry) => entry.id === 'claude-api-key')?.entries[0];
    const openAiEntry = listed.families.find((entry) => entry.id === 'openai-compatibility')
      ?.entries[0];

    expect(claudeEntry?.baseUrl).toBe('https://***:***@anthropic.example/v1');
    expect(claudeEntry?.proxyUrl).toBe('http://***:***@example.internal:8080/');
    expect(claudeEntry?.headers).toEqual([
      { key: 'Authorization', value: '...3456' },
      { key: 'X-API-Key', value: '...cdef' },
    ]);
    expect(openAiEntry?.baseUrl).toBe('https://***:***@openrouter.example/api/v1');
    expect(openAiEntry?.headers).toEqual([{ key: 'Authorization', value: '...CRET' }]);
  });

  it('preserves stored header and URL secrets when saving unchanged redacted values', async () => {
    const { listAiProviders, updateAiProviderEntry } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'claude-api-key': [
        {
          id: 'claude-secret-route',
          'api-key': 'sk-ant-provider-secret-1234',
          'base-url': 'https://baseuser:basepass@anthropic.example/v1',
          'proxy-url': 'http://proxyuser:proxypass@example.internal:8080',
          headers: {
            Authorization: 'Bearer HEADER-SECRET-123456',
            'X-Project': 'public-routing-context',
          },
        },
      ],
    });

    const listed = await listAiProviders();
    const entry = listed.families.find((family) => family.id === 'claude-api-key')?.entries[0];

    expect(entry).toBeDefined();

    await updateAiProviderEntry('claude-api-key', 'claude-secret-route', {
      apiKey: 'sk-ant-provider-secret-1234',
      baseUrl: entry?.baseUrl,
      proxyUrl: entry?.proxyUrl,
      headers: entry?.headers,
      preserveSecrets: true,
    });

    const persisted = readCliproxyConfig(tempHome)['claude-api-key'] as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.['base-url']).toBe('https://baseuser:basepass@anthropic.example/v1');
    expect(persisted[0]?.['proxy-url']).toBe('http://proxyuser:proxypass@example.internal:8080');
    expect(persisted[0]?.headers).toEqual({
      Authorization: 'Bearer HEADER-SECRET-123456',
      'X-Project': 'public-routing-context',
    });
  });

  it('normalizes plain openai-compatible model rules without aliases', async () => {
    const { listAiProviders } = await loadAiProviderService();

    writeCliproxyConfig(tempHome, {
      'openai-compatibility': [
        {
          name: 'openrouter',
          'base-url': 'https://openrouter.ai/api/v1',
          'api-key-entries': [{ 'api-key': 'sk-openrouter' }],
          models: [{ name: 'gpt-4o-mini' }, null, { name: 42 }],
        },
      ],
    });

    const listed = await listAiProviders();
    const family = listed.families.find((entry) => entry.id === 'openai-compatibility');

    expect(family?.entries[0]?.models).toEqual([{ name: 'gpt-4o-mini', alias: '' }]);
  });
});
