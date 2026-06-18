/**
 * CLIProxy error-log routes.
 *
 * - GET /error-logs (list + metadata extraction)
 * - GET /error-logs/:name (single log content; path-traversal validated)
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  isCliproxyRunning,
  fetchCliproxyErrorLogs,
  fetchCliproxyErrorLogContent,
} from '../../../cliproxy/services/stats-fetcher';
import { getCliproxyWritablePath } from '../../../cliproxy/config/config-generator';
import { logger } from './shared';

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

    const startBuffer = Buffer.alloc(Math.min(4096, fileSize));
    await fh.read(startBuffer, 0, startBuffer.length, 0);
    const startContent = startBuffer.toString('utf-8');

    const modelMatch = startContent.match(/"model"\s*:\s*"([^"]+)"/);
    const model = modelMatch ? modelMatch[1] : undefined;

    let statusCode: number | undefined;
    if (fileSize > 2048) {
      const endBuffer = Buffer.alloc(2048);
      await fh.read(endBuffer, 0, 2048, fileSize - 2048);
      const endContent = endBuffer.toString('utf-8');
      const statusMatch = endContent.match(/Status:\s*(\d{3})/);
      statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    } else {
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
 * Registers error-log routes on the given router.
 */
export function registerErrorLogRoutes(router: Router): void {
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

  router.get('/error-logs/:name', async (req: Request, res: Response): Promise<void> => {
    const { name } = req.params;

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
}
