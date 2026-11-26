import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import miscRoutes from '../../../src/web-server/routes/misc-routes';
import profileRoutes from '../../../src/web-server/routes/profile-routes';
import accountRoutes from '../../../src/web-server/routes/account-routes';
import persistRoutes from '../../../src/web-server/routes/persist-routes';
import browserRoutes from '../../../src/web-server/routes/browser-routes';
import websearchRoutes from '../../../src/web-server/routes/websearch-routes';
import ProfileRegistry from '../../../src/auth/profile-registry';
import * as browserUtils from '../../../src/utils/browser';
import * as websearchManager from '../../../src/utils/websearch-manager';
import { flushStructuredLogsSync } from '../../../src/services/logging';

const SECRET_SENTINEL = 'SECRET_INTERNAL_PATH_/etc/shadow_sk-ant-api03-leak';

describe('respondInternalError HTTP 500 sanitization', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/profiles', profileRoutes);
    app.use('/api/accounts', accountRoutes);
    app.use('/api/persist', persistRoutes);
    app.use('/api/browser', browserRoutes);
    app.use('/api/websearch', websearchRoutes);
    app.use('/api', miscRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      server.once('error', reject);
      server.once('listening', () => resolve());
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
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-route-500-sanitize-'));
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    flushStructuredLogsSync();
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('sanitizes 500 error responses in misc-routes without leaking error.message', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const targetFile = path.join(ccsDir, 'sample.json');
    fs.writeFileSync(targetFile, '{"ok":true}', 'utf8');

    const readSpy = spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error(SECRET_SENTINEL);
    });
    try {
      const response = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(targetFile)}`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to read file.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('sanitizes 500 error responses in profile-routes while keeping 4xx validation errors', async () => {
    const badCreate = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad', unknownField: true }),
    });
    expect(badCreate.status).toBe(400);
    expect(((await badCreate.json()) as { error: string }).error).toContain(
      'Unknown profile field(s)'
    );

    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'config.json'), '{not-valid-json', 'utf8');

    const listSpy = spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error(SECRET_SENTINEL);
    });
    try {
      const response = await fetch(`${baseUrl}/api/profiles/orphans`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to discover orphan profiles.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      listSpy.mockRestore();
    }
  });

  it('sanitizes 500 error responses in account-routes', async () => {
    const spy = spyOn(ProfileRegistry.prototype, 'getAllProfiles').mockImplementation(() => {
      throw new Error(SECRET_SENTINEL);
    });
    try {
      const response = await fetch(`${baseUrl}/api/accounts`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to list accounts.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      spy.mockRestore();
    }
  });

  it('sanitizes 500 error responses in persist-routes', async () => {
    const claudeDir = path.join(tempHome, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = claudeDir;

    const readdirSpy = spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error(SECRET_SENTINEL);
    });
    try {
      const response = await fetch(`${baseUrl}/api/persist/backups`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to list backups.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      readdirSpy.mockRestore();
      if (originalClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
      }
    }
  });

  it('sanitizes 500 error responses in browser-routes', async () => {
    const statusSpy = spyOn(browserUtils, 'getBrowserStatus').mockRejectedValue(
      new Error(SECRET_SENTINEL)
    );
    try {
      const response = await fetch(`${baseUrl}/api/browser`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to load browser configuration.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      statusSpy.mockRestore();
    }
  });

  it('sanitizes 500 error responses in websearch-routes', async () => {
    const readinessSpy = spyOn(websearchManager, 'getWebSearchReadiness').mockImplementation(
      () => {
        throw new Error(SECRET_SENTINEL);
      }
    );
    try {
      const response = await fetch(`${baseUrl}/api/websearch/status`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Failed to load WebSearch status.');
      expect(JSON.stringify(body)).not.toContain(SECRET_SENTINEL);
    } finally {
      readinessSpy.mockRestore();
    }
  });
});
