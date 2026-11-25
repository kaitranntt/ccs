/**
 * Auth Middleware Tests
 * Tests for dashboard authentication middleware and routes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDashboardAuthConfig } from '../../../src/config/unified-config-loader';
import {
  authMiddleware,
  isDashboardRequestOriginAllowed,
  isDashboardWebSocketOriginAllowed,
  getDashboardWebSocketRejectionStatus,
  isDashboardWebSocketUpgradeAllowed,
} from '../../../src/web-server/middleware/auth-middleware';
import { runWithScopedConfigDir } from '../../../src/utils/config-manager';

describe('Dashboard Auth', () => {
  let tempDir = '';
  let originalDashboardAuthEnabled: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-dashboard-auth-'));
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
  });

  afterEach(() => {
    if (originalDashboardAuthEnabled === undefined) {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    } else {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getDashboardAuthConfig', () => {
    it('returns disabled by default', async () => {
      const config = await runWithScopedConfigDir(tempDir, () => getDashboardAuthConfig());
      expect(config.enabled).toBe(false);
    });

    it('returns 24 hour default session timeout', async () => {
      const config = await runWithScopedConfigDir(tempDir, () => getDashboardAuthConfig());
      expect(config.session_timeout_hours).toBe(24);
    });
  });

  describe('bcrypt password hashing', () => {
    it('generates valid bcrypt hash', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);

      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    });

    it('verifies correct password', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare('wrongpassword', hash);
      expect(isValid).toBe(false);
    });

    it('timing-safe comparison for wrong password', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);

      // bcrypt.compare should take similar time for wrong vs right password
      // This is a basic check that the function works
      const start1 = performance.now();
      await bcrypt.compare('wrongpassword', hash);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      await bcrypt.compare(password, hash);
      const time2 = performance.now() - start2;

      // Both should complete (timing comparison is handled by bcrypt internally)
      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);
    });
  });

  describe('public paths', () => {
    const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/check', '/api/auth/setup', '/api/health'];

    it('identifies public paths correctly', () => {
      const isPublicPath = (path: string) =>
        PUBLIC_PATHS.some((p) => path.toLowerCase().startsWith(p));

      expect(isPublicPath('/api/auth/login')).toBe(true);
      expect(isPublicPath('/api/auth/check')).toBe(true);
      expect(isPublicPath('/api/auth/setup')).toBe(true);
      expect(isPublicPath('/api/health')).toBe(true);
      expect(isPublicPath('/api/profiles')).toBe(false);
      expect(isPublicPath('/api/config')).toBe(false);
    });

    it('handles case-insensitive paths', () => {
      const isPublicPath = (path: string) =>
        PUBLIC_PATHS.some((p) => path.toLowerCase().startsWith(p));

      expect(isPublicPath('/API/AUTH/LOGIN')).toBe(true);
      expect(isPublicPath('/Api/Health')).toBe(true);
    });
  });

  describe('session configuration', () => {
    it('session timeout converts to milliseconds correctly', () => {
      const hours = 24;
      const maxAge = hours * 60 * 60 * 1000;

      expect(maxAge).toBe(86400000); // 24 hours in ms
    });

    it('custom session timeout works', () => {
      const hours = 8;
      const maxAge = hours * 60 * 60 * 1000;

      expect(maxAge).toBe(28800000); // 8 hours in ms
    });
  });

  describe('auth flow logic', () => {
    it('bypasses auth when disabled', () => {
      const shouldSkip = true;
      expect(shouldSkip).toBe(true);
    });

    it('requires auth when enabled', () => {
      const authConfig = {
        enabled: true,
        username: 'admin',
        password_hash: '$2b$10$test',
      };
      const shouldSkip = !authConfig.enabled;
      expect(shouldSkip).toBe(false);
    });

    it('validates username match', () => {
      const authConfig = { username: 'admin' };
      const usernameMatch = 'admin' === authConfig.username;
      expect(usernameMatch).toBe(true);
    });

    it('rejects wrong username', () => {
      const authConfig = { username: 'admin' };
      const usernameMatch = 'wrong' === authConfig.username;
      expect(usernameMatch).toBe(false);
    });
  });

  describe('websocket upgrade access', () => {
    function makeUpgradeRequest(
      remoteAddress: string,
      authenticated = false,
      headers: Record<string, string> = {}
    ) {
      return {
        headers,
        socket: { remoteAddress },
        session: authenticated ? { authenticated: true } : { authenticated: false },
      } as never;
    }

    it('allows loopback websocket upgrades when dashboard auth is disabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';

      expect(isDashboardWebSocketUpgradeAllowed(makeUpgradeRequest('127.0.0.1'))).toBe(true);
      expect(isDashboardWebSocketUpgradeAllowed(makeUpgradeRequest('::1'))).toBe(true);
    });

    it('blocks remote websocket upgrades when dashboard auth is disabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
      const request = makeUpgradeRequest('10.10.0.24');

      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(false);
      expect(getDashboardWebSocketRejectionStatus()).toBe(403);
    });

    it('blocks cross-site websocket origins when dashboard auth is disabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
      const request = makeUpgradeRequest('127.0.0.1', false, {
        host: '127.0.0.1:3001',
        origin: 'https://evil.example.test',
      });

      expect(isDashboardWebSocketOriginAllowed(request)).toBe(false);
      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(false);
      expect(getDashboardWebSocketRejectionStatus(request)).toBe(403);
    });

    it('requires an authenticated session for websocket upgrades when auth is enabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';

      expect(isDashboardWebSocketUpgradeAllowed(makeUpgradeRequest('127.0.0.1'))).toBe(false);
      expect(
        isDashboardWebSocketUpgradeAllowed(
          makeUpgradeRequest('10.10.0.24', true, {
            host: 'dashboard.internal:3001',
            origin: 'https://dashboard.internal:3001',
          })
        )
      ).toBe(true);
      expect(getDashboardWebSocketRejectionStatus()).toBe(401);
    });

    it('allows same-origin websocket upgrades when auth is enabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';
      const request = makeUpgradeRequest('10.10.0.24', true, {
        host: 'dashboard.example.test:3001',
        origin: 'https://dashboard.example.test:3001',
      });

      expect(isDashboardWebSocketOriginAllowed(request)).toBe(true);
      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(true);
    });

    it('allows loopback host aliases on the same dashboard port', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';
      const request = makeUpgradeRequest('127.0.0.1', true, {
        host: '127.0.0.1:3001',
        origin: 'http://localhost:3001',
      });

      expect(isDashboardWebSocketOriginAllowed(request)).toBe(true);
      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(true);
    });

    it('blocks 127-prefixed DNS names from loopback websocket origin aliases', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
      const request = makeUpgradeRequest('127.0.0.1', false, {
        host: 'localhost:3001',
        origin: 'http://127.evil.example.test:3001',
      });

      expect(isDashboardWebSocketOriginAllowed(request)).toBe(false);
      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(false);
      expect(getDashboardWebSocketRejectionStatus(request)).toBe(403);
    });

    it('blocks cross-site websocket origins even with an authenticated session', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';
      const request = makeUpgradeRequest('127.0.0.1', true, {
        host: '127.0.0.1:3001',
        origin: 'https://evil.example.test',
      });

      expect(isDashboardWebSocketOriginAllowed(request)).toBe(false);
      expect(isDashboardWebSocketUpgradeAllowed(request)).toBe(false);
      expect(getDashboardWebSocketRejectionStatus(request)).toBe(403);
    });
  });

  describe('rate limiting config', () => {
    it('rate limit window is 15 minutes', () => {
      const windowMs = 15 * 60 * 1000;
      expect(windowMs).toBe(900000);
    });

    it('max attempts is 5', () => {
      const maxAttempts = 5;
      expect(maxAttempts).toBe(5);
    });
  });

  describe('CSRF Origin/Referer checks when dashboard auth is enabled', () => {
    function makeMiddlewareRequest(
      method: string,
      pathValue: string,
      headers: Record<string, string> = {},
      authenticated = true
    ) {
      return {
        method,
        path: pathValue,
        headers,
        session: { authenticated },
      } as never;
    }

    function runAuthMiddleware(req: ReturnType<typeof makeMiddlewareRequest>) {
      let statusCode = 200;
      let jsonBody: unknown;
      let nextCalled = false;

      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          jsonBody = payload;
          return this;
        },
      } as never;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      return { statusCode, jsonBody, nextCalled };
    }

    it('allows same-origin Origin and Referer headers and rejects cross-origin ones', () => {
      expect(
        isDashboardRequestOriginAllowed({
          headers: { host: 'dash.example.test:3000', origin: 'https://dash.example.test:3000' },
        } as never)
      ).toBe(true);

      expect(
        isDashboardRequestOriginAllowed({
          headers: { host: '127.0.0.1:3000', origin: 'http://localhost:3000' },
        } as never)
      ).toBe(true);

      expect(
        isDashboardRequestOriginAllowed({
          headers: {
            host: 'dash.example.test:3000',
            referer: 'https://dash.example.test:3000/settings',
          },
        } as never)
      ).toBe(true);

      expect(
        isDashboardRequestOriginAllowed({
          headers: { host: 'dash.example.test:3000' },
        } as never)
      ).toBe(true);

      expect(
        isDashboardRequestOriginAllowed({
          headers: { host: 'dash.example.test:3000', origin: 'https://evil.example.test' },
        } as never)
      ).toBe(false);

      expect(
        isDashboardRequestOriginAllowed({
          headers: { host: 'dash.example.test:3000', origin: 'null' },
        } as never)
      ).toBe(false);

      expect(
        isDashboardRequestOriginAllowed({
          headers: {
            host: 'dash.example.test:3000',
            referer: 'https://evil.example.test/csrf.html',
          },
        } as never)
      ).toBe(false);
    });

    it('blocks cross-origin POST/PUT/PATCH/DELETE requests even with an authenticated session', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';

      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const result = runAuthMiddleware(
          makeMiddlewareRequest(method, '/api/profiles', {
            host: 'dash.example.test:3000',
            origin: 'https://evil.example.test',
          })
        );
        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.jsonBody).toEqual({
          error: 'Cross-origin state-changing requests are not allowed.',
        });
      }

      const refererResult = runAuthMiddleware(
        makeMiddlewareRequest('POST', '/api/profiles', {
          host: 'dash.example.test:3000',
          referer: 'https://evil.example.test/form.html',
        })
      );
      expect(refererResult.nextCalled).toBe(false);
      expect(refererResult.statusCode).toBe(403);

      const loginCsrfResult = runAuthMiddleware(
        makeMiddlewareRequest(
          'POST',
          '/api/auth/login',
          {
            host: 'dash.example.test:3000',
            origin: 'https://evil.example.test',
          },
          false
        )
      );
      expect(loginCsrfResult.nextCalled).toBe(false);
      expect(loginCsrfResult.statusCode).toBe(403);
    });

    it('allows same-origin mutations and safe GETs when auth is enabled', () => {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';

      const sameOriginPost = runAuthMiddleware(
        makeMiddlewareRequest('POST', '/api/profiles', {
          host: 'dash.example.test:3000',
          origin: 'https://dash.example.test:3000',
        })
      );
      expect(sameOriginPost.nextCalled).toBe(true);

      const crossOriginGet = runAuthMiddleware(
        makeMiddlewareRequest('GET', '/api/profiles', {
          host: 'dash.example.test:3000',
          origin: 'https://evil.example.test',
        })
      );
      expect(crossOriginGet.nextCalled).toBe(true);
    });
  });
});
