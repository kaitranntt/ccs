#!/usr/bin/env node
/**
 * CCS Image Analyzer Hook - Read Tool Interceptor
 *
 * Intercepts Claude's Read tool for image/PDF files and analyzes them via CLIProxy.
 * Returns detailed text descriptions instead of allowing direct visual access.
 *
 * Environment Variables (set by CCS):
 *   CCS_IMAGE_ANALYSIS_SKIP=1                 - Skip this hook entirely
 *   CCS_IMAGE_ANALYSIS_ENABLED=1              - Enable image analysis (default: 1)
 *   CCS_IMAGE_ANALYSIS_PROVIDER_MODELS        - Provider:model mapping (e.g., agy:gemini-2.5-flash,gemini:gemini-2.5-flash)
 *   CCS_CURRENT_PROVIDER                      - Current CLIProxy provider (e.g., agy, gemini, codex)
 *   CCS_IMAGE_ANALYSIS_TIMEOUT=60             - Timeout in seconds (default: 60)
 *   CCS_PROFILE_TYPE                          - Profile type (account/default skip)
 *   ANTHROPIC_MODEL                           - Chat model env (not used for image analysis fallback)
 *   CCS_DEBUG=1                               - Enable debug output
 *
 * Exit codes:
 *   0 - Allow tool (pass-through to native Read)
 *   2 - Block tool (deny with analysis/message)
 *
 * @module hooks/image-analyzer-transformer
 */

const fs = require('fs');
const path = require('path');
const { analyzeFile, isAnalyzableFile, parseProviderModels } = require('./image-analysis-runtime.cjs');

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

const isWindows = process.platform === 'win32';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_SEC = 60;

// ============================================================================
// ERROR CODES (for categorization)
// ============================================================================

const ERROR_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  CLIPROXY_UNAVAILABLE: 'CLIPROXY_UNAVAILABLE',
  AUTH_FAILED: 'AUTH_FAILED',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  API_ERROR: 'API_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Output debug information to stderr
 * Only outputs when CCS_DEBUG=1
 */
function debugLog(message, data = {}) {
  if (!process.env.CCS_DEBUG) return;

  const lines = [`[CCS Hook] ${message}`];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  console.error(lines.join('\n'));
}

/**
 * Get detailed debug context
 */
function getDebugContext(filePath, stats) {
  const currentProvider = process.env.CCS_CURRENT_PROVIDER || 'unknown';
  const model =
    process.env.CCS_IMAGE_ANALYSIS_MODEL ||
    parseProviderModels(process.env.CCS_IMAGE_ANALYSIS_PROVIDER_MODELS)[currentProvider] ||
    DEFAULT_MODEL;
  const timeout = parseInt(process.env.CCS_IMAGE_ANALYSIS_TIMEOUT || DEFAULT_TIMEOUT_SEC, 10);

  return {
    file: path.basename(filePath),
    size: stats ? `${(stats.size / 1024).toFixed(1)} KB` : 'unknown',
    provider: currentProvider,
    model: model,
    timeout: `${timeout}s`,
    endpoint: process.env.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL || '(runtime fallback)',
  };
}

/**
 * Get current provider/model context for error messages
 */
function getProviderContext() {
  const provider = process.env.CCS_CURRENT_PROVIDER || 'unknown';
  const model =
    process.env.CCS_IMAGE_ANALYSIS_MODEL ||
    parseProviderModels(process.env.CCS_IMAGE_ANALYSIS_PROVIDER_MODELS)[provider] ||
    DEFAULT_MODEL;
  return { provider, model };
}
/**
 * Format analysis description for Claude (matches websearch format)
 */
function formatDescription(filePath, description, model, fileSize) {
  const sizeKB = fileSize ? (fileSize / 1024).toFixed(1) : '?';
  return [
    `[Image Analysis via CLIProxy]`,
    '',
    `File: ${path.basename(filePath)} (${sizeKB} KB)`,
    `Model: ${model}`,
    '',
    '---',
    '',
    description,
    '',
    '---',
    '*Use this description to understand the image content.*',
  ].join('\n');
}

