import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import miscRoutes from '../../../src/web-server/routes/misc-routes';
import {
  clearDiskCache,
  readDiskCache,
  writeDiskCache,
} from '../../../src/web-server/usage/disk-cache';

describe('misc-routes PUT /api/file & disk-cache locking', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', miscRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);
      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-misc-lock-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('writes config.yaml via withConfigWriteLock and detects mtime conflicts', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const configYamlPath = path.join(ccsDir, 'config.yaml');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(configYamlPath, 'version: 1\n');

    const firstRes = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(configYamlPath)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'version: 2\n' }),
      }
    );
    expect(firstRes.status).toBe(200);
    expect(fs.readFileSync(configYamlPath, 'utf8')).toBe('version: 2\n');
    expect(fs.existsSync(path.join(ccsDir, 'config.yaml.lock'))).toBe(false);

    const staleRes = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(configYamlPath)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'version: 3\n', expectedMtime: 1 }),
      }
    );
    expect(staleRes.status).toBe(409);
    expect(fs.readFileSync(configYamlPath, 'utf8')).not.toContain('version: 3');
  });

  it('serializes concurrent PUT /api/file writes without temp file collisions', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const targetPath = path.join(ccsDir, 'notes.json');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(targetPath, '{"n":0}\n');

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, idx) =>
        fetch(`${baseUrl}/api/file?path=${encodeURIComponent(targetPath)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify({ n: idx + 1 }) + '\n' }),
        })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as { n: number };
    expect(parsed.n).toBeGreaterThanOrEqual(1);
    expect(fs.readdirSync(ccsDir).filter((name) => name.includes('.tmp.'))).toEqual([]);
  });

  it('writes and clears disk cache atomically under lock', () => {
    writeDiskCache([], [], [], []);
    writeDiskCache([], [], [], []);

    const cache = readDiskCache();
    expect(cache).not.toBeNull();
    expect(cache?.version).toBe(4);

    const cacheDir = path.join(tempHome, '.ccs', 'cache');
    expect(fs.readdirSync(cacheDir).filter((name) => name.includes('.tmp.'))).toEqual([]);

    clearDiskCache();
    expect(readDiskCache()).toBeNull();
  });
});
