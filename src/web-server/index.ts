/**
 * CCS Config Dashboard - Web Server
 *
 * Express server with WebSocket support for real-time config management.
 * Single HTTP server handles REST API, static files, and WebSocket connections.
 * In dev mode, integrates Vite for HMR.
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './websocket';
import {
  authMiddleware,
  createSessionMiddleware,
  getDashboardWebSocketRejectionStatus,
  isDashboardWebSocketUpgradeAllowed,
} from './middleware/auth-middleware';
import { requestLoggingMiddleware } from './middleware/request-logging-middleware';
import { ensureManagedModelPrefixes } from '../cliproxy/ai-providers/managed-model-prefixes';
import { getProxyTarget } from '../cliproxy/proxy/proxy-target-resolver';
import { startAutoSyncWatcher, stopAutoSyncWatcher } from '../cliproxy/sync';
import { shutdownUsageAggregator } from './usage/aggregator';
import { createLogger } from '../services/logging';

export interface ServerOptions {
  port: number;
  host?: string;
  staticDir?: string;
  dev?: boolean;
}

export interface ServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  cleanup: () => void;
}

const logger = createLogger('web-server');

/**
 * Start Express server with WebSocket support
 */
export async function startServer(options: ServerOptions): Promise<ServerInstance> {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024, // 1MB hard limit to prevent DoS
    perMessageDeflate: false, // Prevent zip bomb attacks
  });

  // JSON body parsing with error handler for malformed JSON
  app.use(express.json());
  app.use(
    (
      err: Error & { status?: number; body?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON in request body' });
        return;
      }
      next(err);
    }
  );
  app.use(requestLoggingMiddleware);

  // Session middleware (for dashboard auth)
  const sessionMiddleware = createSessionMiddleware();
  app.use(sessionMiddleware);

  // Auth middleware (protects API routes when enabled)
  app.use(authMiddleware);

  // CLIProxy local reverse proxy (avoids cross-origin issues in Docker)
  const cliproxyLocalProxy = (await import('./routes/cliproxy-local-proxy')).default;
  app.use('/api/cliproxy-local', cliproxyLocalProxy);

  // REST API routes (modularized)
  const { apiRoutes } = await import('./routes/index');
  app.use('/api', apiRoutes);

  // Shared data routes (Phase 07)
  const { sharedRoutes } = await import('./shared-routes');
  app.use('/api/shared', sharedRoutes);

  // Overview routes (Phase 07)
  const { overviewRoutes } = await import('./overview-routes');
  app.use('/api/overview', overviewRoutes);

  // Usage analytics routes
  const { usageRoutes } = await import('./usage-routes');
  app.use('/api/usage', usageRoutes);

  // Dev mode: use Vite middleware for HMR
  if (options.dev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: path.join(__dirname, '../../ui'),
      server: {
        middlewareMode: true,
        // Reuse the dashboard HTTP server for HMR in middleware mode.
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve static files from dist/ui/
    const staticDir = options.staticDir || path.join(__dirname, '../ui');
    app.use(express.static(staticDir));

    // SPA fallback - return index.html for all non-API routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  server.on('upgrade', (request, socket, head) => {
    const pathname = getUpgradePathname(request.url);
    if (!pathname) {
      rejectWebSocketUpgrade(socket, 400, 'Invalid WebSocket upgrade request');
      return;
    }

    if (pathname !== '/ws') {
      if (!options.dev) {
        rejectWebSocketUpgrade(socket, 404, 'WebSocket endpoint not found');
      }
      return;
    }

    const response = new http.ServerResponse(request);
    sessionMiddleware(
      request as express.Request,
      response as express.Response,
      (error?: unknown) => {
        if (error) {
          rejectWebSocketUpgrade(socket, 500, 'WebSocket session validation failed');
          return;
        }

        if (!isDashboardWebSocketUpgradeAllowed(request)) {
          rejectWebSocketUpgrade(
            socket,
            getDashboardWebSocketRejectionStatus(request),
            'WebSocket access denied'
          );
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    );
  });

  // WebSocket connection handler + file watcher
  const { cleanup: wsCleanup } = setupWebSocket(wss);

  // Start auto-sync watcher (if enabled in config)
  startAutoSyncWatcher();

  if (!getProxyTarget().isRemote) {
    void ensureManagedModelPrefixes().catch((error) => {
      logger.warn('cliproxy.prefix_sync_failed', 'Managed model prefix repair failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // Combined cleanup function
  const cleanup = () => {
    wsCleanup();
    stopAutoSyncWatcher().catch(() => {});
    shutdownUsageAggregator();
  };

  // Start listening
  return new Promise<ServerInstance>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      logger.error('server.listen_failed', 'Dashboard server failed to start', {
        code: error.code || 'unknown',
        message: error.message,
        host: options.host || null,
        port: options.port,
      });
      cleanup();
      reject(new Error(formatListenError(error, options)));
    };

    server.once('error', onError);

    const onListening = () => {
      server.off('error', onError);
      logger.info('server.listening', 'Dashboard server listening', {
        host: options.host || '0.0.0.0',
        port: options.port,
        dev: Boolean(options.dev),
      });
      // Usage cache loads on-demand when Analytics page is visited
      // This keeps server startup instant for users who don't need analytics
      resolve({ server, wss, cleanup });
    };

    try {
      if (options.host) {
        server.listen(options.port, options.host, onListening);
        return;
      }

      server.listen(options.port, onListening);
    } catch (error) {
      server.off('error', onError);
      cleanup();
      reject(new Error(formatListenError(error as NodeJS.ErrnoException, options)));
    }
  });
}

function getUpgradePathname(requestUrl: string | undefined): string | null {
  try {
    return new URL(requestUrl ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function rejectWebSocketUpgrade(
  socket: NodeJS.WritableStream & { destroy: () => void },
  statusCode: 400 | 401 | 403 | 404 | 500,
  message: string
): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message
  );
  socket.destroy();
}

function formatListenError(error: NodeJS.ErrnoException, options: ServerOptions): string {
  if (error.code === 'EADDRINUSE' && options.host) {
    return `Unable to bind ${options.host}:${options.port}; the address may be unavailable or the port may already be in use`;
  }

  if (error.code === 'EADDRINUSE') {
    return `Port ${options.port} is already in use`;
  }

  if (error.code === 'EADDRNOTAVAIL' && options.host) {
    return `Cannot bind to ${options.host}:${options.port} on this machine`;
  }

  if (error.code === 'EACCES') {
    return `Permission denied while binding to port ${options.port}`;
  }

  if (options.host) {
    return `Cannot bind to ${options.host}:${options.port}: ${error.message}`;
  }

  return error.message;
}
