/**
 * CLIProxy Stats Routes - Stats, status, models, error logs for CLIProxyAPI
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  fetchCliproxyStats,
  fetchCliproxyModels,
  isCliproxyRunning,
  fetchCliproxyErrorLogs,
  fetchCliproxyErrorLogContent,
} from '../../cliproxy/services/stats-fetcher';
import { fetchAccountQuota } from '../../cliproxy/quota/quota-fetcher';
import { fetchCodexQuota } from '../../cliproxy/quota/quota-fetcher-codex';
import { fetchClaudeQuota } from '../../cliproxy/quota/quota-fetcher-claude';
import { fetchGeminiCliQuota } from '../../cliproxy/quota/quota-fetcher-gemini-cli';
import { fetchGhcpQuota } from '../../cliproxy/quota/quota-fetcher-ghcp';
import { getCachedQuota, setCachedQuota } from '../../cliproxy/quota/quota-response-cache';
import type {
  CodexQuotaResult,
  ClaudeQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from '../../cliproxy/quota/quota-types';
import type { QuotaResult } from '../../cliproxy/quota/quota-fetcher';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { CLIPROXY_PROFILES } from '../../auth/profile-detector';
import {
  getCliproxyWritablePath,
  getCliproxyConfigPath,
  getAuthDir,
} from '../../cliproxy/config/config-generator';
import { getProxyStatus as getProxyProcessStatus, stopProxy } from '../../cliproxy/session-tracker';
import { ensureCliproxyService } from '../../cliproxy/service-manager';
import {
  checkCliproxyUpdate,
  getInstalledCliproxyVersion,
  getStoredConfiguredBackend,
} from '../../cliproxy/binary-manager';
import {
  fetchAllVersions,
  isNewerVersion,
  isVersionFaulty,
} from '../../cliproxy/binary/version-checker';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
} from '../../cliproxy/binary/platform-detector';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import {
  MODEL_ENV_VAR_KEYS,
  canonicalizeModelIdForProvider,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/ai-providers/model-id-normalizer';
import { installDashboardCliproxyVersion } from '../services/cliproxy-dashboard-install-service';
import { restartDashboardCliproxy } from '../services/cliproxy-dashboard-restart-service';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { createLogger } from '../../services/logging';

const logger = createLogger('web-server:routes:cliproxy-stats');

const router = Router();
type RestartDashboardCliproxyHandler = typeof restartDashboardCliproxy;

const QUOTA_RATE_LIMIT_WINDOW_MS = 60_000;
const QUOTA_RATE_LIMIT_MAX_REQUESTS = 120;

interface QuotaRateLimitEntry {
  windowStart: number;
  count: number;
}

const quotaRateLimits = new Map<string, QuotaRateLimitEntry>();

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy management endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

function buildQuotaRateLimitKey(req: Request, provider: string): string {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  return `${clientIp}:${provider}`;
}

function isQuotaRouteRateLimited(req: Request, provider: string): boolean {
  const key = buildQuotaRateLimitKey(req, provider);
  const now = Date.now();

  // Evict stale entries to prevent unbounded memory growth
  if (quotaRateLimits.size > 1000) {
    for (const [k, v] of quotaRateLimits) {
      if (now - v.windowStart >= QUOTA_RATE_LIMIT_WINDOW_MS * 2) {
        quotaRateLimits.delete(k);
      }
    }
  }

  const current = quotaRateLimits.get(key);

  if (!current || now - current.windowStart >= QUOTA_RATE_LIMIT_WINDOW_MS) {
    quotaRateLimits.set(key, { windowStart: now, count: 1 });
    return false;
  }

  current.count += 1;
  quotaRateLimits.set(key, current);
  return current.count > QUOTA_RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Cache only stable failures; skip transient network errors (timeouts, 429s, 5xx).
 * Generic across all quota result types.
 */
export function shouldCacheQuotaResult(result: {
  success: boolean;
  needsReauth?: boolean;
  isForbidden?: boolean;
  httpStatus?: number;
  retryable?: boolean;
  error?: string;
}): boolean {
  if (result.success) return true;
  if (result.needsReauth || result.isForbidden) return true;
  if (result.retryable === true) return false;
  if (result.retryable === false) return true;
  if (typeof result.httpStatus === 'number') {
    if (result.httpStatus === 429 || result.httpStatus === 408 || result.httpStatus >= 500) {
      return false;
    }
    if (result.httpStatus >= 400 && result.httpStatus < 500) {
      return true;
    }
  }
  const msg = (result.error || '').toLowerCase();
  if (!msg) return false;
  const transientPatterns = ['timeout', 'rate limited', 'api error: 5', 'fetch failed'];
  return !transientPatterns.some((p) => msg.includes(p));
}

