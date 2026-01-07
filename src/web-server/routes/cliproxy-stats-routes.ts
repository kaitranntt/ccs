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
} from '../../cliproxy/stats-fetcher';
import { fetchAccountQuota } from '../../cliproxy/quota-fetcher';
import type { CLIProxyProvider } from '../../cliproxy/types';
import {
  getCliproxyWritablePath,
  getCliproxyConfigPath,
  getAuthDir,
} from '../../cliproxy/config-generator';
import { getProxyStatus as getProxyProcessStatus, stopProxy } from '../../cliproxy/session-tracker';
import { ensureCliproxyService } from '../../cliproxy/service-manager';
import {
  checkCliproxyUpdate,
  getInstalledCliproxyVersion,
  installCliproxyVersion,
} from '../../cliproxy/binary-manager';
import {
  fetchAllVersions,
  isNewerVersion,
  isVersionFaulty,
} from '../../cliproxy/binary/version-checker';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
} from '../../cliproxy/platform-detector';

const router = Router();

/**
 * Extract status code and model from error log file (lightweight parsing)
 * Reads first 4KB for model, last 2KB for status code
 */
async function extractErrorLogMetadata(
  filePath: string
): Promise<{ statusCode?: number; model?: string }> {
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;

    // Read first 4KB for model (in request body)
    const startBuffer = Buffer.alloc(Math.min(4096, fileSize));
    fs.readSync(fd, startBuffer, 0, startBuffer.length, 0);
    const startContent = startBuffer.toString('utf-8');

    // Extract model from request body JSON: "model":"gemini-3-flash-preview"
    const modelMatch = startContent.match(/"model"\s*:\s*"([^"]+)"/);
    const model = modelMatch ? modelMatch[1] : undefined;

    // Read last 2KB for status code (in response section at end)
    let statusCode: number | undefined;
    if (fileSize > 2048) {
      const endBuffer = Buffer.alloc(2048);
      fs.readSync(fd, endBuffer, 0, 2048, fileSize - 2048);
      const endContent = endBuffer.toString('utf-8');
      const statusMatch = endContent.match(/Status:\s*(\d{3})/);
      statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    } else {
      // Small file - check start content for status
      const statusMatch = startContent.match(/Status:\s*(\d{3})/);
      statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    }

    fs.closeSync(fd);
    return { statusCode, model };
  } catch {
    return {};
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
        message: 'Start a CLIProxy session (gemini, codex, agy) to collect stats',
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
    res.status(500).json({ error: (error as Error).message });
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
    const running = await isCliproxyRunning();
    res.json({ running });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cliproxy/proxy-status - Get detailed proxy process status
 * Returns: { running, port?, pid?, sessionCount?, startedAt? }
 * Combines session tracker data with actual port check for accuracy
 */
router.get('/proxy-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    // First check session tracker for detailed info
    const sessionStatus = getProxyProcessStatus();

    // If session tracker says running, trust it
    if (sessionStatus.running) {
      res.json(sessionStatus);
      return;
    }

    // Session tracker says not running, but proxy might be running without session tracking
    // (e.g., started before session persistence was implemented)
    const actuallyRunning = await isCliproxyRunning();

    if (actuallyRunning) {
      // Proxy running but no session lock - legacy/untracked instance
      res.json({
        running: true,
        port: 8317, // Default port
        sessionCount: 0, // Unknown sessions
        // No pid/startedAt since we don't have session lock
      });
    } else {
      res.json(sessionStatus);
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/proxy-start - Start the CLIProxy service
 * Returns: { started, alreadyRunning, port, error? }
 * Starts proxy in background if not already running
 */
router.post('/proxy-start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await ensureCliproxyService();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/proxy-stop - Stop the CLIProxy service
 * Returns: { stopped, pid?, sessionCount?, error? }
 */
router.post('/proxy-stop', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await stopProxy();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cliproxy/update-check - Check for CLIProxyAPI binary updates
 * Returns: { hasUpdate, currentVersion, latestVersion, fromCache }
 */
router.get('/update-check', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await checkCliproxyUpdate();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
        message: 'Start a CLIProxy session (gemini, codex, agy) to fetch available models',
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
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
    const { model } = req.body;

    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'Missing required field: model' });
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
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.env = settings.env || {};
    settings.env.ANTHROPIC_MODEL = model;

    // Write atomically
    const tempPath = settingsPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(tempPath, settingsPath);

    res.json({ success: true, provider, model });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==================== Account Quota ====================

/**
 * GET /api/cliproxy/quota/:provider/:accountId - Get quota for a specific account
 * Returns: QuotaResult with model quotas and reset times
 */
router.get('/quota/:provider/:accountId', async (req: Request, res: Response): Promise<void> => {
  const { provider, accountId } = req.params;

  // Validate provider
  const validProviders: CLIProxyProvider[] = [
    'agy',
    'gemini',
    'codex',
    'qwen',
    'iflow',
    'kiro',
    'ghcp',
  ];
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
    const result = await fetchAccountQuota(provider as CLIProxyProvider, accountId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==================== Version Management ====================

/**
 * GET /api/cliproxy/versions - Get all available CLIProxyAPI versions
 * Returns: { versions, latestStable, latest, currentVersion, maxStableVersion }
 */
router.get('/versions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await fetchAllVersions();
    const currentVersion = getInstalledCliproxyVersion();

    res.json({
      ...result,
      currentVersion,
      maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
      faultyRange: CLIPROXY_FAULTY_RANGE,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/install - Install specific CLIProxyAPI version
 * Body: { version: string, force?: boolean }
 * Returns: { success, requiresConfirmation?, message? }
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
        requiresConfirmation: true,
        message: `Version ${version} has known bugs (v${CLIPROXY_FAULTY_RANGE.min.replace(/-\d+$/, '')}-${CLIPROXY_FAULTY_RANGE.max.replace(/-\d+$/, '')}). Set force=true to proceed.`,
      });
      return;
    }

    if (isExperimental && !force) {
      res.json({
        success: false,
        requiresConfirmation: true,
        message: `Version ${version} is experimental (above stable ${CLIPROXY_MAX_STABLE_VERSION.replace(/-\d+$/, '')}). Set force=true to proceed.`,
      });
      return;
    }

    // Stop proxy first if running
    await stopProxy();

    // Small delay to ensure port is released
    await new Promise((r) => setTimeout(r, 500));

    // Install the version
    await installCliproxyVersion(version, true);

    res.json({
      success: true,
      version,
      isFaulty,
      isExperimental,
      message: `Successfully installed CLIProxy Plus v${version}`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/restart - Restart CLIProxy without version change
 * Returns: { success, port?, error? }
 */
router.post('/restart', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Stop proxy first
    await stopProxy();

    // Small delay to ensure port is released
    await new Promise((r) => setTimeout(r, 500));

    // Start proxy
    const startResult = await ensureCliproxyService();

    if (startResult.started || startResult.alreadyRunning) {
      res.json({ success: true, port: startResult.port });
    } else {
      res.json({ success: false, error: startResult.error || 'Failed to start proxy' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
