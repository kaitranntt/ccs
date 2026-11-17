import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { resolveWebSearchLaunchState } from '../../../src/utils/websearch/launch-state';
import { getWebSearchCliProviders } from '../../../src/utils/websearch/status';

const serverPath = resolve('lib/mcp/ccs-websearch-server.cjs');
const hookPath = resolve('lib/hooks/websearch-transformer.cjs');
const sourceUrl = 'https://docs.example.org/guide?version=2#sources';

// Use a fresh child and an allowlisted environment so no real account keys or
// home state can enter provider requests. The preload is the existing Node
// fetch test-double seam used by other WebSearch MCP tests.
describe('Parallel through managed WebSearch', () => {
  let home: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ccs-parallel-test-'));
    originalHome = process.env.CCS_HOME;
    process.env.CCS_HOME = home;
    mkdirSync(join(home, '.ccs'));
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  function launch(
    options: {
      parallel?: boolean;
      enabled?: boolean;
      url?: string;
      count?: number;
      duckduckgo?: boolean;
      searxng?: boolean;
    } = {}
  ) {
    writeFileSync(
      join(home, '.ccs', 'config.yaml'),
      JSON.stringify({
        version: 12,
        websearch: {
          enabled: options.enabled ?? true,
          providers: {
            parallel:
              options.parallel === undefined
                ? undefined
                : {
                    enabled: options.parallel,
                    url: options.url ?? 'https://mcp.parallel.ai/mcp',
                    max_results: options.count ?? 2,
                  },
            duckduckgo: { enabled: options.duckduckgo ?? true },
            searxng: { enabled: options.searxng ?? false, url: 'https://search.example.org' },
          },
        },
      })
    );
    return resolveWebSearchLaunchState();
  }

  function run(
    mode: string,
    state = launch({ parallel: true }),
    profile = 'settings',
    timeout = false
  ) {
    const requestsPath = join(home, 'requests.jsonl');
    const preload = join(home, 'fetch.cjs');
    writeFileSync(
      preload,
      `
const fs = require('fs');
global.fetch = async (url, options) => {
  fs.appendFileSync(${JSON.stringify(requestsPath)}, JSON.stringify({
    url: String(url), headers: options.headers, body: options.body ? JSON.parse(options.body) : null
  }) + '\\n');
  if (String(url).includes('search.example.org')) return new Response('Unavailable', { status: 400 });
  if (String(url).includes('duckduckgo.com')) return new Response(
    '<a class="result__a" href="https://docs.example.org/fallback">Public docs</a><a class="result__snippet">Fallback evidence</a>'
  );
  const mode = ${JSON.stringify(mode)};
  if (mode === 'timeout') return {
    ok: true, headers: new Headers(),
    text: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
  };
  if (mode === 'http') return new Response('rate limited', { status: 429, headers: { 'Retry-After': '120' } });
  const data = { results: mode === 'empty' ? [] : [
    { title: 'Public documentation', url: ${JSON.stringify(sourceUrl)}, excerpts: ['Original source excerpt'] },
    { title: 'Unsafe', url: 'javascript:alert(1)', excerpts: [] },
    { title: 'Other docs', url: 'https://docs.example.org/other', excerpts: [] },
    { title: 'Truncated', url: 'https://docs.example.org/extra', excerpts: [] }
  ] };
  const result = mode === 'text' ? { content: [{ type: 'text', text: JSON.stringify(data) }] }
    : mode === 'tool-error' ? { isError: true, content: [{ type: 'text', text: 'Search unavailable' }] }
    : { structuredContent: mode === 'invalid' ? {} : mode === 'bad-urls' ? { results: [{ url: 'file:///private' }] } : data };
  const message = { jsonrpc: '2.0', id: 1, result };
  if (mode === 'rpc-error') { delete message.result; message.error = { code: -32603, message: 'unavailable' }; }
  if (mode === 'sse') return new Response(
    'event: message\\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\\n\\n' +
    'event: message\\ndata: ' + JSON.stringify(message) + '\\n\\n',
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
  return new Response(mode === 'malformed' ? 'not json' : JSON.stringify(message), {
    headers: { 'Content-Type': 'application/json' }
  });
};
`
    );
    const input =
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'WebSearch',
            arguments: { query: 'public documentation sources' },
          },
        },
      ]
        .map((message) => JSON.stringify(message))
        .join('\n') + '\n';
    const args = timeout
      ? [
          '-r',
          preload,
          '-e',
          `require(${JSON.stringify(hookPath)}).runLocalWebSearch('public documentation', 0.01).then(r => console.log(JSON.stringify(r)))`,
        ]
      : ['-r', preload, serverPath];
    const result = spawnSync('node', args, {
      input,
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: process.env.PATH, CCS_HOME: home, CCS_PROFILE_TYPE: profile, ...state.hookEnv },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const messages = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const requests = (() => {
      try {
        return readFileSync(requestsPath, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
      } catch {
        return [];
      }
    })();
    return { messages, requests, result: messages.find((entry) => entry.id === 3)?.result };
  }

  for (const mode of ['structured', 'text', 'sse']) {
    it(`dispatches ${mode} results through the configured provider with original source URLs`, () => {
      const { result, requests } = run(mode);
      expect(result.isError).toBeUndefined();
      const content = result.content[0].text;
      expect(content).toContain('Provider: Parallel');
      expect(content).toContain(`URL: ${sourceUrl}`);
      expect(content).toContain('Original source excerpt');
      expect(content).toContain('Result count: 2');
      expect(content).not.toContain('javascript:');
      expect(content).not.toContain('/extra');
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        url: 'https://mcp.parallel.ai/mcp',
        headers: { 'User-Agent': 'CCS-WebSearch/1.0 (https://github.com/kaitranntt/ccs)' },
        body: {
          method: 'tools/call',
          params: {
            name: 'web_search',
            arguments: {
              search_queries: ['public documentation sources'],
            },
          },
        },
      });
      expect(requests[0].headers.Authorization).toBeUndefined();
    });
  }

  it('selects Parallel when an earlier configured backend fails', () => {
    const { result, requests } = run('structured', launch({ parallel: true, searxng: true }));
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain('search.example.org/search');
    expect(requests[1].url).toBe('https://mcp.parallel.ai/mcp');
    expect(result.content[0].text).toContain(`URL: ${sourceUrl}`);
    expect(result.content[0].text).toContain('Provider: Parallel');
  });

  it('keeps the existing default provider and makes no Parallel requests without opt-in', () => {
    const state = launch();
    expect(state.config.providers?.parallel?.enabled).toBe(false);
    expect(state.hookEnv.CCS_WEBSEARCH_PARALLEL).toBe('0');
    const { result, requests } = run('structured', state);
    expect(result.content[0].text).toContain('Provider: DuckDuckGo');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('duckduckgo.com');
  });

  for (const mode of ['http', 'rpc-error', 'tool-error', 'malformed', 'invalid', 'bad-urls']) {
    it(`uses the existing fallback when Parallel returns ${mode}`, () => {
      const { result, requests } = run(mode);
      expect(requests).toHaveLength(2);
      expect(requests[1].url).toContain('duckduckgo.com');
      expect(result.content[0].text).toContain('Provider: DuckDuckGo');
      expect(result.content[0].text).toContain('URL: https://docs.example.org/fallback');
      if (mode === 'http') {
        const state = JSON.parse(
          readFileSync(join(home, '.ccs/cache/websearch-provider-state.json'), 'utf8')
        );
        expect(state.cooldowns.parallel.reason).toBe('rate_limited');
        expect(state.cooldowns.parallel.until).toBeGreaterThan(Date.now());
      }
    });
  }

  it('reports an empty successful search consistently with the existing backends', () => {
    const { result, requests } = run('empty');
    expect(requests).toHaveLength(1);
    expect(result.content[0].text).toContain('Provider: Parallel');
    expect(result.content[0].text).toContain('No results found.');
  });

  it('bounds response body reads and falls back on timeout', () => {
    const { messages, requests } = run('timeout', undefined, 'settings', true);
    expect(messages[0].providerId).toBe('duckduckgo');
    expect(requests).toHaveLength(3);
    expect(
      requests.slice(0, 2).every((r: { url: string }) => r.url === 'https://mcp.parallel.ai/mcp')
    ).toBe(true);
  });

  for (const profile of ['settings', 'account', 'default']) {
    it(`preserves tool suppression for ${profile} when disabled or native`, () => {
      const { messages, requests, result } = run(
        'structured',
        launch({ parallel: true, enabled: profile !== 'settings' }),
        profile
      );
      expect(messages.find((entry) => entry.id === 2).result.tools).toEqual([]);
      expect(result.isError).toBe(true);
      expect(requests).toHaveLength(0);
    });
  }

  it('returns the normal MCP error when no enabled provider succeeds', () => {
    const { result, requests } = run('tool-error', launch({ parallel: true, duckduckgo: false }));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('CCS local WebSearch failed');
    expect(requests).toHaveLength(1);
  });

  it('marks an invalid endpoint unavailable in both launch and readiness', () => {
    const state = launch({ parallel: true, url: 'https://user:secret@mcp.parallel.ai/mcp' });
    expect(state.hookEnv.CCS_WEBSEARCH_PARALLEL).toBe('0');
    const provider = getWebSearchCliProviders(state.config, { probeDisabled: false }).find(
      (p) => p.id === 'parallel'
    );
    expect(provider?.available).toBe(false);
    const { requests } = run('structured', state);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('duckduckgo.com');
  });
});
