/**
 * CLIProxy Server Routes - API endpoints for proxy configuration
 *
 * Provides REST endpoints for managing CLIProxyAPI connection settings:
 * - GET /api/cliproxy-server - Get proxy configuration
 * - PUT /api/cliproxy-server - Update proxy configuration
 * - POST /api/cliproxy-server/test - Test remote connection
 */

import { Router, Request, Response } from 'express';

import { testConnection } from '../../cliproxy/services/remote-proxy-client';
import { isProxyRunning } from '../../cliproxy/services/proxy-lifecycle-service';
import { DEFAULT_BACKEND } from '../../cliproxy/binary/platform-detector';
import {
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  CliproxyServerConfig,
} from '../../config/unified-config-types';
import { CLIPROXY_PROVIDER_IDS } from '../../cliproxy/provider-capabilities';
import {
  configNeedsRegeneration,
  getManagementPanelRepository,
  regenerateConfig,
} from '../../cliproxy/config/generator';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy server endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

/**
 * GET /api/cliproxy-server - Get proxy configuration
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await loadOrCreateUnifiedConfig();
    res.json(config.cliproxy_server || DEFAULT_CLIPROXY_SERVER_CONFIG);
  } catch (error) {
    console.error('[cliproxy-server-routes] Failed to load proxy config:', error);
    res.status(500).json({ error: 'Failed to load proxy config' });
  }
});

/**
 * PUT /api/cliproxy-server - Update proxy configuration
 */
router.put('/', (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<CliproxyServerConfig>;

    // Atomic read-modify-write — avoids race between load and save
    const updated = mutateConfig((config) => {
      config.cliproxy_server = {
        remote: {
          ...DEFAULT_CLIPROXY_SERVER_CONFIG.remote,
          ...config.cliproxy_server?.remote,
          ...updates.remote,
        },
        fallback: {
          ...DEFAULT_CLIPROXY_SERVER_CONFIG.fallback,
          ...config.cliproxy_server?.fallback,
          ...updates.fallback,
        },
        local: {
          ...DEFAULT_CLIPROXY_SERVER_CONFIG.local,
          ...config.cliproxy_server?.local,
          ...updates.local,
        },
      };
    });

    res.json(updated.cliproxy_server);
  } catch (error) {
    console.error('[cliproxy-server-routes] Failed to save proxy config:', error);
    res.status(500).json({ error: 'Failed to save proxy config' });
  }
});

/**
 * GET /api/cliproxy-server/backend - Get CLIProxy backend setting
 * @returns {{ backend: 'original' | 'plus', managementPanelRepository: string }} Current backend configuration
 */
router.get('/backend', async (_req: Request, res: Response) => {
  try {
    const config = await loadOrCreateUnifiedConfig();
    res.json({
      backend: config.cliproxy?.backend ?? DEFAULT_BACKEND,
      managementPanelRepository: getManagementPanelRepository(),
    });
  } catch (error) {
    console.error('[cliproxy-server-routes] Failed to load backend config:', error);
    res.status(500).json({ error: 'Failed to load backend config' });
  }
});

/**
 * PUT /api/cliproxy-server/backend - Update CLIProxy backend setting
 * @param {Object} req.body - Request body
 * @param {'original' | 'plus'} req.body.backend - Backend to switch to
 * @param {boolean} [req.body.force=false] - Force change even if proxy is running
 * @returns {{ backend: 'original' | 'plus', managementPanelRepository: string }} Updated backend configuration
 * @throws {400} Invalid backend value
 * @throws {409} Proxy is running (unless force=true)
 */
router.put('/backend', (req: Request, res: Response) => {
  try {
    const { backend, force } = req.body;
    if (backend !== 'original' && backend !== 'plus') {
      res.status(400).json({ error: 'Invalid backend. Must be "original" or "plus"' });
      return;
    }

    // Pre-flight read: check running state before acquiring write lock
    const currentConfig = loadOrCreateUnifiedConfig();
    const currentBackend = currentConfig.cliproxy?.backend ?? DEFAULT_BACKEND;
    const localPort =
      currentConfig.cliproxy_server?.local?.port ?? DEFAULT_CLIPROXY_SERVER_CONFIG.local.port;
    if (currentBackend !== backend && isProxyRunning() && !force) {
      res.status(409).json({
        error: 'Proxy is running. Stop proxy first or use force=true to change backend.',
        proxyRunning: true,
        currentBackend,
      });
      return;
    }

    // Atomic write — avoids race between load and save
    mutateConfig((config) => {
      if (!config.cliproxy) {
        config.cliproxy = {
          backend,
          oauth_accounts: {},
          providers: [...CLIPROXY_PROVIDER_IDS],
          variants: {},
        };
      } else {
        config.cliproxy.backend = backend;
      }
    });

    if (configNeedsRegeneration(localPort)) {
      regenerateConfig(localPort);
    }

    res.json({ backend, managementPanelRepository: getManagementPanelRepository() });
  } catch (error) {
    console.error('[cliproxy-server-routes] Failed to save backend config:', error);
    res.status(500).json({ error: 'Failed to save backend config' });
  }
});

/**
 * POST /api/cliproxy-server/test - Test remote proxy connection
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { host, port, protocol, authToken, allowSelfSigned } = req.body;

    // Host is required, port is optional (uses protocol defaults)
    if (!host) {
      res.status(400).json({ error: 'Host is required' });
      return;
    }

    // Parse port - treat empty string, 0, null as "use default"
    const parsedPort = port && port !== '' ? parseInt(String(port), 10) : undefined;
    const effectivePort =
      parsedPort && !isNaN(parsedPort) && parsedPort > 0 ? parsedPort : undefined;

    const status = await testConnection({
      host,
      port: effectivePort,
      protocol: protocol || 'http',
      authToken,
      allowSelfSigned: allowSelfSigned || false,
      timeout: 5000,
    });

    res.json(status);
  } catch (error) {
    console.error('[cliproxy-server-routes] Failed to test connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

export default router;