function buildUpdateCheckFallback(
  backend: ReturnType<typeof getStoredConfiguredBackend>,
  getInstalledVersionFn: typeof getInstalledCliproxyVersion = getInstalledCliproxyVersion
) {
  const currentVersion = getInstalledVersionFn(backend);
  const isStable = !isNewerVersion(currentVersion, CLIPROXY_MAX_STABLE_VERSION);
  const backendLabel = backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';

  return {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    fromCache: true,
    checkedAt: Date.now(),
    backend,
    backendLabel,
    isStable,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    stabilityMessage: isStable
      ? undefined
      : `v${currentVersion} has known stability issues. Max stable: v${CLIPROXY_MAX_STABLE_VERSION}`,
  };
}

function buildVersionsFallback(
  backend: ReturnType<typeof getStoredConfiguredBackend>,
  getInstalledVersionFn: typeof getInstalledCliproxyVersion = getInstalledCliproxyVersion
) {
  const currentVersion = getInstalledVersionFn(backend);

  return {
    versions: currentVersion ? [currentVersion] : [],
    latestStable: currentVersion || CLIPROXY_MAX_STABLE_VERSION,
    latest: currentVersion || CLIPROXY_MAX_STABLE_VERSION,
    fromCache: true,
    checkedAt: Date.now(),
    currentVersion,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    faultyRange: CLIPROXY_FAULTY_RANGE,
  };
}

interface ResolveUpdateCheckDeps {
  checkCliproxyUpdateFn?: typeof checkCliproxyUpdate;
  getInstalledVersionFn?: typeof getInstalledCliproxyVersion;
}

interface ResolveVersionsDeps {
  fetchAllVersionsFn?: typeof fetchAllVersions;
  getInstalledVersionFn?: typeof getInstalledCliproxyVersion;
}

export async function resolveCliproxyUpdateCheckPayload(
  backend: ReturnType<typeof getStoredConfiguredBackend>,
  deps: ResolveUpdateCheckDeps = {}
) {
  const checkCliproxyUpdateFn = deps.checkCliproxyUpdateFn ?? checkCliproxyUpdate;
  const getInstalledVersionFn = deps.getInstalledVersionFn ?? getInstalledCliproxyVersion;

  return checkCliproxyUpdateFn(backend).catch(() =>
    buildUpdateCheckFallback(backend, getInstalledVersionFn)
  );
}

export async function resolveCliproxyVersionsPayload(
  backend: ReturnType<typeof getStoredConfiguredBackend>,
  deps: ResolveVersionsDeps = {}
) {
  const fetchAllVersionsFn = deps.fetchAllVersionsFn ?? fetchAllVersions;
  const getInstalledVersionFn = deps.getInstalledVersionFn ?? getInstalledCliproxyVersion;
  const result = await fetchAllVersionsFn(false, backend).catch(() => null);
  if (!result) {
    return buildVersionsFallback(backend, getInstalledVersionFn);
  }

  return {
    ...result,
    currentVersion: getInstalledVersionFn(backend),
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    faultyRange: CLIPROXY_FAULTY_RANGE,
  };
}

/**
 * Extract status code and model from error log file (lightweight parsing).
 * Reads first 4KB for model, last 2KB for status code. Async to avoid blocking event loop.
 */
async function extractErrorLogMetadata(
  filePath: string
): Promise<{ statusCode?: number; model?: string }> {
  let fh: fs.promises.FileHandle | null = null;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const stat = await fh.stat();
    const fileSize = stat.size;

    // Read first 4KB for model (in request body)
    const startBuffer = Buffer.alloc(Math.min(4096, fileSize));
    await fh.read(startBuffer, 0, startBuffer.length, 0);
    const startContent = startBuffer.toString('utf-8');

    // Extract model from request body JSON: "model":"gemini-3-flash-preview"
    const modelMatch = startContent.match(/"model"\s*:\s*"([^"]+)"/);
    const model = modelMatch ? modelMatch[1] : undefined;

    // Read last 2KB for status code (in response section at end)
    let statusCode: number | undefined;
    if (fileSize > 2048) {
      const endBuffer = Buffer.alloc(2048);
      await fh.read(endBuffer, 0, 2048, fileSize - 2048);
      const endContent = endBuffer.toString('utf-8');
      const statusMatch = endContent.match(/Status:\s*(\d{3})/);
      statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    } else {
      // Small file - check start content for status
      const statusMatch = startContent.match(/Status:\s*(\d{3})/);
      statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    }

    return { statusCode, model };
  } catch {
    return {};
  } finally {
    await fh?.close();
  }
}

