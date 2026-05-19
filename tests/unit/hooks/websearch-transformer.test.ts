import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const hookPath = join(process.cwd(), 'lib', 'hooks', 'websearch-transformer.cjs');

/**
 * Neutralise CCS_PROFILE_TYPE so shouldSkipHook() does not short-circuit
 * when tests run inside a CCS-managed Claude session (where it is 'account').
 */
const NEUTRAL_PROFILE_TYPE = '';
type HookOutput = {
  hookSpecificOutput: {
    additionalContext: string;
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
};

const hook = require('../../../lib/hooks/websearch-transformer.cjs') as {
  buildFailureHookOutput: (
    query: string,
    errors: Array<{ provider: string; error: string }>
  ) => HookOutput;
  buildSuccessHookOutput: (
    query: string,
    providerName: string,
    content: string
  ) => HookOutput;
  classifyDuckDuckGoHtml: (
    html: string,
    count: number
  ) => {
    error?: string;
    kind: 'results' | 'no_results' | 'non_result_html';
    results: Array<{ title: string; url: string; description: string }>;
  };
  extractDuckDuckGoResults: (html: string, count: number) => Array<{
    title: string;
    url: string;
    description: string;
  }>;
  classifyProviderFailure: (result: {
    error?: string;
    retryAfterSec?: number | null;
    statusCode?: number | null;
    success?: boolean;
  }) => Record<string, unknown>;
  formatStructuredSearchResults: (
    query: string,
    providerName: string,
    results: Array<{ title: string; url: string; description: string }>
  ) => string;
  parseRetryAfterSeconds: (rawValue: string) => number | null;
  trySearxngSearch: (query: string, timeoutSec?: number) => Promise<{
    content?: string;
    error?: string;
    statusCode?: number;
    success: boolean;
  }>;
};

function runHookWithMockedFetch(mode: 'success' | 'empty' | 'non-result' | 'failure') {
  const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-'));
  const preloadPath = join(tempDir, 'mock-fetch.cjs');
  const successHtml = `
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
    <a class="result__snippet">Example snippet</a>
  `.trim();
  const emptyHtml = `
    <span class="no-results">
      <div class="no-results__message">
        <h1>No results found for <strong>btc price</strong></h1>
      </div>
    </span>
  `.trim();
  const nonResultHtml = `
    <html>
      <body>
        <form action="/anomaly.js" method="post">
          <input type="hidden" name="q" value="btc price" />
        </form>
      </body>
    </html>
  `.trim();
  const preloadScript =
    mode === 'success'
      ? `global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => ${JSON.stringify(successHtml)} });\n`
      : mode === 'empty'
        ? `global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => ${JSON.stringify(emptyHtml)} });\n`
        : mode === 'non-result'
          ? `global.fetch = async () => ({ ok: true, status: 202, headers: { get: () => null }, text: async () => ${JSON.stringify(nonResultHtml)} });\n`
          : `global.fetch = async () => ({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'Service unavailable' });\n`;

  writeFileSync(preloadPath, preloadScript, 'utf8');

  try {
    return spawnSync('node', ['-r', preloadPath, hookPath], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'WebSearch',
        tool_input: { query: 'btc price' },
      }),
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_SEARXNG: '0',
        CCS_WEBSEARCH_TAVILY: '0',
      },
    });
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

describe('websearch-transformer legacy CLI safety', () => {
  it('does not enable shell execution for query-derived legacy CLI prompts', () => {
    const source = readFileSync(hookPath, 'utf8');

    expect(source).not.toContain('shell: isWindows');
    expect(source.match(/shell: false/g) || []).toHaveLength(3);
  });
});

