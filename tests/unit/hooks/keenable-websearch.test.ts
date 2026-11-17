import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const hookPath = join(process.cwd(), 'lib', 'hooks', 'websearch-transformer.cjs');

type HookOutput = {
  hookSpecificOutput: {
    additionalContext: string;
    permissionDecision: string;
  };
};

type RecordedRequest = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
};

type KeenableMode = 'success' | 'error';

function runHook(mode: KeenableMode, env: Record<string, string>) {
  const tempDir = mkdtempSync(join(tmpdir(), 'websearch-keenable-'));
  const preloadPath = join(tempDir, 'mock-fetch.cjs');
  const requestLogPath = join(tempDir, 'requests.json');
  const ccsHome = join(tempDir, 'home');
  const keenableBody = {
    query: 'bun test runner',
    results: [
      {
        title: 'Test runner | Bun Docs',
        url: 'https://bun.com/docs/test',
        description: '',
        snippet: 'Bun ships with a fast, built-in, Jest-compatible test runner.',
      },
    ],
  };
  const ddgHtml = `
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Ffallback">Fallback title</a>
    <a class="result__snippet">Fallback snippet</a>
  `.trim();

  writeFileSync(
    preloadPath,
    `
const fs = require('fs');
const requestLogPath = ${JSON.stringify(requestLogPath)};
function record(entry) {
  const requests = fs.existsSync(requestLogPath)
    ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8'))
    : [];
  requests.push(entry);
  fs.writeFileSync(requestLogPath, JSON.stringify(requests), 'utf8');
}
global.fetch = async (url, options = {}) => {
  const resolvedUrl = String(url);
  record({ url: resolvedUrl, method: options.method, headers: options.headers || {}, body: options.body });
  if (resolvedUrl.includes('api.keenable.ai')) {
    if (${JSON.stringify(mode)} === 'error') {
      return {
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => 'Service unavailable',
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => (${JSON.stringify(keenableBody)}),
    };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => ${JSON.stringify(ddgHtml)},
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
        tool_input: { query: 'bun test runner' },
      }),
      env: {
        ...process.env,
        CCS_DEBUG: '',
        CCS_WEBSEARCH_TRACE: '',
        CCS_PROFILE_TYPE: '',
        CCS_HOME: ccsHome,
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_TAVILY: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_SEARXNG: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_AGY: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        KEENABLE_API_KEY: '',
        CCS_WEBSEARCH_KEENABLE_API_KEY: '',
        ...env,
      },
    });
    const requests: RecordedRequest[] = existsSync(requestLogPath)
      ? JSON.parse(readFileSync(requestLogPath, 'utf8'))
      : [];
    return { result, requests };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('websearch-transformer Keenable backend', () => {
  it('returns Keenable results with the API key header and configured result count', () => {
    const { result, requests } = runHook('success', {
      CCS_WEBSEARCH_KEENABLE: '1',
      CCS_WEBSEARCH_KEENABLE_MAX_RESULTS: '3',
      KEENABLE_API_KEY: 'keenable-test-key',
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: Keenable');
    expect(output.hookSpecificOutput.additionalContext).toContain('https://bun.com/docs/test');
    expect(output.hookSpecificOutput.additionalContext).toContain('Jest-compatible test runner');

    const keenableRequests = requests.filter((request) => request.url.includes('api.keenable.ai'));
    expect(keenableRequests).toHaveLength(1);
    expect(keenableRequests[0].url).toBe('https://api.keenable.ai/v1/search');
    expect(keenableRequests[0].method).toBe('POST');
    expect(keenableRequests[0].headers['X-API-Key']).toBe('keenable-test-key');
    expect(JSON.parse(keenableRequests[0].body ?? '{}')).toEqual({
      query: 'bun test runner',
      max_results: 3,
    });
    expect(requests.some((request) => request.url.includes('duckduckgo'))).toBe(false);
  });

  it('accepts the CCS-scoped API key variable', () => {
    const { result, requests } = runHook('success', {
      CCS_WEBSEARCH_KEENABLE: '1',
      CCS_WEBSEARCH_KEENABLE_API_KEY: 'scoped-key',
    });

    expect(result.status).toBe(0);
    const keenableRequest = requests.find((request) => request.url.includes('api.keenable.ai'));
    expect(keenableRequest?.headers['X-API-Key']).toBe('scoped-key');
  });

  it('is skipped when enabled without an API key', () => {
    const { result, requests } = runHook('success', { CCS_WEBSEARCH_KEENABLE: '1' });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');
    expect(requests.some((request) => request.url.includes('api.keenable.ai'))).toBe(false);
  });

  it('is not called when disabled, even with an API key', () => {
    const { requests } = runHook('success', {
      CCS_WEBSEARCH_KEENABLE: '0',
      KEENABLE_API_KEY: 'keenable-test-key',
    });

    expect(requests.some((request) => request.url.includes('api.keenable.ai'))).toBe(false);
  });

  it('falls back to the next provider when Keenable returns an error', () => {
    const { result, requests } = runHook('error', {
      CCS_WEBSEARCH_KEENABLE: '1',
      KEENABLE_API_KEY: 'keenable-test-key',
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');
    expect(requests.some((request) => request.url.includes('api.keenable.ai'))).toBe(true);
  });
});
