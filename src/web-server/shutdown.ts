/**
 * Shutdown Handler
 *
 * Handles SIGINT/SIGTERM and releases background-controller ownership before exit.
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer } from 'ws';
import { ok } from '../utils/ui';

/**
 * Setup shutdown handlers for SIGINT and SIGTERM
 */
export function setupGracefulShutdown(
  server: HTTPServer,
  _wss: WebSocketServer,
  cleanup?: () => void | Promise<void>
): void {
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n' + ok('Shutting down...'));

    // Stop accepting requests before awaiting controller mutation/lease cleanup.
    server.close();
    server.closeAllConnections();
    if (cleanup) {
      await cleanup();
    }

    // Close server and exit immediately
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}
