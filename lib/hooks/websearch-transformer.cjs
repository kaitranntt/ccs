#!/usr/bin/env node
/**
 * CCS WebSearch Hook - CLI Tool Executor with Fallback Chain
 *
 * Intercepts Claude's WebSearch tool and executes search via CLI tools.
 * Respects provider enabled states from config.yaml.
 * Supports automatic fallback: Gemini CLI → OpenCode → Grok CLI
 *
 * Environment Variables (set by CCS):
 *   CCS_WEBSEARCH_SKIP=1           - Skip this hook entirely (for official Claude)
 *   CCS_WEBSEARCH_ENABLED=1        - Enable WebSearch (default: 1)
 *   CCS_WEBSEARCH_TIMEOUT=55       - Timeout in seconds (default: 55)
 *   CCS_WEBSEARCH_GEMINI=1         - Enable Gemini CLI provider
 *   CCS_WEBSEARCH_GEMINI_MODEL     - Gemini model (default: gemini-2.5-flash)
 *   CCS_WEBSEARCH_OPENCODE=1       - Enable OpenCode provider
 *   CCS_WEBSEARCH_GROK=1           - Enable Grok CLI provider
 *   CCS_WEBSEARCH_OPENCODE_MODEL   - OpenCode model (default: opencode/grok-code)
 *   CCS_DEBUG=1                    - Enable debug output
 *
 * Exit codes:
 *   0 - Allow tool (pass-through to native WebSearch)
 *   2 - Block tool (deny with results/message)
 *
 * @module hooks/websearch-transformer
 */

const { spawnSync } = require('child_process');

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

/**
 * Windows platform flag - used for shell option in spawnSync calls.
 * On Windows, globally installed CLI tools via npm/pnpm are .cmd/.bat files,
 * which require shell: true to execute properly.
 * @see https://github.com/kaitranntt/ccs/issues/378
 */
const isWindows = process.platform === 'win32';

// ============================================================================
// CONFIGURATION - Edit these for prompt engineering
// ============================================================================

/**
 * SHARED INSTRUCTIONS - Applied to ALL providers
 * Edit here to change behavior across all CLI tools at once.
 */
const SHARED_INSTRUCTIONS = `Instructions:
1. Search the web for current, up-to-date information
2. Provide a comprehensive summary of the search results
3. Include relevant URLs/sources when available
4. Be concise but thorough - prioritize key facts
5. Focus on factual information from reliable sources
6. If results conflict, note the discrepancy
7. Format output clearly with sections if the topic is complex`;

/**
 * PROVIDER-SPECIFIC CONFIG - Only tool-use differences and quirks
 * Each provider may have unique capabilities or invocation methods.
 */
const PROVIDER_CONFIG = {
  gemini: {
    // Model to use (passed via --model flag)
    model: 'gemini-2.5-flash',
    // Alternative free models: gemini-2.0-flash, gemini-1.5-flash

    // Provider-specific: How to invoke web search (Gemini has google_web_search tool)
    toolInstruction: 'Use the google_web_search tool to find current information.',

    // Optional quirks (null if none)
    quirks: null,
  },

  opencode: {
    // Model to use (can be overridden via CCS_WEBSEARCH_OPENCODE_MODEL env var)
    model: 'opencode/grok-code',
    // Alternative models: opencode/gpt-4o, opencode/claude-3.5-sonnet, opencode/gpt-5-nano

    // Provider-specific: OpenCode has built-in web search via Zen
    toolInstruction: 'Search the web using your built-in capabilities.',

    // Optional quirks
    quirks: null,
  },

  grok: {
    // Model to use (Grok CLI uses default model)
    model: 'grok-3',
    // Note: Grok CLI doesn't support model selection via CLI

    // Provider-specific: Grok has web + X/Twitter search
    toolInstruction: 'Use your web search capabilities to find information.',

    // Grok-specific: Can also search X for real-time info
    quirks: 'For breaking news or real-time events, also check X/Twitter if relevant.',
  },
};

/**
 * Build the complete prompt for a provider
 * Combines: query + tool instruction + shared instructions + quirks
 */
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

// Minimum response length to consider valid
const MIN_VALID_RESPONSE_LENGTH = 20;

