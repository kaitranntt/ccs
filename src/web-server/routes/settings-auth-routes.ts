/**
 * Auth token and Antigravity risk bypass sub-routes for /api/settings/auth/*.
 */

import { Router, Request, Response } from 'express';
import {
  generateSecureToken,
  maskToken,
  getAuthSummary,
  setGlobalApiKey,
  setGlobalManagementSecret,
  resetAuthToDefaults,
} from '../../cliproxy';
import { regenerateConfig } from '../../cliproxy/config/config-generator';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import { createRouteErrorHelpers } from './route-helpers';
import { classifyConfigSaveFailure, requireSensitiveLocalAccess } from './settings-path-resolver';

const { respondInternalError } = createRouteErrorHelpers('settings-routes');

export function registerSettingsAuthRoutes(router: Router): void {
  /** GET /api/settings/auth/antigravity-risk - Get shared power user bypass setting */
  router.get('/auth/antigravity-risk', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const config = loadOrCreateUnifiedConfig();
      res.json({
        antigravityAckBypass: config.cliproxy?.safety?.antigravity_ack_bypass === true,
      });
    } catch (error) {
      respondInternalError(res, error, 'Failed to load power user mode.');
    }
  });

  /** PUT /api/settings/auth/antigravity-risk - Update shared power user bypass setting */
  router.put('/auth/antigravity-risk', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const body = req.body as { antigravityAckBypass?: unknown } | null | undefined;
      const antigravityAckBypass =
        body && typeof body === 'object' ? body.antigravityAckBypass : undefined;

      if (typeof antigravityAckBypass !== 'boolean') {
        res.status(400).json({ error: 'antigravityAckBypass must be a boolean' });
        return;
      }

      const updatedConfig = mutateConfig((config) => {
        config.cliproxy.safety = {
          ...(config.cliproxy.safety ?? {}),
          antigravity_ack_bypass: antigravityAckBypass,
        };
      });

      res.json({
        success: true,
        antigravityAckBypass: updatedConfig.cliproxy?.safety?.antigravity_ack_bypass === true,
      });
    } catch (error) {
      const classified = classifyConfigSaveFailure(error);
      respondInternalError(res, error, classified.message, classified.statusCode);
    }
  });

  /** GET /api/settings/auth/tokens - Get current auth token status (masked) */
  router.get('/auth/tokens', (_req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(_req, res)) return;

    try {
      const summary = getAuthSummary();

      res.json({
        apiKey: {
          value: maskToken(summary.apiKey.value),
          isCustom: summary.apiKey.isCustom,
        },
        managementSecret: {
          value: maskToken(summary.managementSecret.value),
          isCustom: summary.managementSecret.isCustom,
        },
      });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });

  /**
   * GET /api/settings/auth/tokens/raw - Get current auth tokens unmasked
   * NOTE: Sensitive endpoint - no caching, localhost only
   */
  router.get('/auth/tokens/raw', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      res.setHeader('Cache-Control', 'no-store');

      const summary = getAuthSummary();

      res.json({
        apiKey: {
          value: summary.apiKey.value,
          isCustom: summary.apiKey.isCustom,
        },
        managementSecret: {
          value: summary.managementSecret.value,
          isCustom: summary.managementSecret.isCustom,
        },
      });
    } catch (error) {
      respondInternalError(res, error, 'Failed to load raw auth tokens.');
    }
  });

  /** PUT /api/settings/auth/tokens - Update auth tokens */
  router.put('/auth/tokens', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const { apiKey, managementSecret } = req.body;

      if (apiKey !== undefined) {
        setGlobalApiKey(apiKey || undefined);
      }

      if (managementSecret !== undefined) {
        setGlobalManagementSecret(managementSecret || undefined);
      }

      regenerateConfig();

      const summary = getAuthSummary();
      res.json({
        success: true,
        apiKey: {
          value: maskToken(summary.apiKey.value),
          isCustom: summary.apiKey.isCustom,
        },
        managementSecret: {
          value: maskToken(summary.managementSecret.value),
          isCustom: summary.managementSecret.isCustom,
        },
        message: 'Restart CLIProxy to apply changes',
      });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });

  /** POST /api/settings/auth/tokens/regenerate-secret - Generate new management secret */
  router.post('/auth/tokens/regenerate-secret', (_req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(_req, res)) return;

    try {
      const newSecret = generateSecureToken(32);
      setGlobalManagementSecret(newSecret);

      regenerateConfig();

      res.json({
        success: true,
        managementSecret: {
          value: maskToken(newSecret),
          isCustom: true,
        },
        message: 'Restart CLIProxy to apply changes',
      });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });

  /** POST /api/settings/auth/tokens/reset - Reset auth tokens to defaults */
  router.post('/auth/tokens/reset', (_req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(_req, res)) return;

    try {
      resetAuthToDefaults();

      regenerateConfig();

      const summary = getAuthSummary();
      res.json({
        success: true,
        apiKey: {
          value: maskToken(summary.apiKey.value),
          isCustom: summary.apiKey.isCustom,
        },
        managementSecret: {
          value: maskToken(summary.managementSecret.value),
          isCustom: summary.managementSecret.isCustom,
        },
        message: 'Tokens reset to defaults. Restart CLIProxy to apply.',
      });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });
}
