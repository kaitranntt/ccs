/**
 * CLIProxy stats router: stats, status, proxy lifecycle, models, versions, and
 * install endpoints. Delegates quota, error-log, config/auth-files/model-update,
 * and restart routes to focused submodules.
 *
 * Default export is the Express Router. Re-exported as the barrel default.
 */

import { Router, Request, Response } from 'express';
import {
  fetchCliproxyStats,
  fetchCliproxyModels,
  isCliproxyRunning,
} from '../../../cliproxy/services/stats-fetcher';
import {
  getProxyStatus as getProxyProcessStatus,
  stopProxy,
} from '../../../cliproxy/session-tracker';
import { ensureCliproxyService } from '../../../cliproxy/service-manager';
import { getStoredConfiguredBackend } from '../../../cliproxy/binary-manager';
import { isNewerVersion, isVersionFaulty } from '../../../cliproxy/binary/version-checker';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
} from '../../../cliproxy/binary/platform-detector';
import { resolveLifecyclePort } from '../../../cliproxy/config/port-manager';
import { installDashboardCliproxyVersion } from '../../services/cliproxy-dashboard-install-service';
import { requireLocalAccessWhenAuthDisabled } from '../../middleware/auth-middleware';
import { logger } from './shared';
import {
  resolveCliproxyUpdateCheckPayload,
  resolveCliproxyVersionsPayload,
} from './version-helpers';
import { registerQuotaRoutes } from './quota-routes';
import { registerErrorLogRoutes } from './error-log-routes';
import { registerConfigRoutes } from './config-routes';
import { registerCliproxyRestartRoute } from './restart-route';

const router = Router();

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

/**
 * Shared handler for /stats and /usage endpoints.
 */
const handleStatsRequest = async (_req: Request, res: Response): Promise<void> => {
  try {
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({
        error: 'CLIProxy Plus not running',
        message: 'Start a CLIProxy session (gemini, codex, claude, agy, ghcp) to collect stats',
      });
      return;
    }

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

router.get('/stats', handleStatsRequest);
router.get('/usage', handleStatsRequest);

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

router.get('/proxy-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const port = resolveLifecyclePort();
    const sessionStatus = getProxyProcessStatus(port);

    if (sessionStatus.running) {
      res.json(sessionStatus);
      return;
    }

    const actuallyRunning = await isCliproxyRunning(port);

    if (actuallyRunning) {
      res.json({ running: true, port, sessionCount: 0 });
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

router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const running = await isCliproxyRunning();
    if (!running) {
      res.status(503).json({
        error: 'CLIProxy Plus not running',
        message: 'Start a CLIProxy session (gemini, codex, claude, agy) to fetch available models',
      });
      return;
    }

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

// Delegated route groups. Registration order is preserved from the pre-split
// god file: error-logs, config/auth-files/model-update, quota, versions,
// install, restart.
registerErrorLogRoutes(router);
registerConfigRoutes(router);
registerQuotaRoutes(router);

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

router.post('/install', async (req: Request, res: Response): Promise<void> => {
  try {
    const { version, force } = req.body;

    if (!version || typeof version !== 'string') {
      res.status(400).json({ error: 'Missing required field: version' });
      return;
    }

    if (!/^\d+\.\d+\.\d+(-\d+)?$/.test(version)) {
      res.status(400).json({ error: 'Invalid version format. Expected: X.Y.Z or X.Y.Z-N' });
      return;
    }

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

    res.json({ version, isFaulty, isExperimental, ...installResult });
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

registerCliproxyRestartRoute(router);

export default router;