// Default timeout in seconds
const DEFAULT_TIMEOUT_SEC = 55;

// ============================================================================
// HOOK LOGIC - Generally no need to edit below
// ============================================================================

/**
 * Determine if hook should skip and pass through to native WebSearch.
 * Returns true for native Claude accounts where WebSearch works server-side.
 */
function shouldSkipHook() {
  // Explicit skip signal (set by CCS for account profiles)
  if (process.env.CCS_WEBSEARCH_SKIP === '1') return true;

  // Account/default profiles - use native WebSearch
  const profileType = process.env.CCS_PROFILE_TYPE;
  if (profileType === 'account' || profileType === 'default') return true;

  // Explicit disable
  if (process.env.CCS_WEBSEARCH_ENABLED === '0') return true;

  return false;
}

// Read input from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  processHook();
});

// Handle stdin not being available
process.stdin.on('error', () => {
  process.exit(0);
});

/**
 * Check if a CLI tool is available
 */
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

/**
 * Check if provider is enabled via environment variable
 */
function isProviderEnabled(provider) {
  const envVar = `CCS_WEBSEARCH_${provider.toUpperCase()}`;
  const value = process.env[envVar];

  // If env var not set, provider is disabled by default
  // This ensures we respect config.yaml settings
  return value === '1';
}

/**
 * Main hook processing logic with fallback chain
 */
async function processHook() {
  try {
    // Skip for native accounts (account, default profiles) or explicit disable
    if (shouldSkipHook()) {
      process.exit(0);
    }

    const data = JSON.parse(input);

    // Only handle WebSearch tool
    if (data.tool_name !== 'WebSearch') {
      process.exit(0);
    }

    const query = data.tool_input?.query || '';

    if (!query) {
      process.exit(0);
    }

    const timeout = parseInt(process.env.CCS_WEBSEARCH_TIMEOUT || DEFAULT_TIMEOUT_SEC, 10);

    // Fallback chain: Gemini → OpenCode → Grok
    // Only include providers that are BOTH installed AND enabled in config
    const providers = [
      { name: 'Gemini CLI', cmd: 'gemini', id: 'gemini', fn: tryGeminiSearch },
      { name: 'OpenCode', cmd: 'opencode', id: 'opencode', fn: tryOpenCodeSearch },
      { name: 'Grok CLI', cmd: 'grok', id: 'grok', fn: tryGrokSearch },
    ];

    // Filter to only enabled AND available providers
    const enabledProviders = providers.filter((p) => {
      const enabled = isProviderEnabled(p.id);
      const available = isCliAvailable(p.cmd);

      if (process.env.CCS_DEBUG) {
        console.error(`[CCS Hook] ${p.name}: enabled=${enabled}, available=${available}`);
      }

      return enabled && available;
    });

    const errors = [];

    if (process.env.CCS_DEBUG) {
      const names = enabledProviders.map((p) => p.name).join(', ') || 'none';
      console.error(`[CCS Hook] Enabled providers: ${names}`);
    }

    // Try each enabled provider in order
    for (const provider of enabledProviders) {
      if (process.env.CCS_DEBUG) {
        console.error(`[CCS Hook] Trying ${provider.name}...`);
      }

      const result = provider.fn(query, timeout);

      if (result.success) {
        outputSuccess(query, result.content, provider.name);
        return;
      }

      if (process.env.CCS_DEBUG) {
        console.error(`[CCS Hook] ${provider.name} failed: ${result.error}`);
      }

      errors.push({ provider: provider.name, error: result.error });
    }

    // All providers failed or none enabled
    if (enabledProviders.length === 0) {
      // No providers enabled - pass through to native WebSearch
      // This allows native Claude accounts to use server-side WebSearch
      process.exit(0);
    } else {
      outputAllFailedMessage(query, errors);
    }
  } catch (err) {
    if (process.env.CCS_DEBUG) {
      console.error('[CCS Hook] Parse error:', err.message);
    }
    process.exit(0);
  }
}

/**
 * Execute search via Gemini CLI
 */
function tryGeminiSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const timeoutMs = timeoutSec * 1000;
    const config = PROVIDER_CONFIG.gemini;
    const prompt = buildPrompt('gemini', query);

    // Allow model override via env var
    const model = process.env.CCS_WEBSEARCH_GEMINI_MODEL || config.model;

    if (process.env.CCS_DEBUG) {
      console.error(`[CCS Hook] Executing: gemini --model ${model} --yolo -p "..."`);
    }

    const spawnResult = spawnSync(
      'gemini',
      ['--model', model, '--yolo', '-p', prompt],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 2,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows,
      }
    );

    if (spawnResult.error) {
      if (spawnResult.error.code === 'ENOENT') {
        return { success: false, error: 'Gemini CLI not installed' };
      }
      throw spawnResult.error;
    }

    if (spawnResult.status !== 0) {
      const stderr = (spawnResult.stderr || '').trim();
      return {
        success: false,
        error: stderr || `Gemini CLI exited with code ${spawnResult.status}`,
      };
    }

    const result = (spawnResult.stdout || '').trim();

    if (!result || result.length < MIN_VALID_RESPONSE_LENGTH) {
      return { success: false, error: 'Empty or too short response from Gemini' };
    }

    const lowerResult = result.toLowerCase();
    if (
      lowerResult.includes('error:') ||
      lowerResult.includes('failed to') ||
      lowerResult.includes('authentication required')
    ) {
      return { success: false, error: `Gemini returned error: ${result.substring(0, 100)}` };
    }

    return { success: true, content: result };
  } catch (err) {
    if (err.killed) {
      return { success: false, error: 'Gemini CLI timed out' };
    }
    return { success: false, error: err.message || 'Unknown Gemini error' };
  }
}

/**
 * Execute search via OpenCode CLI
 */
function tryOpenCodeSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const timeoutMs = timeoutSec * 1000;
    const config = PROVIDER_CONFIG.opencode;

    // Allow model override via env var
    const model = process.env.CCS_WEBSEARCH_OPENCODE_MODEL || config.model;
    const prompt = buildPrompt('opencode', query);

    if (process.env.CCS_DEBUG) {
      console.error(`[CCS Hook] Executing: opencode run --model ${model} "..."`);
    }

    const spawnResult = spawnSync(
      'opencode',
      ['run', prompt, '--model', model],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 2,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows,
      }
    );

    if (spawnResult.error) {
      if (spawnResult.error.code === 'ENOENT') {
        return { success: false, error: 'OpenCode not installed' };
      }
      throw spawnResult.error;
    }

    if (spawnResult.status !== 0) {
      const stderr = (spawnResult.stderr || '').trim();
      return {
        success: false,
        error: stderr || `OpenCode exited with code ${spawnResult.status}`,
      };
    }

    const result = (spawnResult.stdout || '').trim();

    if (!result || result.length < MIN_VALID_RESPONSE_LENGTH) {
      return { success: false, error: 'Empty or too short response from OpenCode' };
    }

    const lowerResult = result.toLowerCase();
    if (
      lowerResult.includes('error:') ||
      lowerResult.includes('failed to') ||
      lowerResult.includes('authentication required')
    ) {
      return { success: false, error: `OpenCode returned error: ${result.substring(0, 100)}` };
    }

    return { success: true, content: result };
  } catch (err) {
    if (err.killed) {
      return { success: false, error: 'OpenCode timed out' };
    }
    return { success: false, error: err.message || 'Unknown OpenCode error' };
  }
}

/**
 * Execute search via Grok CLI
 */