/**
 * Shared handler for stats/usage endpoint
 */
const handleStatsRequest = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if proxy is running first
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({
        error: 'CLIProxy Plus not running',
        message: 'Start a CLIProxy session (gemini, codex, claude, agy, ghcp) to collect stats',
      });
      return;
    }

    // Fetch stats from management API
    const stats = await fetchCliproxyStats();
    if (!stats) {
      res.status(503).json({
        error: 'Stats unavailable',
        message: 'CLIProxy Plus is running but stats endpoint not responding',
      });
      return;
    }

    res.json(stats);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/cliproxy/stats - Get CLIProxyAPI usage statistics
 * Returns: CliproxyStats or error if proxy not running
 */
router.get('/stats', handleStatsRequest);

/**
 * GET /api/cliproxy/usage - Alias for /stats (frontend compatibility)
 */
router.get('/usage', handleStatsRequest);

/**
 * GET /api/cliproxy/status - Check CLIProxyAPI running status
 * Returns: { running: boolean }
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const running = await isCliproxyRunning(resolveLifecyclePort());
    res.json({ running });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/proxy-status - Get detailed proxy process status
 * Returns: { running, port?, pid?, sessionCount?, startedAt? }
 * Combines session tracker data with actual port check for accuracy
 */
router.get('/proxy-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const port = resolveLifecyclePort();
    // First check session tracker for detailed info
    const sessionStatus = getProxyProcessStatus(port);

    // If session tracker says running, trust it
    if (sessionStatus.running) {
      res.json(sessionStatus);
      return;
    }

    // Session tracker says not running, but proxy might be running without session tracking
    // (e.g., started before session persistence was implemented)
    const actuallyRunning = await isCliproxyRunning(port);

    if (actuallyRunning) {
      // Proxy running but no session lock - legacy/untracked instance
      res.json({
        running: true,
        port,
        sessionCount: 0, // Unknown sessions
        // No pid/startedAt since we don't have session lock
      });
    } else {
      res.json(sessionStatus);
    }
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/cliproxy/proxy-start - Start the CLIProxy service
 * Returns: { started, alreadyRunning, port, error? }
 * Starts proxy in background if not already running
 */
router.post('/proxy-start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await ensureCliproxyService(resolveLifecyclePort());
    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/cliproxy/proxy-stop - Stop the CLIProxy service
 * Returns: { stopped, pid?, sessionCount?, error? }
 */
router.post('/proxy-stop', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await stopProxy(resolveLifecyclePort());
    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/update-check - Check for CLIProxyAPI binary updates
 * Returns: { hasUpdate, currentVersion, latestVersion, fromCache }
 */
router.get('/update-check', async (_req: Request, res: Response): Promise<void> => {
  try {
    const backend = getStoredConfiguredBackend();
    const result = await resolveCliproxyUpdateCheckPayload(backend);

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/models - Get available models from CLIProxyAPI
 * Returns: { models: CliproxyModel[], byCategory: Record<string, CliproxyModel[]>, totalCount: number }
 */
router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if proxy is running first
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({
        error: 'CLIProxy Plus not running',
        message: 'Start a CLIProxy session (gemini, codex, claude, agy) to fetch available models',
      });
      return;
    }

    // Fetch models from /v1/models endpoint
    const modelsResponse = await fetchCliproxyModels();
    if (!modelsResponse) {
      res.status(503).json({
        error: 'Models unavailable',
        message: 'CLIProxy Plus is running but /v1/models endpoint not responding',
      });
      return;
    }

    res.json(modelsResponse);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Error Logs ====================

/**
 * GET /api/cliproxy/error-logs - Get list of error log files
 * Returns: { files: CliproxyErrorLog[] } or error if proxy not running
 */
router.get('/error-logs', async (_req: Request, res: Response): Promise<void> => {
  try {
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({
        error: 'CLIProxy Plus not running',
        message: 'Start a CLIProxy session to view error logs',
      });
      return;
    }

    const files = await fetchCliproxyErrorLogs();
    if (files === null) {
      res.status(503).json({
        error: 'Error logs unavailable',
        message: 'CLIProxy Plus is running but error logs endpoint not responding',
      });
      return;
    }

    // Inject absolute paths and extract metadata from each file
    const logsDir = path.join(getCliproxyWritablePath(), 'logs');
    const filesWithMetadata = await Promise.all(
      files.map(async (file) => {
        const absolutePath = path.join(logsDir, file.name);
        const metadata = await extractErrorLogMetadata(absolutePath);
        return {
          ...file,
          absolutePath,
          statusCode: metadata.statusCode,
          model: metadata.model,
        };
      })
    );

    res.json({ files: filesWithMetadata });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/error-logs/:name - Get content of a specific error log
 * Returns: plain text log content
 */
router.get('/error-logs/:name', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params;

  // Validate filename format and prevent path traversal
  if (
    !name ||
    !name.startsWith('error-') ||
    !name.endsWith('.log') ||
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid error log filename' });
    return;
  }

  try {
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({ error: 'CLIProxy Plus not running' });
      return;
    }

    const content = await fetchCliproxyErrorLogContent(name);
    if (content === null) {
      res.status(404).json({ error: 'Error log not found' });
      return;
    }

    res.type('text/plain').send(content);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Config File ====================

/**
 * GET /api/cliproxy/config.yaml - Get CLIProxy YAML config content
 * Returns: plain text YAML content
 */
router.get('/config.yaml', async (_req: Request, res: Response): Promise<void> => {
  try {
    const configPath = getCliproxyConfigPath();
    if (!fs.existsSync(configPath)) {
      res.status(404).json({ error: 'Config file not found' });
      return;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    res.type('text/yaml').send(content);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/cliproxy/config.yaml - Save CLIProxy YAML config content
 * Body: { content: string }
 * Returns: { success: true, path: string }
 */
router.put('/config.yaml', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content } = req.body;

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Missing required field: content' });
      return;
    }

    const configPath = getCliproxyConfigPath();

    // Ensure parent directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write atomically
    const tempPath = configPath + '.tmp';
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, configPath);

    res.json({ success: true, path: configPath });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Auth Files ====================

/**
 * GET /api/cliproxy/auth-files - List auth files in auth directory
 * Returns: { files: Array<{ name, size, mtime }> }
 */
router.get('/auth-files', async (_req: Request, res: Response): Promise<void> => {
  try {
    const authDir = getAuthDir();

    if (!fs.existsSync(authDir)) {
      res.json({ files: [] });
      return;
    }

    const entries = fs.readdirSync(authDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(authDir, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          size: stat.size,
          mtime: stat.mtime.getTime(),
        };
      });

    res.json({ files, directory: authDir });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/auth-files/download - Download auth file content
 * Query: ?name=filename
 * Returns: file content as octet-stream
 */
router.get('/auth-files/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.query;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Missing required query parameter: name' });
      return;
    }

    // Validate filename - prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const authDir = getAuthDir();
    const filePath = path.join(authDir, name);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Auth file not found' });
      return;
    }

    const content = fs.readFileSync(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.type('application/octet-stream').send(content);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Model Updates ====================

/**
 * PUT /api/cliproxy/models/:provider - Update model for a provider
 * Body: { model: string }
 * Returns: { success: true, provider, model }
 */
router.put('/models/:provider', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;

    // Validate provider name to prevent path traversal via crafted provider param
    if (!provider || provider.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(provider)) {
      res.status(400).json({ error: 'Invalid provider name' });
      return;
    }

    const { model } = req.body;

    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'Missing required field: model' });
      return;
    }

    if (model.length > 256) {
      res.status(400).json({ error: 'Model ID exceeds maximum length (256 characters)' });
      return;
    }

    const deniedReason = getDeniedModelIdReasonForProvider(model, provider);
    if (deniedReason) {
      res.status(400).json({ error: deniedReason });
      return;
    }

    // Get the settings file for this provider
    const ccsDir = getCliproxyWritablePath();
    const settingsPath = path.join(ccsDir, `${provider}.settings.json`);

    if (!fs.existsSync(settingsPath)) {
      res.status(404).json({ error: `Settings file not found for provider: ${provider}` });
      return;
    }

    // Read and update settings
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const canonicalModel = canonicalizeModelIdForProvider(model, provider);
    const env =
      settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
        ? settings.env
        : {};

    const previousDefault =
      typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : canonicalModel;
    const previousCanonicalDefault = canonicalizeModelIdForProvider(previousDefault, provider);

    for (const key of MODEL_ENV_VAR_KEYS) {
      if (key === 'ANTHROPIC_MODEL') {
        env[key] = canonicalModel;
        continue;
      }

      const current = env[key];
      if (typeof current !== 'string') {
        env[key] = canonicalModel;
        continue;
      }

      const canonicalCurrent = canonicalizeModelIdForProvider(current, provider);
      env[key] = canonicalCurrent === previousCanonicalDefault ? canonicalModel : canonicalCurrent;
    }
    settings.env = env;

    // Write atomically
    const tempPath = settingsPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(tempPath, settingsPath);

    res.json({ success: true, provider, model: canonicalModel });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Account Quota ====================
// NOTE: Specific routes MUST be defined BEFORE generic routes for Express routing to work correctly
// NOTE: All quota endpoints use in-memory caching (2 min TTL) to reduce external API calls

/**
 * GET /api/cliproxy/quota/codex/:accountId - Get Codex quota for a specific account
 * Returns: CodexQuotaResult with rate limit windows
 * Caching: 2 minute TTL to reduce ChatGPT API calls
 */
router.get('/quota/codex/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.params;
  if (isQuotaRouteRateLimited(req, 'codex')) {
    res
      .status(429)
      .json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
    return;
  }

  // Validate accountId - prevent path traversal
  if (
    !accountId ||
    accountId.includes('..') ||
    accountId.includes('/') ||
    accountId.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    // Check cache first
    const cached = getCachedQuota<CodexQuotaResult>('codex', accountId);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    // Fetch from external API
    const result = await fetchCodexQuota(accountId);

    // Cache successful and stable failure states; skip transient network failures.
    if (shouldCacheQuotaResult(result)) {
      setCachedQuota('codex', accountId, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/quota/claude/:accountId - Get Claude quota for a specific account
 * Returns: ClaudeQuotaResult with policy windows (5h + weekly)
 * Caching: 2 minute TTL to reduce Anthropic API calls
 */
router.get('/quota/claude/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.params;
  if (isQuotaRouteRateLimited(req, 'claude')) {
    res
      .status(429)
      .json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
    return;
  }

  // Validate accountId - prevent path traversal
  if (
    !accountId ||
    accountId.includes('..') ||
    accountId.includes('/') ||
    accountId.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    // Check cache first
    const cached = getCachedQuota<ClaudeQuotaResult>('claude', accountId);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    // Fetch from external API
    const result = await fetchClaudeQuota(accountId);

    // Cache successful and stable failure states; skip transient network failures.
    if (shouldCacheQuotaResult(result)) {
      setCachedQuota('claude', accountId, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/quota/gemini/:accountId - Get Gemini quota for a specific account
 * Returns: GeminiCliQuotaResult with quota buckets
 * Caching: 2 minute TTL to reduce Google Cloud API calls
 */
router.get('/quota/gemini/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.params;
  if (isQuotaRouteRateLimited(req, 'gemini')) {
    res
      .status(429)
      .json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
    return;
  }

  // Validate accountId - prevent path traversal
  if (
    !accountId ||
    accountId.includes('..') ||
    accountId.includes('/') ||
    accountId.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    // Check cache first
    const cached = getCachedQuota<GeminiCliQuotaResult>('gemini', accountId);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    // Fetch from external API
    const result = await fetchGeminiCliQuota(accountId);

    // Cache successful and stable failure states; skip transient network failures.
    if (shouldCacheQuotaResult(result)) {
      setCachedQuota('gemini', accountId, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/quota/ghcp/:accountId - Get GitHub Copilot (ghcp) quota for a specific account
 * Returns: GhcpQuotaResult with premium/chat/completions quota snapshots
 * Caching: 2 minute TTL to reduce GitHub API calls
 */
router.get('/quota/ghcp/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.params;
  if (isQuotaRouteRateLimited(req, 'ghcp')) {
    res
      .status(429)
      .json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
    return;
  }

  // Validate accountId - prevent path traversal
  if (
    !accountId ||
    accountId.includes('..') ||
    accountId.includes('/') ||
    accountId.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    // Check cache first
    const cached = getCachedQuota<GhcpQuotaResult>('ghcp', accountId);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    // Fetch from GitHub API
    const result = await fetchGhcpQuota(accountId);

    // Cache successful and stable failure states; skip transient network failures.
    if (shouldCacheQuotaResult(result)) {
      setCachedQuota('ghcp', accountId, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/cliproxy/quota/:provider/:accountId - Get quota for a specific account (generic)
 * Returns: QuotaResult with model quotas and reset times
 * NOTE: This generic route MUST come after specific routes (codex, claude, gemini, ghcp)
 * Caching: 2 minute TTL to reduce external API calls
 */
router.get('/quota/:provider/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { provider, accountId } = req.params;
  if (isQuotaRouteRateLimited(req, provider)) {
    res
      .status(429)
      .json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
    return;
  }

  // Validate provider - use canonical CLIPROXY_PROFILES
  const validProviders: CLIProxyProvider[] = [...CLIPROXY_PROFILES];
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({
      error: 'Invalid provider',
      message: `Provider must be one of: ${validProviders.join(', ')}`,
    });
    return;
  }

  // Validate accountId - prevent path traversal
  if (
    !accountId ||
    accountId.includes('..') ||
    accountId.includes('/') ||
    accountId.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }

  try {
    // Check cache first
    const cached = getCachedQuota<QuotaResult>(provider, accountId);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    // Fetch from external API
    const result = await fetchAccountQuota(provider as CLIProxyProvider, accountId);

    // Cache successful results
    if (result.success) {
      setCachedQuota(provider, accountId, result);
    }

    res.json(result);
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Version Management ====================

/**
 * GET /api/cliproxy/versions - Get all available CLIProxyAPI versions
 * Returns: { versions, latestStable, latest, currentVersion, maxStableVersion }
 */
router.get('/versions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const backend = getStoredConfiguredBackend();
    res.json(await resolveCliproxyVersionsPayload(backend));
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/cliproxy/install - Install specific CLIProxyAPI version
 * Body: { version: string, force?: boolean }
 * Returns: { success, restarted?, port?, requiresConfirmation?, message? }
 */
router.post('/install', async (req: Request, res: Response): Promise<void> => {
  try {
    const { version, force } = req.body;

    if (!version || typeof version !== 'string') {
      res.status(400).json({ error: 'Missing required field: version' });
      return;
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+(-\d+)?$/.test(version)) {
      res.status(400).json({ error: 'Invalid version format. Expected: X.Y.Z or X.Y.Z-N' });
      return;
    }

    // Check if version is faulty (v81-85) or experimental (above max stable)
    const isFaulty = isVersionFaulty(version);
    const isExperimental = isNewerVersion(version, CLIPROXY_MAX_STABLE_VERSION);

    if (isFaulty && !force) {
      res.json({
        success: false,
        isFaulty,
        isExperimental,
        requiresConfirmation: true,
        message: `Version ${version} has known bugs (v${CLIPROXY_FAULTY_RANGE.min.replace(/-\d+$/, '')}-${CLIPROXY_FAULTY_RANGE.max.replace(/-\d+$/, '')}). Set force=true to proceed.`,
      });
      return;
    }

    if (isExperimental && !force) {
      res.json({
        success: false,
        isFaulty,
        isExperimental,
        requiresConfirmation: true,
        message: `Version ${version} is experimental (above stable ${CLIPROXY_MAX_STABLE_VERSION.replace(/-\d+$/, '')}). Set force=true to proceed.`,
      });
      return;
    }

    const backend = getStoredConfiguredBackend();
    const installResult = await installDashboardCliproxyVersion(version, backend);

    res.json({
      version,
      isFaulty,
      isExperimental,
      ...installResult,
    });
  } catch (error) {
    logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/cliproxy/restart - Restart CLIProxy without version change
 * Returns: { success, port?, error? }
 */
export function registerCliproxyRestartRoute(
  targetRouter: Router,
  restartHandler: RestartDashboardCliproxyHandler = restartDashboardCliproxy
): void {
  targetRouter.post('/restart', async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await restartHandler();
      res.json(result);
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

registerCliproxyRestartRoute(router);

export default router;