// ============================================================================
// SPECIALIZED ERROR HANDLERS
// ============================================================================

/**
 * Format error output for Claude hook
 */
function formatErrorOutput(filePath, errorCode, message, troubleshooting) {
  const { provider, model } = getProviderContext();

  const lines = [
    `[Image Analysis - Error]`,
    '',
    `File: ${path.basename(filePath)}`,
    `Provider: ${provider} | Model: ${model}`,
    '',
    `Error: ${message}`,
  ];

  if (troubleshooting && troubleshooting.length > 0) {
    lines.push('');
    lines.push('Troubleshooting:');
    troubleshooting.forEach((step, i) => {
      lines.push(`  ${i + 1}. ${step}`);
    });
  }

  lines.push('');
  lines.push('For help: ccs config image-analysis --help');

  return {
    decision: 'block',
    reason: `Image analysis failed: ${errorCode}`,
    systemMessage: `[Image Analysis] Failed: ${message}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: lines.join('\n'),
    },
  };
}

/**
 * File too large error
 */
function outputFileTooLargeError(filePath, actualSizeMB, maxSizeMB) {
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.FILE_TOO_LARGE,
    `File too large (${actualSizeMB.toFixed(2)}MB > ${maxSizeMB}MB limit)`,
    [
      'Reduce image resolution or use compression',
      'For screenshots: use PNG optimizer (pngquant, optipng)',
      'For photos: resize to max 2048px width',
      `Current limit: ${maxSizeMB}MB per file`,
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

function outputAuthError(filePath, statusCode) {
  const { provider } = getProviderContext();
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.AUTH_FAILED,
    `Authentication failed (HTTP ${statusCode})`,
    [
      `Re-authenticate: ccs ${provider} --auth`,
      `Check accounts: ccs ${provider} --accounts`,
      'Verify OAuth token is valid',
      'Check: ccs doctor',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Timeout error
 */
function outputTimeoutError(filePath, timeoutSec) {
  const { model } = getProviderContext();
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.TIMEOUT,
    `Request timed out after ${timeoutSec}s`,
    [
      'Large files or complex images take longer',
      `Increase timeout: ccs config image-analysis --timeout ${timeoutSec * 2}`,
      'Or via env: CCS_IMAGE_ANALYSIS_TIMEOUT=120',
      `Current model (${model}) may be slow - try a faster variant`,
      'Check CLIProxy health: curl http://127.0.0.1:8317',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Rate limit error
 */
function outputRateLimitError(filePath, retryAfterSec) {
  const { provider } = getProviderContext();
  const retryHint = retryAfterSec ? `Retry after ${retryAfterSec}s` : 'Wait a moment and retry';
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.RATE_LIMIT,
    'Rate limit exceeded',
    [
      retryHint,
      `Provider ${provider} has usage limits`,
      'Consider switching accounts: ccs ' + provider + ' --accounts',
      'Check quota: ccs cliproxy doctor',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Generic API error
 */
function outputApiError(filePath, statusCode, responseBody) {
  // Try to extract error message from response
  let errorDetail = `HTTP ${statusCode}`;
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed.error?.message) {
      errorDetail = parsed.error.message;
    } else if (parsed.message) {
      errorDetail = parsed.message;
    }
  } catch {
    // Use raw body if not JSON (truncated)
    if (responseBody && responseBody.length < 100) {
      errorDetail = responseBody;
    }
  }

  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.API_ERROR,
    `API error: ${errorDetail}`,
    [
      'Check CLIProxy logs: ccs cleanup --show-logs',
      'Verify provider is authenticated: ccs doctor',
      'Try a different provider or model',
      'Report persistent issues: https://github.com/kaitranntt/ccs/issues',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * File permission error
 */
function outputFileAccessError(filePath, error) {
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.UNKNOWN,
    `File access denied: ${error}`,
    [
      'Check file permissions: ls -l ' + filePath,
      isWindows ? 'Run terminal as Administrator if needed' : 'Use sudo or adjust file ownership',
      'Verify file is readable by current user',
      'Move file to accessible location',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Unknown/fallback error (replaces old outputError)
 */
function outputUnknownError(filePath, error) {
  const output = formatErrorOutput(
    filePath,
    ERROR_CODES.UNKNOWN,
    error || 'Unknown error occurred',
    [
      'Check CLIProxy is running: curl http://127.0.0.1:8317',
      'Verify authentication: ccs doctor',
      'Check file is valid image/PDF',
      'Enable debug: CCS_DEBUG=1 ccs <provider>',
    ]
  );
  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * CLIProxy unavailable fallback - blocks Read to prevent context overflow
 * When CLIProxy is not running, we cannot analyze the image.
 * Blocking prevents the image from loading into Claude's context (100K+ tokens).
 */
function outputCliProxyUnavailableFallback(filePath) {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  // Keep message minimal to avoid context pollution and hallucination
  const message = [
    '[Image Read Blocked]',
    '',
    `File: ${fileName}`,
    '',
    'CLIProxy unavailable. Image blocked to prevent context overflow.',
  ].join('\n');

  const output = {
    decision: 'block',
    reason: 'CLIProxy unavailable - image blocked to prevent context overflow',
    systemMessage: `[Image Blocked] ${fileName} - CLIProxy unavailable. Start: ccs config`,
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
 * Output success response and exit
 */
function outputSuccess(filePath, description, model, fileSize) {
  debugLog('Returning analysis result', {
    file: path.basename(filePath),
    model: model,
    descriptionLength: `${description.length} chars`,
  });

  const formattedDescription = formatDescription(filePath, description, model, fileSize);

  const output = {
    decision: 'block',
    reason: `Image analyzed: ${path.basename(filePath)}`,
    systemMessage: `[Image Analysis] ${path.basename(filePath)} analyzed via CLIProxy (${model})`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: formattedDescription,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

/**
 * Determine if hook should skip, with debug logging
 */
function normalizePathForComparison(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isPathWithinWorkspace(workspaceRoot, candidatePath) {
  const relativePath = path.relative(workspaceRoot, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function resolveWorkspaceFilePath(filePath) {
  const workspaceRoot = (() => {
    try {
      return fs.realpathSync(process.cwd());
    } catch {
      return path.resolve(process.cwd());
    }
  })();
  const absolutePath = path.resolve(process.cwd(), filePath);
  const realFilePath = fs.realpathSync(absolutePath);

  if (
    !isPathWithinWorkspace(
      normalizePathForComparison(workspaceRoot),
      normalizePathForComparison(realFilePath)
    )
  ) {
    debugLog('Skipping: file is outside the current workspace', {
      workspaceRoot,
      filePath: realFilePath,
    });
    return null;
  }

  return realFilePath;
}

function shouldSkipHook() {
  if (process.env.CCS_IMAGE_ANALYSIS_SKIP_HOOK === '1') {
    debugLog('Skipping: CCS_IMAGE_ANALYSIS_SKIP_HOOK=1');
    return true;
  }

  // Explicit skip signal
  if (process.env.CCS_IMAGE_ANALYSIS_SKIP === '1') {
    debugLog('Skipping: CCS_IMAGE_ANALYSIS_SKIP=1');
    return true;
  }

  // Explicit disable
  if (process.env.CCS_IMAGE_ANALYSIS_ENABLED === '0') {
    debugLog('Skipping: image analysis disabled (CCS_IMAGE_ANALYSIS_ENABLED=0)');
    return true;
  }

  // Account/default profiles - use native Read
  const profileType = process.env.CCS_PROFILE_TYPE;
  if (profileType === 'account' || profileType === 'default') {
    debugLog(`Skipping: profile type "${profileType}" uses native Read`);
    return true;
  }

  // Check if current provider has a vision model configured
  const explicitModel = process.env.CCS_IMAGE_ANALYSIS_MODEL;
  const currentProvider = process.env.CCS_CURRENT_PROVIDER || '';
  const providerModels = parseProviderModels(process.env.CCS_IMAGE_ANALYSIS_PROVIDER_MODELS);

  if (!explicitModel?.trim() && !providerModels[currentProvider]) {
    debugLog(`Skipping: provider "${currentProvider}" not in provider_models`, {
      configured_providers: Object.keys(providerModels).join(', ') || 'none',
    });
    return true;
  }

  return false;
}

// ============================================================================
// MAIN HOOK LOGIC
// ============================================================================

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
 * Main hook processing logic
 *
 * Two-phase design: Phase 1 filters non-image Read calls silently (exit 0).
 * Phase 2 only runs for confirmed image/PDF files, so error messages are
 * always relevant and never confuse users reading code or text files.
 */
async function processHook() {
  // Phase 1: Fast bail-out for non-image files
  // Any failure here → pass through silently to native Read
  let filePath;
  try {
    const data = JSON.parse(input);

    // Only handle Read tool
    if (data.tool_name !== 'Read') {
      process.exit(0);
    }

    filePath = data.tool_input?.file_path || '';

    if (!filePath) {
      process.exit(0);
    }

    // Check file extension BEFORE any other processing — this is the key gate
    // that ensures non-image Read calls never see hook errors
    if (!isAnalyzableFile(filePath)) {
      process.exit(0);
    }
  } catch {
    // stdin parse failure or unexpected error → pass through silently
    process.exit(0);
  }

  // Phase 2: Image/PDF file processing — errors here are relevant to the user
  try {
    // Skip for native accounts or explicit disable
    if (shouldSkipHook()) {
      process.exit(0);
    }

    if (!fs.existsSync(filePath)) {
      process.exit(0);
    }

    const workspaceFilePath = resolveWorkspaceFilePath(filePath);
    if (!workspaceFilePath) {
      process.exit(0);
    }

    const debugContext = getDebugContext(workspaceFilePath, null);
    debugLog('Image analysis runtime prepared', debugContext);

    const result = await analyzeFile(workspaceFilePath);
    outputSuccess(workspaceFilePath, result.description, result.model, result.fileSize);
  } catch (err) {
    if (process.env.CCS_DEBUG) {
      console.error('[CCS Hook] Error:', err.message);
    }

    // filePath is guaranteed set by Phase 1 — only image files reach here

    // Categorize error by message pattern
    const errMsg = err.message || '';

    if (errMsg.startsWith('FILE_TOO_LARGE:')) {
      const fileSizeMb = Number.parseInt(errMsg.split(':')[1], 10) / 1024 / 1024;
      outputFileTooLargeError(filePath, fileSizeMb, 10);
    } else if (errMsg.startsWith('AUTH_ERROR:')) {
      const statusCode = parseInt(errMsg.split(':')[1], 10);
      outputAuthError(filePath, statusCode);
    } else if (errMsg.startsWith('RATE_LIMIT:')) {
      const retryAfter = errMsg.split(':')[1];
      outputRateLimitError(filePath, retryAfter ? parseInt(retryAfter, 10) : null);
    } else if (errMsg.startsWith('API_ERROR:')) {
      const parts = errMsg.split(':');
      const statusCode = parseInt(parts[1], 10);
      const body = parts.slice(2).join(':');
      outputApiError(filePath, statusCode, body);
    } else if (errMsg === 'TIMEOUT' || errMsg.includes('timed out') || errMsg.includes('timeout')) {
      const timeout = parseInt(process.env.CCS_IMAGE_ANALYSIS_TIMEOUT || DEFAULT_TIMEOUT_SEC, 10);
      outputTimeoutError(filePath, timeout);
    } else if (
      errMsg.includes('ECONNREFUSED') ||
      errMsg.includes('ENOTFOUND') ||
      errMsg.includes('ENETUNREACH') ||
      errMsg.includes('EAI_AGAIN')
    ) {
      outputCliProxyUnavailableFallback(filePath);
    } else if (errMsg.includes('EACCES') || errMsg.includes('EPERM')) {
      outputFileAccessError(filePath, errMsg);
    } else {
      outputUnknownError(filePath, errMsg);
    }
  }
}
