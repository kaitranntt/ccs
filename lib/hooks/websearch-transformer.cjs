#!/usr/bin/env node
/**
 * CCS WebSearch Hook - deterministic search backends with legacy CLI fallback
 *
 * Primary providers:
 *   - Exa Search API
 *   - Tavily Search API
 *   - Brave Search API
 *   - SearXNG JSON API
 *   - DuckDuckGo HTML search
 *
 * Legacy compatibility fallback:
 *   - Gemini CLI
 *   - OpenCode
 *   - Grok CLI
 */

const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isWindows = process.platform === 'win32';
const DEFAULT_TIMEOUT_SEC = 55;
const DEFAULT_RESULT_COUNT = 5;
const MIN_VALID_RESPONSE_LENGTH = 20;
const EXA_URL = 'https://api.exa.ai/search';
const TAVILY_URL = 'https://api.tavily.com/search';
const DDG_URL = 'https://html.duckduckgo.com/html/';
const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PROVIDER_STATE_FILE = 'websearch-provider-state.json';
const SHORT_RETRY_AFTER_MAX_SEC = 3;
const TRANSIENT_RETRY_DELAY_MS = 750;
const TRANSIENT_RETRY_ATTEMPTS = 1;
const DEFAULT_RATE_LIMIT_COOLDOWN_SEC = 120;
const DEFAULT_QUOTA_COOLDOWN_SEC = 900;
const MAX_PROVIDER_COOLDOWN_SEC = 60 * 60;

const SHARED_INSTRUCTIONS = `Instructions:
1. Search the web for current, up-to-date information
2. Provide a comprehensive summary of the search results
3. Include relevant URLs/sources when available
4. Be concise but thorough - prioritize key facts
5. Focus on factual information from reliable sources
6. If results conflict, note the discrepancy
7. Format output clearly with sections if the topic is complex`;

const PROVIDER_CONFIG = {
  gemini: {
    model: 'gemini-2.5-flash',
    toolInstruction: 'Use the google_web_search tool to find current information.',
    quirks: null,
  },
  opencode: {
    model: 'opencode/grok-code',
    toolInstruction: 'Search the web using your built-in capabilities.',
    quirks: null,
  },
  grok: {
    model: 'grok-3',
    toolInstruction: 'Use your web search capabilities to find information.',
    quirks: 'For breaking news or real-time events, also check X/Twitter if relevant.',
  },
};

const ddgLinkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const ddgSnippetRe = /<a class="result__snippet[^"]*".*?>([\s\S]*?)<\/a>/g;
const ddgNoResultsRe = /class=['"][^'"]*no-results(?:__message)?[^'"]*['"]/i;
const ddgNoResultsHeadingRe = /No results found for/i;
const htmlTagRe = /<[^>]+>/g;

function debug(message) {
  if (process.env.CCS_DEBUG) {
    console.error(`[CCS Hook] ${message}`);
  }
}

function getCcsDirPath() {
  if ((process.env.CCS_DIR || '').trim()) {
    return path.resolve(process.env.CCS_DIR.trim());
  }

  if ((process.env.CCS_HOME || '').trim()) {
    return path.join(path.resolve(process.env.CCS_HOME.trim()), '.ccs');
  }

  const home = (process.env.HOME || process.env.USERPROFILE || '').trim();
  if (home) {
    return path.join(home, '.ccs');
  }

  return path.join(process.cwd(), '.ccs');
}

function isTraceEnabled() {
  return process.env.CCS_WEBSEARCH_TRACE === '1' || process.env.CCS_DEBUG === '1';
}

function normalizeSafePrefix(inputPath) {
  return `${path.resolve(inputPath)}${path.sep}`;
}

function getSafeTracePrefixes() {
  return [
    normalizeSafePrefix(path.join(getCcsDirPath(), 'logs')),
    normalizeSafePrefix(os.tmpdir()),
    normalizeSafePrefix('/var/log'),
  ];
}

function getProviderStatePath() {
  return path.join(getCcsDirPath(), 'cache', PROVIDER_STATE_FILE);
}

function readProviderState() {
  try {
    const statePath = getProviderStatePath();
    if (!fs.existsSync(statePath)) {
      return { cooldowns: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const cooldowns =
      parsed && typeof parsed === 'object' && parsed.cooldowns && typeof parsed.cooldowns === 'object'
        ? parsed.cooldowns
        : {};
    return { cooldowns };
  } catch {
    return { cooldowns: {} };
  }
}

function writeProviderState(state) {
  try {
    const statePath = getProviderStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, statePath);
  } catch {
    // Best-effort only.
  }
}

function sanitizeProviderState(state) {
  const now = Date.now();
  const nextCooldowns = {};
  let changed = false;

  for (const [providerId, entry] of Object.entries(state.cooldowns || {})) {
    if (!entry || typeof entry !== 'object') {
      changed = true;
      continue;
    }

    const until = Number.parseInt(String(entry.until || ''), 10);
    if (!Number.isFinite(until) || until <= now) {
      changed = true;
      continue;
    }

    nextCooldowns[providerId] = {
      until,
      reason: typeof entry.reason === 'string' ? entry.reason : 'rate_limited',
      updatedAt: Number.parseInt(String(entry.updatedAt || ''), 10) || now,
      sourceError: typeof entry.sourceError === 'string' ? entry.sourceError : '',
    };
  }

  return {
    state: { cooldowns: nextCooldowns },
    changed,
  };
}

function getProviderCooldown(providerId) {
  const { state, changed } = sanitizeProviderState(readProviderState());
  if (changed) {
    writeProviderState(state);
  }

  return state.cooldowns[providerId] || null;
}

function clearProviderCooldown(providerId) {
  const { state } = sanitizeProviderState(readProviderState());
  if (!(providerId in state.cooldowns)) {
    return;
  }

  delete state.cooldowns[providerId];
  writeProviderState(state);
}

function applyProviderCooldown(providerId, cooldownSec, reason, sourceError) {
  const clampedCooldownSec = Math.max(
    1,
    Math.min(MAX_PROVIDER_COOLDOWN_SEC, Math.floor(cooldownSec))
  );
  const { state } = sanitizeProviderState(readProviderState());
  const until = Date.now() + clampedCooldownSec * 1000;
  state.cooldowns[providerId] = {
    until,
    reason,
    updatedAt: Date.now(),
    sourceError: sourceError || '',
  };
  writeProviderState(state);
  return until;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAllowedTraceFileOverride() {
  const configured = (process.env.CCS_WEBSEARCH_TRACE_FILE || '').trim();
  if (!configured) {
    return null;
  }

  const resolved = path.resolve(configured);
  if (getSafeTracePrefixes().some((prefix) => resolved.startsWith(prefix))) {
    return resolved;
  }

  return null;
}

function getTraceFilePath() {
  const fallback = path.join(getCcsDirPath(), 'logs', 'websearch-trace.jsonl');
  return getAllowedTraceFileOverride() || fallback;
}

function traceWebSearchEvent(event, payload = {}) {
  if (!isTraceEnabled()) {
    return;
  }

  try {
    const traceFilePath = getTraceFilePath();
    fs.mkdirSync(path.dirname(traceFilePath), { recursive: true });
    fs.appendFileSync(
      traceFilePath,
      JSON.stringify({
        at: new Date().toISOString(),
        event,
        launchId: process.env.CCS_WEBSEARCH_TRACE_LAUNCH_ID || null,
        launcher: process.env.CCS_WEBSEARCH_TRACE_LAUNCHER || null,
        profileType: process.env.CCS_PROFILE_TYPE || null,
        pid: process.pid,
        ...payload,
      }) + '\n',
      'utf8'
    );
  } catch {
    // Best-effort only.
  }
}

function readHeaderValue(headers, headerName) {
  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    return headers.get(headerName) || '';
  }

  const direct = headers[headerName] ?? headers[String(headerName).toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0] || '';
  }
  return typeof direct === 'string' ? direct : '';
}

function parseRetryAfterSeconds(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  const asSeconds = Number.parseInt(value, 10);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds;
  }

  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    const deltaSec = Math.ceil((asDate - Date.now()) / 1000);
    return deltaSec > 0 ? deltaSec : null;
  }

  return null;
}

function getQueryFingerprint(query) {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  return {
    queryHash: normalizedQuery
      ? createHash('sha256').update(normalizedQuery).digest('hex').slice(0, 16)
      : null,
    queryLength: normalizedQuery.length,
  };
}

function getSkipReason() {
  if (process.env.CCS_WEBSEARCH_SKIP === '1') return 'skip_flag';
  const profileType = process.env.CCS_PROFILE_TYPE;
  if (profileType === 'account') return 'native_account_profile';
  if (profileType === 'default') return 'native_default_profile';
  if (process.env.CCS_WEBSEARCH_ENABLED === '0') return 'disabled';
  return null;
}

