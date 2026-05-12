/**
 * Dashboard Authentication Middleware
 * Session-based auth with httpOnly cookies for CCS dashboard.
 */

import type { IncomingMessage } from 'http';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getCcsDir,
  getDashboardAuthConfig,
  isDashboardAuthEnabled,
} from '../../config/config-loader-facade';

// Extend Express Request with session
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
    username: string;
  }
}

/** Public paths that bypass auth (lowercase for case-insensitive matching) */
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/check', '/api/auth/setup', '/api/health'];

/** Path to persistent session secret file */
function getSessionSecretPath() {
  return path.join(getCcsDir(), '.session-secret');
}

/**
 * Generate or retrieve persistent session secret.
 * Priority: ENV var > persisted file > generate new
 */
function getSessionSecret(): string {
  // 1. Check ENV var first
  if (process.env.CCS_SESSION_SECRET) {
    return process.env.CCS_SESSION_SECRET;
  }

  const secretPath = getSessionSecretPath();

  // 2. Try to read persisted secret
  try {
    if (fs.existsSync(secretPath)) {
      const secret = fs.readFileSync(secretPath, 'utf-8').trim();
      if (secret.length >= 32) {
        return secret;
      }
    }
  } catch {
    // Ignore read errors, generate new secret
  }

  // 3. Generate and persist new random secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
  } catch (err) {
    // Log warning - sessions won't persist across restarts
    console.warn('[!] Failed to persist session secret:', (err as Error).message);
  }

  return newSecret;
}

/**
 * Rate limiter for login attempts.
 * 5 attempts per 15 minutes per IP.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isDashboardAuthEnabled(),
});

/**
 * Create session middleware configured for CCS dashboard.
 */
export function createSessionMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  const authConfig = getDashboardAuthConfig();
  const maxAge = (authConfig.session_timeout_hours ?? 24) * 60 * 60 * 1000;

  return session({
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Local CLI uses HTTP
      httpOnly: true,
      maxAge,
      sameSite: 'strict',
    },
  });
}

/**
 * Auth middleware that protects all routes except public paths.
 * Only active when dashboard_auth.enabled = true.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if disabled
  if (!isDashboardAuthEnabled()) {
    return next();
  }

  // Allow public paths (case-insensitive)
  const pathLower = req.path.toLowerCase();
  if (PUBLIC_PATHS.some((p) => pathLower.startsWith(p))) {
    return next();
  }

  // Allow static assets and SPA routes (non-API)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  // Check session
  if (req.session?.authenticated) {
    return next();
  }

  // Unauthorized
  res.status(401).json({ error: 'Authentication required' });
}

export function isLoopbackRemoteAddress(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/^\[|\]$/g, '');
  return (
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.') ||
    normalized === '::ffff:127.0.0.1' ||
    normalized.startsWith('::ffff:127.')
  );
}

function isLoopbackHostname(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    isLoopbackRemoteAddress(normalized)
  );
}

function getSingleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseHostHeader(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    return new URL(`http://${value}`);
  } catch {
    return null;
  }
}

function isHttpOrigin(origin: URL): boolean {
  return origin.protocol === 'http:' || origin.protocol === 'https:';
}

export function isDashboardWebSocketOriginAllowed(req: IncomingMessage): boolean {
  const originHeader = getSingleHeader(req.headers.origin);
  if (!originHeader) return true;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (!isHttpOrigin(origin)) {
    return false;
  }

  const host = parseHostHeader(getSingleHeader(req.headers.host));
  if (!host) {
    return false;
  }

  if (origin.host.toLowerCase() === host.host.toLowerCase()) {
    return true;
  }

  return (
    isLoopbackHostname(origin.hostname) &&
    isLoopbackHostname(host.hostname) &&
    origin.port === host.port
  );
}

export function isDashboardWebSocketUpgradeAllowed(req: IncomingMessage): boolean {
  if (!isDashboardWebSocketOriginAllowed(req)) {
    return false;
  }

  if (!isDashboardAuthEnabled()) {
    return isLoopbackRemoteAddress(req.socket.remoteAddress);
  }

  return Boolean((req as Request).session?.authenticated);
}

export function getDashboardWebSocketRejectionStatus(req?: IncomingMessage): 401 | 403 {
  if (req && !isDashboardWebSocketOriginAllowed(req)) {
    return 403;
  }

  if (!isDashboardAuthEnabled()) return 403;

  return 401;
}

export function requireLocalAccessWhenAuthDisabled(
  req: Request,
  res: Response,
  error = 'This endpoint requires localhost access when dashboard auth is disabled.'
): boolean {
  if (isDashboardAuthEnabled()) {
    return true;
  }

  if (isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    return true;
  }

  res.status(403).json({ error });
  return false;
}