describe('websearch-transformer hook helpers', () => {
  it('parses Retry-After seconds and HTTP dates', () => {
    expect(hook.parseRetryAfterSeconds('2')).toBe(2);
    expect(
      hook.parseRetryAfterSeconds(new Date(Date.now() + 2000).toUTCString())
    ).toBeGreaterThanOrEqual(1);
    expect(hook.parseRetryAfterSeconds('invalid')).toBeNull();
  });

  it('classifies quota exhaustion and short rate limits into the correct provider policy', () => {
    expect(
      hook.classifyProviderFailure({
        success: false,
        statusCode: 429,
        error: 'Exa returned 429: quota exceeded for current plan',
      })
    ).toMatchObject({
      kind: 'cooldown',
      reason: 'quota_exhausted',
      cooldownSec: 900,
    });

    expect(
      hook.classifyProviderFailure({
        success: false,
        statusCode: 429,
        retryAfterSec: 2,
        error: 'Brave Search returned 429: rate limit exceeded',
      })
    ).toMatchObject({
      kind: 'retry',
      reason: 'rate_limited_short_backoff',
      delayMs: 2000,
      retryAfterSec: 2,
    });
  });

  it('queries SearXNG JSON endpoint and formats structured results', async () => {
    const originalFetch = global.fetch;
    const originalEnv = {
      CCS_WEBSEARCH_SEARXNG_MAX_RESULTS: process.env.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS,
      CCS_WEBSEARCH_SEARXNG_URL: process.env.CCS_WEBSEARCH_SEARXNG_URL,
    };
    const requests: string[] = [];

    process.env.CCS_WEBSEARCH_SEARXNG_URL = 'https://search.example.com/search/';
    process.env.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS = '3';
    global.fetch = async (url) => {
      requests.push(String(url));
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'SearXNG Result',
              url: 'https://example.com/searxng',
              content: 'Result snippet',
            },
          ],
        }),
      } as Response;
    };

    try {
      const result = await hook.trySearxngSearch('btc price', 1);
      expect(result.success).toBe(true);
      expect(result.content).toContain('Provider: SearXNG');
      expect(result.content).toContain('URL: https://example.com/searxng');
      expect(requests).toEqual(['https://search.example.com/search?q=btc+price&format=json']);
    } finally {
      global.fetch = originalFetch;
      if (originalEnv.CCS_WEBSEARCH_SEARXNG_URL === undefined) {
        delete process.env.CCS_WEBSEARCH_SEARXNG_URL;
      } else {
        process.env.CCS_WEBSEARCH_SEARXNG_URL = originalEnv.CCS_WEBSEARCH_SEARXNG_URL;
      }

      if (originalEnv.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS === undefined) {
        delete process.env.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS;
      } else {
        process.env.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS =
          originalEnv.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS;
      }
    }
  });

  it('rejects SearXNG URLs that include query parameters', async () => {
    const originalUrl = process.env.CCS_WEBSEARCH_SEARXNG_URL;

    process.env.CCS_WEBSEARCH_SEARXNG_URL = 'https://search.example.com/search?format=json';

    try {
      const result = await hook.trySearxngSearch('btc price', 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid or not configured');
    } finally {
      if (originalUrl === undefined) {
        delete process.env.CCS_WEBSEARCH_SEARXNG_URL;
      } else {
        process.env.CCS_WEBSEARCH_SEARXNG_URL = originalUrl;
      }
    }
  });

  it('rejects credential-bearing SearXNG URLs', async () => {
    const originalUrl = process.env.CCS_WEBSEARCH_SEARXNG_URL;

    process.env.CCS_WEBSEARCH_SEARXNG_URL = 'https://user:pass@search.example.com';

    try {
      const result = await hook.trySearxngSearch('btc price', 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid or not configured');
    } finally {
      if (originalUrl === undefined) {
        delete process.env.CCS_WEBSEARCH_SEARXNG_URL;
      } else {
        process.env.CCS_WEBSEARCH_SEARXNG_URL = originalUrl;
      }
    }
  });

  it('marks SearXNG format-disabled 403 responses as non-retryable failures', async () => {
    const originalFetch = global.fetch;
    const originalUrl = process.env.CCS_WEBSEARCH_SEARXNG_URL;

    process.env.CCS_WEBSEARCH_SEARXNG_URL = 'https://search.example.com';
    global.fetch = async () =>
      ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: async () => 'format=json disabled by this instance',
      }) as Response;

    try {
      const result = await hook.trySearxngSearch('btc price', 1);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.error).toContain('format=json is disabled');
      expect(hook.classifyProviderFailure(result)).toMatchObject({
        kind: 'fail',
        reason: 'non_retryable',
      });
    } finally {
      global.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.CCS_WEBSEARCH_SEARXNG_URL;
      } else {
        process.env.CCS_WEBSEARCH_SEARXNG_URL = originalUrl;
      }
    }
  });

  it('extracts DuckDuckGo results and unwraps uddg redirect URLs', () => {
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
      <a class="result__a" href="https://second.example.com/post">Second title</a>
      <a class="result__snippet">Second snippet</a>
    `;

    const results = hook.extractDuckDuckGoResults(html, 2);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Example title',
      url: 'https://example.com/article',
      description: 'Example snippet',
    });
    expect(results[1]).toEqual({
      title: 'Second title',
      url: 'https://second.example.com/post',
      description: 'Second snippet',
    });
  });

  it('distinguishes legitimate DuckDuckGo zero-result pages from unusable HTML', () => {
    const emptyPage = `
      <span class="no-results">
        <div class="no-results__message">
          <h1>No results found for <strong>btc price</strong></h1>
        </div>
      </span>
    `;
    const nonResultPage = `
      <html>
        <body>
          <form action="/anomaly.js" method="post">
            <input type="hidden" name="q" value="btc price" />
          </form>
        </body>
      </html>
    `;

    expect(hook.classifyDuckDuckGoHtml(emptyPage, 5)).toEqual({
      kind: 'no_results',
      results: [],
    });
    expect(hook.classifyDuckDuckGoHtml(nonResultPage, 5)).toEqual({
      kind: 'non_result_html',
      results: [],
      error: 'DuckDuckGo returned non-result HTML response (possible anti-bot/challenge page)',
    });
  });

  it('formats structured search results for hook deny output', () => {
    const formatted = hook.formatStructuredSearchResults('ccs websearch', 'DuckDuckGo', [
      {
        title: 'Result title',
        url: 'https://example.com',
        description: 'Result snippet',
      },
    ]);

    expect(formatted).toContain('CCS local WebSearch evidence');
    expect(formatted).toContain('Provider: DuckDuckGo');
    expect(formatted).toContain('Query: "ccs websearch"');
    expect(formatted).toContain('Result count: 1');
    expect(formatted).toContain('1. Result title');
    expect(formatted).toContain('URL: https://example.com');
    expect(formatted).toContain('Snippet: Result snippet');
    expect(formatted).not.toContain('Use these results to answer the user directly.');
  });

  it('builds a structured success hook output with short deny reason and additional context', () => {
    const output = hook.buildSuccessHookOutput(
      'btc price',
      'Exa',
      'CCS local WebSearch evidence\nProvider: Exa'
    );

    expect(output.hookSpecificOutput).toEqual({
      additionalContext: 'CCS local WebSearch evidence\nProvider: Exa',
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'CCS already retrieved WebSearch results locally via Exa. Use the provided context instead of calling native WebSearch for "btc price".',
    });
    expect(output).not.toHaveProperty('decision');
    expect(output).not.toHaveProperty('reason');
    expect(output).not.toHaveProperty('additionalContext');
  });

  it('builds a concise failure hook output with provider failure details in additional context', () => {
    const output = hook.buildFailureHookOutput('btc price', [
      { provider: 'Exa', error: 'Exa timed out' },
      { provider: 'DuckDuckGo', error: 'DuckDuckGo returned 503' },
    ]);

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toBe(
      'CCS could not complete local WebSearch for "btc price". Native WebSearch is unavailable for this profile.'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'Attempted providers: Exa: Exa timed out'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'DuckDuckGo: DuckDuckGo returned 503'
    );
  });

  it('emits runtime success output with additionalContext nested under hookSpecificOutput', () => {
    const result = runHookWithMockedFetch('success');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'CCS local WebSearch evidence'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'URL: https://example.com/article'
    );
    expect(output).not.toHaveProperty('additionalContext');
  });

  it('falls back from SearXNG parse errors to DuckDuckGo in provider order', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-searxng-fallback-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const requestLogPath = join(tempDir, 'requests.json');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fddg">Duck title</a>
      <a class="result__snippet">Duck snippet</a>
    `.trim();

    writeFileSync(
      preloadPath,
      `
const fs = require('fs');
const requestLogPath = ${JSON.stringify(requestLogPath)};
const html = ${JSON.stringify(html)};
function record(url) {
  const requests = fs.existsSync(requestLogPath)
    ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8'))
    : [];
  requests.push(String(url));
  fs.writeFileSync(requestLogPath, JSON.stringify(requests), 'utf8');
}
global.fetch = async (url) => {
  const resolved = String(url);
  record(resolved);
  if (resolved.includes('/search?')) {
    return {
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => html,
  };
};
      `.trimStart(),
      'utf8'
    );

    try {
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '1',
          CCS_WEBSEARCH_EXA: '0',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_SEARXNG: '1',
          CCS_WEBSEARCH_SEARXNG_URL: 'https://search.example.com',
          CCS_WEBSEARCH_TAVILY: '0',
        },
      });

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout.trim()) as HookOutput;
      expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');

      const requests = JSON.parse(readFileSync(requestLogPath, 'utf8')) as string[];
      expect(requests[0]).toContain('search.example.com/search?');
      expect(requests[1]).toContain('duckduckgo.com');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves genuine DuckDuckGo zero-result pages as successful empty searches', () => {
    const result = runHookWithMockedFetch('empty');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');
    expect(output.hookSpecificOutput.additionalContext).toContain('Result count: 0');
    expect(output.hookSpecificOutput.additionalContext).toContain('No results found.');
  });

  it('emits runtime failure output with attempted provider details nested under hookSpecificOutput', () => {
    const result = runHookWithMockedFetch('failure');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      'Native WebSearch is unavailable for this profile.'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'CCS local WebSearch failed for "btc price".'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'Attempted providers: DuckDuckGo: DuckDuckGo returned 503'
    );
    expect(output).not.toHaveProperty('additionalContext');
  });

  it('treats DuckDuckGo non-result HTML as provider failure instead of fake empty results', () => {
    const result = runHookWithMockedFetch('non-result');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'Attempted providers: DuckDuckGo: DuckDuckGo returned non-result HTML response'
    );
    expect(output.hookSpecificOutput.additionalContext).not.toContain('Result count: 0');
  });

  it('writes opt-in trace records with redacted query fingerprints', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-trace-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const ccsHome = join(tempDir, 'home');
    const tracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
    `.trim();

    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    try {
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_HOME: ccsHome,
          CCS_WEBSEARCH_TRACE: '1',
          CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'hook-trace-test',
          CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '1',
          CCS_WEBSEARCH_EXA: '0',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_TAVILY: '0',
        },
      });

      expect(result.status).toBe(0);

      const traceContents = readFileSync(tracePath, 'utf8');
      expect(traceContents).not.toContain('btc price');

      const traceEvents = traceContents
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(traceEvents.some((event) => event.event === 'websearch_hook_invoked')).toBe(true);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_attempt' && event.providerName === 'DuckDuckGo'
        )
      ).toBe(true);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_success' && event.providerName === 'DuckDuckGo'
        )
      ).toBe(true);
      const fingerprintEvent = traceEvents.find(
        (event) => event.event === 'websearch_hook_invoked'
      ) as { queryHash?: string; queryLength?: number } | undefined;
      expect(fingerprintEvent?.queryHash).toBeString();
      expect(fingerprintEvent?.queryLength).toBe(9);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('falls back to the default trace file when CCS_WEBSEARCH_TRACE_FILE points outside safe paths', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-trace-safe-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const ccsHome = join(tempDir, 'home');
    const fallbackTracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');
    // disallowedTracePath MUST NOT start with any safe prefix (tmpdir(),
    // /var/log, or <CCS_HOME>/.ccs/logs). Anchoring under cwd or homedir
    // is unsafe in CI/Bun-test environments where those paths can fall
    // under /tmp (CI runner workspace) or under tmpdir (Bun's HOME
    // isolation), which would falsely satisfy the tmpdir prefix. Use a
    // root-anchored path outside every safe prefix so the hook MUST
    // reject it. The hook writes via try/catch; a permission denial here
    // also leaves the file absent.
    const disallowedTracePath = '/etc/ccs-test-disallowed-websearch-trace-' + Date.now() + '.jsonl';
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
    `.trim();

    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    try {
      rmSync(disallowedTracePath, { force: true });
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_HOME: ccsHome,
          CCS_WEBSEARCH_TRACE: '1',
          CCS_WEBSEARCH_TRACE_FILE: disallowedTracePath,
          CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'hook-trace-safe-test',
          CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '1',
          CCS_WEBSEARCH_EXA: '0',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_TAVILY: '0',
        },
      });

      expect(result.status).toBe(0);
      expect(existsSync(disallowedTracePath)).toBe(false);
      expect(existsSync(fallbackTracePath)).toBe(true);
    } finally {
      rmSync(disallowedTracePath, { force: true });
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('applies provider cooldown on quota exhaustion and falls back to the next backend', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-quota-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const requestLogPath = join(tempDir, 'requests.json');
    const ccsHome = join(tempDir, 'home');
    const statePath = join(ccsHome, '.ccs', 'cache', 'websearch-provider-state.json');
    const tracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Fallback title</a>
      <a class="result__snippet">Fallback snippet</a>
    `.trim();

    writeFileSync(
      preloadPath,
      `
const fs = require('fs');
const requestLogPath = ${JSON.stringify(requestLogPath)};
const html = ${JSON.stringify(html)};
function record(url) {
  const requests = fs.existsSync(requestLogPath)
    ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8'))
    : [];
  requests.push(String(url));
  fs.writeFileSync(requestLogPath, JSON.stringify(requests), 'utf8');
}
global.fetch = async (url) => {
  const resolvedUrl = String(url);
  record(resolvedUrl);
  if (resolvedUrl.includes('api.exa.ai')) {
    return {
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => 'quota exceeded for current plan',
    };
  }
  return {
    ok: true,
    headers: { get: () => null },
    text: async () => html,
  };
};
      `.trimStart(),
      'utf8'
    );

    try {
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_HOME: ccsHome,
          CCS_WEBSEARCH_TRACE: '1',
          CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'quota-fallback-test',
          CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '1',
          CCS_WEBSEARCH_EXA: '1',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_TAVILY: '0',
          EXA_API_KEY: 'exa-test-key',
        },
      });

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout.trim()) as HookOutput;
      expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');

      const providerState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        cooldowns?: Record<string, { reason?: string; until?: number }>;
      };
      expect(providerState.cooldowns?.exa?.reason).toBe('quota_exhausted');
      expect(providerState.cooldowns?.exa?.until).toBeGreaterThan(Date.now());

      const traceEvents = readFileSync(tracePath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_cooldown_applied' &&
            event.providerId === 'exa' &&
            event.reason === 'quota_exhausted'
        )
      ).toBe(true);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_success' &&
            event.providerId === 'duckduckgo'
        )
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('skips providers that are already cooling down on later WebSearch calls', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-cooldown-skip-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const requestLogPath = join(tempDir, 'requests.json');
    const ccsHome = join(tempDir, 'home');
    const statePath = join(ccsHome, '.ccs', 'cache', 'websearch-provider-state.json');
    const tracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fcooldown">Cooldown title</a>
      <a class="result__snippet">Cooldown snippet</a>
    `.trim();

    mkdirSync(join(ccsHome, '.ccs', 'cache'), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          cooldowns: {
            exa: {
              until: Date.now() + 10 * 60 * 1000,
              reason: 'quota_exhausted',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );
    writeFileSync(
      preloadPath,
      `
const fs = require('fs');
const requestLogPath = ${JSON.stringify(requestLogPath)};
const html = ${JSON.stringify(html)};
function record(url) {
  const requests = fs.existsSync(requestLogPath)
    ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8'))
    : [];
  requests.push(String(url));
  fs.writeFileSync(requestLogPath, JSON.stringify(requests), 'utf8');
}
global.fetch = async (url) => {
  record(url);
  return {
    ok: true,
    headers: { get: () => null },
    text: async () => html,
  };
};
      `.trimStart(),
      'utf8'
    );

    try {
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_HOME: ccsHome,
          CCS_WEBSEARCH_TRACE: '1',
          CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'cooldown-skip-test',
          CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '1',
          CCS_WEBSEARCH_EXA: '1',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_TAVILY: '0',
          EXA_API_KEY: 'exa-test-key',
        },
      });

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout.trim()) as HookOutput;
      expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');

      const requests = JSON.parse(readFileSync(requestLogPath, 'utf8')) as string[];
      expect(requests.some((url) => url.includes('api.exa.ai'))).toBe(false);

      const traceEvents = readFileSync(tracePath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_cooldown_skip' &&
            event.providerId === 'exa' &&
            event.cooldownReason === 'quota_exhausted'
        )
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retries transient backend failures once before succeeding', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-retry-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const requestLogPath = join(tempDir, 'requests.json');
    const ccsHome = join(tempDir, 'home');
    const tracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');

    writeFileSync(
      preloadPath,
      `
const fs = require('fs');
const requestLogPath = ${JSON.stringify(requestLogPath)};
let exaAttempts = 0;
function record(url) {
  const requests = fs.existsSync(requestLogPath)
    ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8'))
    : [];
  requests.push(String(url));
  fs.writeFileSync(requestLogPath, JSON.stringify(requests), 'utf8');
}
global.fetch = async (url) => {
  const resolvedUrl = String(url);
  record(resolvedUrl);
  exaAttempts += 1;
  if (exaAttempts === 1) {
    return {
      ok: false,
      status: 503,
      headers: { get: () => null },
      text: async () => 'service unavailable',
    };
  }
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      results: [
        {
          title: 'Exa title',
          url: 'https://example.com/exa',
          text: 'Exa snippet',
        },
      ],
    }),
  };
};
      `.trimStart(),
      'utf8'
    );

    try {
      const result = spawnSync('node', ['-r', preloadPath, hookPath], {
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'WebSearch',
          tool_input: { query: 'btc price' },
        }),
        env: {
          ...process.env,
          CCS_PROFILE_TYPE: NEUTRAL_PROFILE_TYPE,
          CCS_HOME: ccsHome,
          CCS_WEBSEARCH_TRACE: '1',
          CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'transient-retry-test',
          CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
          CCS_WEBSEARCH_ENABLED: '1',
          CCS_WEBSEARCH_SKIP: '0',
          CCS_WEBSEARCH_BRAVE: '0',
          CCS_WEBSEARCH_DUCKDUCKGO: '0',
          CCS_WEBSEARCH_EXA: '1',
          CCS_WEBSEARCH_GEMINI: '0',
          CCS_WEBSEARCH_GROK: '0',
          CCS_WEBSEARCH_OPENCODE: '0',
          CCS_WEBSEARCH_TAVILY: '0',
          EXA_API_KEY: 'exa-test-key',
        },
      });

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout.trim()) as HookOutput;
      expect(output.hookSpecificOutput.additionalContext).toContain('Provider: Exa');

      const requests = JSON.parse(readFileSync(requestLogPath, 'utf8')) as string[];
      expect(requests.filter((url) => url.includes('api.exa.ai'))).toHaveLength(2);

      const traceEvents = readFileSync(tracePath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_retry_scheduled' &&
            event.providerId === 'exa' &&
            event.reason === 'transient_failure'
        )
      ).toBe(true);
      expect(
        traceEvents.some(
          (event) =>
            event.event === 'websearch_provider_success' && event.providerId === 'exa'
        )
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
