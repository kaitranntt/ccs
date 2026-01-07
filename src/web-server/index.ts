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

export interface ServerOptions {
  port: number;
  staticDir?: string;
  dev?: boolean;
}

export interface ServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  cleanup: () => void;
}

/**
 * Start Express server with WebSocket support
 */
export async function startServer(options: ServerOptions): Promise<ServerInstance> {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

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
      server: { middlewareMode: true },
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

  // WebSocket connection handler + file watcher
  const { cleanup } = setupWebSocket(wss);

  // Start listening
  return new Promise<ServerInstance>((resolve) => {
    server.listen(options.port, () => {
      // Usage cache loads on-demand when Analytics page is visited
      // This keeps server startup instant for users who don't need analytics
      resolve({ server, wss, cleanup });
    });
  });
}