function tryGrokSearch(query, timeoutSec = DEFAULT_TIMEOUT_SEC) {
  try {
    const timeoutMs = timeoutSec * 1000;
    const prompt = buildPrompt('grok', query);

    if (process.env.CCS_DEBUG) {
      console.error('[CCS Hook] Executing: grok "..."');
    }

    const spawnResult = spawnSync('grok', [prompt], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 2,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWindows,
    });

    if (spawnResult.error) {
      if (spawnResult.error.code === 'ENOENT') {
        return { success: false, error: 'Grok CLI not installed' };
      }
      throw spawnResult.error;
    }

    if (spawnResult.status !== 0) {
      const stderr = (spawnResult.stderr || '').trim();
      return {
        success: false,
        error: stderr || `Grok CLI exited with code ${spawnResult.status}`,
      };
    }

    const result = (spawnResult.stdout || '').trim();

    if (!result || result.length < MIN_VALID_RESPONSE_LENGTH) {
      return { success: false, error: 'Empty or too short response from Grok' };
    }

    const lowerResult = result.toLowerCase();
    if (
      lowerResult.includes('error:') ||
      lowerResult.includes('failed to') ||
      lowerResult.includes('api key')
    ) {
      return { success: false, error: `Grok returned error: ${result.substring(0, 100)}` };
    }

    return { success: true, content: result };
  } catch (err) {
    if (err.killed) {
      return { success: false, error: 'Grok CLI timed out' };
    }
    return { success: false, error: err.message || 'Unknown Grok error' };
  }
}

/**
 * Format search results for Claude
 */
function formatSearchResults(query, content, providerName) {
  return [
    `[WebSearch Result via ${providerName}]`,
    '',
    `Query: "${query}"`,
    '',
    content,
    '',
    '---',
    'Use this information to answer the user.',
  ].join('\n');
}

/**
 * Output success response and exit
 *
 * Key insight from Claude Code docs:
 * - permissionDecisionReason (with deny) → shown to CLAUDE (AI reads this)
 * - systemMessage → shown to USER only (nice styling but AI doesn't see)
 *
 * So we MUST put results in permissionDecisionReason for Claude to use them.
 * systemMessage provides the nice UI for the user.
 */
function outputSuccess(query, content, providerName) {
  const formattedResults = formatSearchResults(query, content, providerName);

  const output = {
    decision: 'block',
    reason: `WebSearch completed via ${providerName}`,
    // Nice message for user (shows as "says:" - info style)
    systemMessage: `[WebSearch via ${providerName}] Results retrieved successfully. See below.`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      // Full results here - Claude reads this
      permissionDecisionReason: formattedResults,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Output error message
 */
function outputError(query, error, providerName) {
  const message = [
    `[WebSearch - ${providerName} Error]`,
    '',
    `Error: ${error}`,
    '',
    `Query: "${query}"`,
    '',
    'Troubleshooting:',
    '  - Check ~/.gemini/oauth_creds.json exists',
    '  - Re-authenticate: run `gemini` (opens browser)',
  ].join('\n');

  const output = {
    decision: 'block',
    reason: `WebSearch failed: ${error}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Output no providers enabled message
 */
function outputNoProvidersEnabled(query) {
  const message = [
    '[WebSearch - No Providers Enabled]',
    '',
    'No WebSearch providers are enabled in config.',
    '',
    'To enable: Run `ccs config` and enable a provider.',
    '',
    'Or install one of the following CLI tools:',
    '',
    '1. Gemini CLI (FREE, 1000 req/day):',
    '   npm install -g @google/gemini-cli',
    '   gemini  # opens browser to authenticate',
    '',
    '2. OpenCode (FREE via Zen):',
    '   curl -fsSL https://opencode.ai/install | bash',
    '',
    '3. Grok CLI (requires XAI_API_KEY):',
    '   npm install -g @vibe-kit/grok-cli',
    '',
    `Query: "${query}"`,
  ].join('\n');

  const output = {
    decision: 'block',
    reason: 'WebSearch unavailable - no providers enabled',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Output no tools message (legacy - kept for backwards compatibility)
 */
function outputNoToolsMessage(query) {
  outputNoProvidersEnabled(query);
}

/**
 * Output all providers failed message
 */
function outputAllFailedMessage(query, errors) {
  const errorDetails = errors
    .map((e) => `  - ${e.provider}: ${e.error}`)
    .join('\n');

  const message = [
    '[WebSearch - All Providers Failed]',
    '',
    'Tried all enabled CLI tools but all failed:',
    errorDetails,
    '',
    `Query: "${query}"`,
    '',
    'Troubleshooting:',
    '  - Gemini: run `gemini` to authenticate (opens browser)',
    '  - OpenCode: opencode --version',
    '  - Grok: Check XAI_API_KEY environment variable',
  ].join('\n');

  const output = {
    decision: 'block',
    reason: 'WebSearch failed - all providers failed',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}