function shouldSkipHook() {
  return getSkipReason() !== null;
}

function isCliAvailable(cmd) {
  try {
    const whichCmd = isWindows ? 'where.exe' : 'which';
    const result = spawnSync(whichCmd, [cmd], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function isProviderEnabled(provider) {
  return process.env[`CCS_WEBSEARCH_${provider.toUpperCase()}`] === '1';
}

function hasEnvValue(name) {
  return (process.env[name] || '').trim().length > 0;
}

function getFirstEnvValue(names) {
  for (const name of names) {
    if (hasEnvValue(name)) {
      return process.env[name].trim();
    }
  }
  return '';
}

function getProviderApiKey(providerId) {
  switch (providerId) {
    case 'brave':
      return getFirstEnvValue(['BRAVE_API_KEY', 'CCS_WEBSEARCH_BRAVE_API_KEY']);
    case 'exa':
      return getFirstEnvValue(['EXA_API_KEY', 'CCS_WEBSEARCH_EXA_API_KEY']);
    case 'tavily':
      return getFirstEnvValue(['TAVILY_API_KEY', 'CCS_WEBSEARCH_TAVILY_API_KEY']);
    default:
      return '';
  }
}

function getResultCount(provider) {
  const raw = process.env[`CCS_WEBSEARCH_${provider.toUpperCase()}_MAX_RESULTS`];
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : DEFAULT_RESULT_COUNT;
}

function getSearxngBaseUrl() {
  const raw = (process.env.CCS_WEBSEARCH_SEARXNG_URL || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash) {
      return '';
    }

    if (parsed.username || parsed.password) {
      return '';
    }

    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.toLowerCase().endsWith('/search')) {
      pathname = pathname.slice(0, -'/search'.length);
    }

    parsed.pathname = pathname || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function buildPrompt(providerId, query) {
  const config = PROVIDER_CONFIG[providerId];
  const parts = [
    `Search the web for: ${query}`,
    '',
    config.toolInstruction,
    '',
    SHARED_INSTRUCTIONS,
  ];
  if (config.quirks) {
    parts.push('', `Note: ${config.quirks}`);
  }
  return parts.join('\n');
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function compactText(value, maxLength = 280) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function extractDuckDuckGoResults(html, count) {
  const links = [...html.matchAll(ddgLinkRe)].slice(0, count + 5);
  const snippets = [...html.matchAll(ddgSnippetRe)].slice(0, count + 5);

  return links.slice(0, count).map((match, index) => {
    let url = match[1];
    if (url.includes('uddg=')) {
      try {
        const decoded = decodeURIComponent(url);
        const uddgIndex = decoded.indexOf('uddg=');
        if (uddgIndex !== -1) {
          url = decoded.slice(uddgIndex + 5).split('&')[0];
        }
      } catch {
        // keep original url
      }
    }

    return {
      title: decodeHtml(match[2].replace(htmlTagRe, '').trim()),
      url,
      description: decodeHtml((snippets[index]?.[1] || '').replace(htmlTagRe, '').trim()),
    };
  });
}

function classifyDuckDuckGoHtml(html, count) {
  const responseHtml = String(html || '');
  const results = extractDuckDuckGoResults(responseHtml, count);
  if (results.length > 0) {
    return {
      kind: 'results',
      results,
    };
  }

  if (ddgNoResultsRe.test(responseHtml) || ddgNoResultsHeadingRe.test(responseHtml)) {
    return {
      kind: 'no_results',
      results: [],
    };
  }

  return {
    kind: 'non_result_html',
    results: [],
    error: 'DuckDuckGo returned non-result HTML response (possible anti-bot/challenge page)',
  };
}

function formatStructuredSearchResults(query, providerName, results) {
  const lines = [
    'CCS local WebSearch evidence',
    `Provider: ${providerName}`,
    `Query: "${query}"`,
    `Result count: ${results.length}`,
    '',
  ];

  if (!results.length) {
    lines.push('No results found.');
    return lines.join('\n');
  }

  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    if (result.description) {
      lines.push(`   Snippet: ${result.description}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildSuccessHookOutput(query, providerName, content) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `CCS already retrieved WebSearch results locally via ${providerName}. Use the provided context instead of calling native WebSearch for "${query}".`,
      additionalContext: content,
    },
  };
}

function buildFailureHookOutput(query, errors) {
  const detail = errors.map((entry) => `${entry.provider}: ${entry.error}`).join(' | ');
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `CCS could not complete local WebSearch for "${query}". Native WebSearch is unavailable for this profile.`,
      additionalContext: `CCS local WebSearch failed for "${query}". Attempted providers: ${detail}`,
    },
  };
}

function emitHookOutput(output) {
  console.log(JSON.stringify(output));
  process.exit(0);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryBraveSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  const apiKey = getProviderApiKey('brave');
  if (!apiKey) {
    return { success: false, error: 'BRAVE_API_KEY is not set' };
  }

  const params = new URLSearchParams({
    q: query,
    count: String(getResultCount('brave')),
  });

  try {
    const response = await fetchWithTimeout(
      `${BRAVE_URL}?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'X-Subscription-Token': apiKey,
        },
      },
      timeoutSec * 1000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Brave Search returned ${response.status}: ${body.slice(0, 160)}`,
        statusCode: response.status,
        retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
      };
    }

    const body = await response.json();
    const results = (body.web?.results || []).map((result) => ({
      title: result.title || 'Untitled',
      url: result.url || '',
      description: result.description || '',
    }));

    return {
      success: true,
      content: formatStructuredSearchResults(query, 'Brave Search', results),
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Brave Search timed out' : error.message,
    };
  }
}

async function trySearxngSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  const baseUrl = getSearxngBaseUrl();
  if (!baseUrl) {
    return { success: false, error: 'SearXNG URL is invalid or not configured' };
  }

  const params = new URLSearchParams({
    q: query,
    format: 'json',
  });

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      },
      timeoutSec * 1000
    );

    if (!response.ok) {
      const body = await response.text();
      if (
        response.status === 403 &&
        /format(?:=|\s*)json|json[^\n]{0,40}disabled|disabled[^\n]{0,40}json/i.test(body)
      ) {
        return {
          success: false,
          error: 'SearXNG returned 403: format=json is disabled on this instance',
          statusCode: response.status,
          retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
        };
      }

      return {
        success: false,
        error: `SearXNG returned ${response.status}: ${body.slice(0, 160)}`,
        statusCode: response.status,
        retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
      };
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return {
        success: false,
        error: 'SearXNG returned malformed JSON payload',
      };
    }

    if (!body || typeof body !== 'object' || !Array.isArray(body.results)) {
      return {
        success: false,
        error: 'SearXNG JSON response is missing results[]',
      };
    }

    const count = getResultCount('searxng');
    const results = body.results.slice(0, count).map((entry) => {
      const result = entry && typeof entry === 'object' ? entry : {};
      const url = typeof result.url === 'string' ? result.url : '';
      const titleSource =
        typeof result.title === 'string' && result.title.trim().length > 0
          ? result.title
          : url || 'Untitled';
      const descriptionSource =
        typeof result.content === 'string'
          ? result.content
          : typeof result.description === 'string'
            ? result.description
            : typeof result.snippet === 'string'
              ? result.snippet
              : '';

      return {
        title: compactText(titleSource, 120),
        url,
        description: compactText(descriptionSource, 240),
      };
    });

    return {
      success: true,
      content: formatStructuredSearchResults(query, 'SearXNG', results),
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'SearXNG timed out' : error.message,
    };
  }
}

async function tryExaSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  const apiKey = getProviderApiKey('exa');
  if (!apiKey) {
    return { success: false, error: 'EXA_API_KEY is not set' };
  }

  try {
    const response = await fetchWithTimeout(
      EXA_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query,
          type: 'auto',
          numResults: getResultCount('exa'),
          text: true,
        }),
      },
      timeoutSec * 1000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Exa returned ${response.status}: ${body.slice(0, 160)}`,
        statusCode: response.status,
        retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
      };
    }

    const body = await response.json();
    const results = (body.results || []).map((result) => ({
      title: compactText(result.title || result.url || 'Untitled', 120),
      url: result.url || '',
      description: compactText(result.text || result.summary || '', 240),
    }));

    return {
      success: true,
      content: formatStructuredSearchResults(query, 'Exa', results),
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Exa timed out' : error.message,
    };
  }
}

async function tryTavilySearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  const apiKey = getProviderApiKey('tavily');
  if (!apiKey) {
    return { success: false, error: 'TAVILY_API_KEY is not set' };
  }

  try {
    const response = await fetchWithTimeout(
      TAVILY_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: getResultCount('tavily'),
          include_answer: false,
          include_raw_content: false,
        }),
      },
      timeoutSec * 1000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Tavily returned ${response.status}: ${body.slice(0, 160)}`,
        statusCode: response.status,
        retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
      };
    }

    const body = await response.json();
    const results = (body.results || []).map((result) => ({
      title: compactText(result.title || result.url || 'Untitled', 120),
      url: result.url || '',
      description: compactText(result.content || '', 240),
    }));

    return {
      success: true,
      content: formatStructuredSearchResults(query, 'Tavily', results),
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Tavily timed out' : error.message,
    };
  }
}

async function tryDuckDuckGoSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const params = new URLSearchParams({ q: query });
    const response = await fetchWithTimeout(
      `${DDG_URL}?${params.toString()}`,
      {
        headers: {
          Accept: 'text/html',
          'User-Agent': USER_AGENT,
        },
      },
      timeoutSec * 1000
    );

    if (!response.ok) {
      return {
        success: false,
        error: `DuckDuckGo returned ${response.status}`,
        statusCode: response.status,
        retryAfterSec: parseRetryAfterSeconds(readHeaderValue(response.headers, 'retry-after')),
      };
    }

    const html = await response.text();
    const parsed = classifyDuckDuckGoHtml(html, getResultCount('duckduckgo'));
    if (parsed.kind === 'non_result_html') {
      return {
        success: false,
        error: `${parsed.error} (status ${response.status})`,
        statusCode: response.status,
      };
    }

    return {
      success: true,
      content: formatStructuredSearchResults(query, 'DuckDuckGo', parsed.results),
    };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError' ? 'DuckDuckGo timed out' : error.message,
    };
  }
}

function shouldRetryGeminiWithLegacyPrompt(errorMessage) {
  const lower = (errorMessage || '').toLowerCase();
  return (
    lower.includes('unknown option') ||
    lower.includes('unknown argument') ||
    lower.includes('unrecognized option') ||
    lower.includes('usage: gemini') ||
    lower.includes('use --prompt') ||
    lower.includes('using the --prompt option')
  );
}

function runGeminiCommand(args, timeoutMs) {
  const result = spawnSync('gemini', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 2,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Never route query-derived prompts through a shell. Node concatenates
    // arguments for shell-backed Windows spawns, which lets shell metacharacters
    // in WebSearch queries escape the intended CLI invocation.
    shell: false,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT')
      return { success: false, error: 'Gemini CLI not installed' };
    throw result.error;
  }
  if (result.status !== 0) {
    return {
      success: false,
      error: (result.stderr || '').trim() || `Gemini CLI exited with code ${result.status}`,
    };
  }

  const output = (result.stdout || '').trim();
  if (!output || output.length < MIN_VALID_RESPONSE_LENGTH) {
    return { success: false, error: 'Empty or too short response from Gemini' };
  }
  return { success: true, content: output };
}

function tryGeminiSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const timeoutMs = timeoutSec * 1000;
    const model = process.env.CCS_WEBSEARCH_GEMINI_MODEL || PROVIDER_CONFIG.gemini.model;
    const prompt = buildPrompt('gemini', query);
    const baseArgs = ['--model', model, '--yolo'];

    debug(`Executing Gemini legacy fallback with model ${model}`);
    const positionalResult = runGeminiCommand([...baseArgs, prompt], timeoutMs);
    if (positionalResult.success || !shouldRetryGeminiWithLegacyPrompt(positionalResult.error)) {
      return positionalResult;
    }

    return runGeminiCommand([...baseArgs, '-p', prompt], timeoutMs);
  } catch (error) {
    return {
      success: false,
      error: error.killed ? 'Gemini CLI timed out' : error.message || 'Unknown Gemini error',
    };
  }
}

function tryOpenCodeSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const model = process.env.CCS_WEBSEARCH_OPENCODE_MODEL || PROVIDER_CONFIG.opencode.model;
    const result = spawnSync(
      'opencode',
      ['run', buildPrompt('opencode', query), '--model', model],
      {
        encoding: 'utf8',
        timeout: timeoutSec * 1000,
        maxBuffer: 1024 * 1024 * 2,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Never route query-derived prompts through a shell. Node concatenates
        // arguments for shell-backed Windows spawns, which lets shell metacharacters
        // in WebSearch queries escape the intended CLI invocation.
        shell: false,
      }
    );

    if (result.error) {
      if (result.error.code === 'ENOENT')
        return { success: false, error: 'OpenCode not installed' };
      throw result.error;
    }
    if (result.status !== 0) {
      return {
        success: false,
        error: (result.stderr || '').trim() || `OpenCode exited with code ${result.status}`,
      };
    }

    const output = (result.stdout || '').trim();
    if (!output || output.length < MIN_VALID_RESPONSE_LENGTH) {
      return { success: false, error: 'Empty or too short response from OpenCode' };
    }
    return { success: true, content: output };
  } catch (error) {
    return {
      success: false,
      error: error.killed ? 'OpenCode timed out' : error.message || 'Unknown OpenCode error',
    };
  }
}

function tryGrokSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const result = spawnSync('grok', [buildPrompt('grok', query)], {
      encoding: 'utf8',
      timeout: timeoutSec * 1000,
      maxBuffer: 1024 * 1024 * 2,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Never route query-derived prompts through a shell. Node concatenates
      // arguments for shell-backed Windows spawns, which lets shell metacharacters
      // in WebSearch queries escape the intended CLI invocation.
      shell: false,
    });

    if (result.error) {
      if (result.error.code === 'ENOENT')
        return { success: false, error: 'Grok CLI not installed' };
      throw result.error;
    }
    if (result.status !== 0) {
      return {
        success: false,
        error: (result.stderr || '').trim() || `Grok CLI exited with code ${result.status}`,
      };
    }

    const output = (result.stdout || '').trim();
    if (!output || output.length < MIN_VALID_RESPONSE_LENGTH) {
      return { success: false, error: 'Empty or too short response from Grok' };
    }
    return { success: true, content: output };
  } catch (error) {
    return {
      success: false,
      error: error.killed ? 'Grok CLI timed out' : error.message || 'Unknown Grok error',
    };
  }
}

function outputSuccess(query, content, providerName) {
  emitHookOutput(buildSuccessHookOutput(query, providerName, content));
}

function outputAllFailedMessage(query, errors) {
  emitHookOutput(buildFailureHookOutput(query, errors));
}

function getConfiguredProviders() {
  return [
    {
      name: 'Exa',
      id: 'exa',
      available: () => isProviderEnabled('exa') && Boolean(getProviderApiKey('exa')),
      fn: tryExaSearch,
    },
    {
      name: 'Tavily',
      id: 'tavily',
      available: () => isProviderEnabled('tavily') && Boolean(getProviderApiKey('tavily')),
      fn: tryTavilySearch,
    },
    {
      name: 'Brave Search',
      id: 'brave',
      available: () => isProviderEnabled('brave') && Boolean(getProviderApiKey('brave')),
      fn: tryBraveSearch,
    },
    {
      name: 'SearXNG',
      id: 'searxng',
      available: () => isProviderEnabled('searxng') && Boolean(getSearxngBaseUrl()),
      fn: trySearxngSearch,
    },
    {
      name: 'DuckDuckGo',
      id: 'duckduckgo',
      available: () => isProviderEnabled('duckduckgo'),
      fn: tryDuckDuckGoSearch,
    },
    {
      name: 'Gemini CLI',
      id: 'gemini',
      available: () => isProviderEnabled('gemini') && isCliAvailable('gemini'),
      fn: tryGeminiSearch,
    },
    {
      name: 'OpenCode',
      id: 'opencode',
      available: () => isProviderEnabled('opencode') && isCliAvailable('opencode'),
      fn: tryOpenCodeSearch,
    },
    {
      name: 'Grok CLI',
      id: 'grok',
      available: () => isProviderEnabled('grok') && isCliAvailable('grok'),
      fn: tryGrokSearch,
    },
  ];
}

function looksLikeQuotaExhaustion(errorMessage) {
  const lower = String(errorMessage || '').toLowerCase();
  return (
    (lower.includes('quota') &&
      (lower.includes('exceed') ||
        lower.includes('exhaust') ||
        lower.includes('deplet') ||
        lower.includes('limit') ||
        lower.includes('used up'))) ||
    lower.includes('insufficient credits') ||
    lower.includes('credit balance') ||
    lower.includes('out of credits') ||
    lower.includes('billing hard limit') ||
    lower.includes('monthly usage cap')
  );
}

function looksLikeTransientFailure(errorMessage) {
  const lower = String(errorMessage || '').toLowerCase();
  return (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('service unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('gateway timeout') ||
    lower.includes('socket hang up') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  );
}

function classifyProviderFailure(result) {
  const errorMessage = String(result.error || '');
  const statusCode =
    Number.isFinite(result.statusCode) && result.statusCode > 0 ? result.statusCode : null;
  const retryAfterSec = Number.isFinite(result.retryAfterSec) ? result.retryAfterSec : null;

  if (looksLikeQuotaExhaustion(errorMessage)) {
    return {
      kind: 'cooldown',
      reason: 'quota_exhausted',
      cooldownSec: retryAfterSec || DEFAULT_QUOTA_COOLDOWN_SEC,
      retryAfterSec,
    };
  }

  if (statusCode === 429 || /too many requests|rate limit/i.test(errorMessage)) {
    if (retryAfterSec && retryAfterSec <= SHORT_RETRY_AFTER_MAX_SEC) {
      return {
        kind: 'retry',
        delayMs: retryAfterSec * 1000,
        reason: 'rate_limited_short_backoff',
        retryAfterSec,
      };
    }

    return {
      kind: 'cooldown',
      reason: 'rate_limited',
      cooldownSec: retryAfterSec || DEFAULT_RATE_LIMIT_COOLDOWN_SEC,
      retryAfterSec,
    };
  }

  if (
    (statusCode && [502, 503, 504].includes(statusCode)) ||
    looksLikeTransientFailure(errorMessage)
  ) {
    return {
      kind: 'retry',
      delayMs: TRANSIENT_RETRY_DELAY_MS,
      reason: 'transient_failure',
      retryAfterSec,
    };
  }

  return {
    kind: 'fail',
    reason: 'non_retryable',
    retryAfterSec,
  };
}

async function runProviderWithPolicy(provider, query, timeoutSec, fingerprint) {
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    traceWebSearchEvent('websearch_provider_attempt', {
      source: 'provider',
      providerId: provider.id,
      providerName: provider.name,
      attempt: attempt + 1,
      ...fingerprint,
    });

    const result = await provider.fn(query, timeoutSec);
    if (result.success) {
      clearProviderCooldown(provider.id);
      return result;
    }

    const policy = classifyProviderFailure(result);
    if (policy.kind === 'retry' && attempt < TRANSIENT_RETRY_ATTEMPTS) {
      traceWebSearchEvent('websearch_provider_retry_scheduled', {
        source: 'provider',
        providerId: provider.id,
        providerName: provider.name,
        attempt: attempt + 1,
        delayMs: policy.delayMs,
        reason: policy.reason,
        retryAfterSec: policy.retryAfterSec,
        ...fingerprint,
      });
      await sleep(policy.delayMs);
      continue;
    }

    if (policy.kind === 'retry' && policy.reason === 'rate_limited_short_backoff') {
      const cooldownSec = policy.retryAfterSec || DEFAULT_RATE_LIMIT_COOLDOWN_SEC;
      const until = applyProviderCooldown(provider.id, cooldownSec, 'rate_limited', result.error);
      traceWebSearchEvent('websearch_provider_cooldown_applied', {
        source: 'provider',
        providerId: provider.id,
        providerName: provider.name,
        cooldownUntil: until,
        cooldownSec,
        reason: 'rate_limited',
        retryAfterSec: policy.retryAfterSec,
        afterRetryExhausted: true,
        ...fingerprint,
      });
      return {
        ...result,
        error: `${result.error} (cooldown ${cooldownSec}s)`,
      };
    }

    if (policy.kind === 'cooldown') {
      const until = applyProviderCooldown(
        provider.id,
        policy.cooldownSec,
        policy.reason,
        result.error
      );
      traceWebSearchEvent('websearch_provider_cooldown_applied', {
        source: 'provider',
        providerId: provider.id,
        providerName: provider.name,
        cooldownUntil: until,
        cooldownSec: policy.cooldownSec,
        reason: policy.reason,
        retryAfterSec: policy.retryAfterSec,
        ...fingerprint,
      });
      return {
        ...result,
        error: `${result.error} (cooldown ${policy.cooldownSec}s)`,
      };
    }

    return result;
  }

  return { success: false, error: 'Provider retry policy exhausted' };
}

function getActiveProviders() {
  return getConfiguredProviders().filter((provider) => !getProviderCooldown(provider.id) && provider.available());
}

function getActiveProviderIds() {
  return getActiveProviders().map((provider) => provider.id);
}

function hasAnyActiveProviders() {
  return getActiveProviders().length > 0;
}

async function runLocalWebSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  const fingerprint = getQueryFingerprint(query);
  const configuredProviders = getConfiguredProviders();
  const activeProviders = [];

  for (const provider of configuredProviders) {
    const cooldown = getProviderCooldown(provider.id);
    if (cooldown) {
      traceWebSearchEvent('websearch_provider_cooldown_skip', {
        source: 'provider',
        providerId: provider.id,
        providerName: provider.name,
        cooldownUntil: cooldown.until,
        cooldownReason: cooldown.reason,
        remainingMs: Math.max(0, cooldown.until - Date.now()),
        ...fingerprint,
      });
      continue;
    }

    if (provider.available()) {
      activeProviders.push(provider);
    }
  }

  debug(
    `Enabled providers: ${activeProviders.map((provider) => provider.name).join(', ') || 'none'}`
  );
  traceWebSearchEvent('websearch_provider_run_started', {
    source: 'provider',
    activeProviderIds: activeProviders.map((provider) => provider.id),
    ...fingerprint,
  });

  if (activeProviders.length === 0) {
    traceWebSearchEvent('websearch_provider_run_unavailable', {
      source: 'provider',
      activeProviderIds: [],
      ...fingerprint,
    });
    return { success: false, noActiveProviders: true, errors: [] };
  }

  const errors = [];
  for (const provider of activeProviders) {
    debug(`Trying ${provider.name}`);
    const result = await runProviderWithPolicy(provider, query, timeoutSec, fingerprint);
    if (result.success) {
      traceWebSearchEvent('websearch_provider_success', {
        source: 'provider',
        providerId: provider.id,
        providerName: provider.name,
        ...fingerprint,
      });
      return {
        success: true,
        providerId: provider.id,
        providerName: provider.name,
        content: result.content,
      };
    }
    traceWebSearchEvent('websearch_provider_failure', {
      source: 'provider',
      providerId: provider.id,
      providerName: provider.name,
      error: result.error,
      ...fingerprint,
    });
    errors.push({ provider: provider.name, error: result.error });
  }

  traceWebSearchEvent('websearch_provider_run_failed', {
    source: 'provider',
    errorCount: errors.length,
    activeProviderIds: activeProviders.map((provider) => provider.id),
    ...fingerprint,
  });
  return { success: false, noActiveProviders: false, errors };
}

async function processHook(input) {
  try {
    if (shouldSkipHook()) {
      traceWebSearchEvent('websearch_hook_skipped', {
        source: 'hook',
        reason: getSkipReason(),
      });
      process.exit(0);
    }

    const data = JSON.parse(input);
    if (data.tool_name !== 'WebSearch') {
      process.exit(0);
    }

    const query = data.tool_input?.query || '';
    if (!query) {
      process.exit(0);
    }

    traceWebSearchEvent('websearch_hook_invoked', {
      source: 'hook',
      ...getQueryFingerprint(query),
    });

    const timeout = Number.parseInt(
      process.env.CCS_WEBSEARCH_TIMEOUT || `${DEFAULT_TIMEOUT_SEC}`,
      10
    );
    const result = await runLocalWebSearch(query, timeout);
    if (result.noActiveProviders) {
      traceWebSearchEvent('websearch_hook_no_active_providers', {
        source: 'hook',
        ...getQueryFingerprint(query),
      });
      process.exit(0);
    }

    if (result.success) {
      traceWebSearchEvent('websearch_hook_success', {
        source: 'hook',
        providerId: result.providerId,
        providerName: result.providerName,
        ...getQueryFingerprint(query),
      });
      outputSuccess(query, result.content, result.providerName);
      return;
    }

    traceWebSearchEvent('websearch_hook_failure', {
      source: 'hook',
      errorCount: result.errors.length,
      ...getQueryFingerprint(query),
    });
    outputAllFailedMessage(query, result.errors);
  } catch (error) {
    debug(`Hook error: ${error.message}`);
    traceWebSearchEvent('websearch_hook_error', {
      source: 'hook',
      error: error.message,
    });
    process.exit(0);
  }
}

function startFromStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    processHook(input);
  });
  process.stdin.on('error', () => {
    process.exit(0);
  });
}

if (require.main === module) {
  startFromStdin();
}

module.exports = {
  buildFailureHookOutput,
  buildSuccessHookOutput,
  classifyDuckDuckGoHtml,
  extractDuckDuckGoResults,
  formatStructuredSearchResults,
  getActiveProviders,
  hasAnyActiveProviders,
  runLocalWebSearch,
  shouldSkipHook,
  getActiveProviderIds,
  classifyProviderFailure,
  getQueryFingerprint,
  getSkipReason,
  parseRetryAfterSeconds,
  traceWebSearchEvent,
  tryExaSearch,
  tryTavilySearch,
  tryDuckDuckGoSearch,
  tryBraveSearch,
  trySearxngSearch,
};
