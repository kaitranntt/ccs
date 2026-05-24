/**
 * Cursor Routes - Cursor IDE integration via cursor proxy daemon
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  getDaemonStatus,
  getAvailableModels,
  startDaemon,
  stopDaemon,
  checkAuthStatus,
  autoDetectTokens,
  probeCursorRuntime,
  saveCredentials,
  validateToken,
} from '../../cursor';

import cursorSettingsRoutes from './cursor-settings-routes';
import { getCursorConfig } from '../../config/config-loader-facade';
import { isDashboardWebSocketOriginAllowed } from '../middleware/auth-middleware';

const router = Router();

interface DaemonStartPreconditionInput {
  enabled: boolean;
  authenticated: boolean;
  tokenExpired?: boolean;
}

interface DaemonStartPreconditionError {
  status: number;
  error: string;
}

export function getAutoDetectFailureStatus(
  reason?: ReturnType<typeof autoDetectTokens>['reason']
): number {
  switch (reason) {
    case 'sqlite_unavailable':
      return 503;
    case 'db_query_failed':
      return 500;
    case 'invalid_token_format':
      return 400;
    default:
      return 404;
  }
}

function getPublicAutoDetectError(result: ReturnType<typeof autoDetectTokens>): string {
  switch (result.reason) {
    case 'db_not_found':
      return 'Cursor state database not found on this host.';
    case 'sqlite_unavailable':
      return 'Cursor state database was found, but sqlite3 is not available in PATH.';
    case 'db_query_failed':
      return 'Cursor state database was found, but CCS could not query it.';
    default:
      return result.error ?? 'Token not found';
  }
}

export function getDaemonStartPreconditionError(
  input: DaemonStartPreconditionInput
): DaemonStartPreconditionError | null {
  if (!input.enabled) {
    return {
      status: 400,
      error: 'Cursor integration is disabled. Enable it before starting daemon.',
    };
  }

  if (!input.authenticated) {
    return {
      status: 401,
      error: 'Cursor authentication required. Import credentials before starting daemon.',
    };
  }

  if (input.tokenExpired) {
    return {
      status: 401,
      error: 'Cursor credentials expired. Re-authenticate before starting daemon.',
    };
  }

  return null;
}

// Mount settings sub-routes
router.use('/settings', cursorSettingsRoutes);

/**
 * GET /api/cursor/status - Get Cursor status (auth + daemon)
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cursorConfig = getCursorConfig();
    const authStatus = checkAuthStatus();
    const daemonStatus = await getDaemonStatus(cursorConfig.port);

    res.json({
      enabled: cursorConfig.enabled,
      authenticated: authStatus.authenticated,
      auth_method: authStatus.credentials?.authMethod ?? null,
      token_age: authStatus.tokenAge ?? null,
      token_expired: authStatus.expired ?? false,
      daemon_running: daemonStatus.running,
      port: cursorConfig.port,
      auto_start: cursorConfig.auto_start,
      ghost_mode: cursorConfig.ghost_mode,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cursor/auth/import - Import Cursor token manually
 */
router.post('/auth/import', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, machineId } = req.body;
    if (!accessToken || !machineId) {
      res.status(400).json({ error: 'Missing accessToken or machineId' });
      return;
    }

    // Validate token format
    if (!validateToken(accessToken, machineId)) {
      res.status(400).json({ error: 'Invalid token or machine ID format' });
      return;
    }

    // Save credentials
    saveCredentials({
      accessToken,
      machineId,
      authMethod: 'manual',
      importedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Token imported successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cursor/auth/auto-detect - Auto-detect token from SQLite
 */
router.post('/auth/auto-detect', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = autoDetectTokens();

    if (!result.found || !result.accessToken || !result.machineId) {
      const status = getAutoDetectFailureStatus(result.reason);
      res.status(status).json({
        error: getPublicAutoDetectError(result),
        reason: result.reason ?? null,
      });
      return;
    }

    // Save credentials
    saveCredentials({
      accessToken: result.accessToken,
      machineId: result.machineId,
      authMethod: 'auto-detect',
      importedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Token auto-detected and imported' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cursor/models - List available models
 */
router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cursorConfig = getCursorConfig();
    const models = await getAvailableModels(cursorConfig.port);
    res.json({ models, current: cursorConfig.model });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cursor/probe - Run a live authenticated runtime probe
 */
router.post('/probe', async (req: Request, res: Response): Promise<void> => {
  if (!isDashboardWebSocketOriginAllowed(req)) {
    res.status(403).json({ error: 'Cross-origin probe requests are not allowed.' });
    return;
  }

  try {
    const cursorConfig = getCursorConfig();
    const result = await probeCursorRuntime(cursorConfig);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cursor/daemon/start - Start cursor proxy daemon
 * Path matches copilot convention: /api/{provider}/daemon/{action}
 */
router.post('/daemon/start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cursorConfig = getCursorConfig();
    const authStatus = checkAuthStatus();
    const preconditionError = getDaemonStartPreconditionError({
      enabled: cursorConfig.enabled,
      authenticated: authStatus.authenticated,
      tokenExpired: authStatus.expired ?? false,
    });

    if (preconditionError) {
      res.status(preconditionError.status).json({
        success: false,
        error: preconditionError.error,
      });
      return;
    }

    const result = await startDaemon({
      port: cursorConfig.port,
      ghost_mode: cursorConfig.ghost_mode,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cursor/daemon/stop - Stop cursor proxy daemon
 * Path matches copilot convention: /api/{provider}/daemon/{action}
 */
router.post('/daemon/stop', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await stopDaemon();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
