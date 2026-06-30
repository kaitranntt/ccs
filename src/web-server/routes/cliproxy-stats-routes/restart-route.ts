/**
 * POST /api/cliproxy/restart route registration.
 *
 * Public surface: `registerCliproxyRestartRoute` is re-exported by the barrel.
 */

import { Router, Request, Response } from 'express';
import { restartDashboardCliproxy } from '../../services/cliproxy-dashboard-restart-service';
import { logger } from './shared';

type RestartDashboardCliproxyHandler = typeof restartDashboardCliproxy;

/**
 * Registers POST `/restart` on the given router.
 *
 * Handler shape and logger.error('stats.route.error', ...) conversion are
 * preserved verbatim from the pre-split implementation.
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
