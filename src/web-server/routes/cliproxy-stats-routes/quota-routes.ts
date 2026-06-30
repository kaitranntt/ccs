/**
 * CLIProxy account-quota routes: codex, claude, gemini, ghcp, and the generic
 * `/:provider/:accountId` fallback.
 *
 * Specific routes MUST be registered before the generic one for Express
 * routing to match correctly.
 */

import { Router, Request, Response } from 'express';
import { fetchAccountQuota } from '../../../cliproxy/quota/quota-fetcher';
import { fetchCodexQuota } from '../../../cliproxy/quota/quota-fetcher-codex';
import { fetchClaudeQuota } from '../../../cliproxy/quota/quota-fetcher-claude';
import { fetchGeminiCliQuota } from '../../../cliproxy/quota/quota-fetcher-gemini-cli';
import { fetchGhcpQuota } from '../../../cliproxy/quota/quota-fetcher-ghcp';
import { getCachedQuota, setCachedQuota } from '../../../cliproxy/quota/quota-response-cache';
import type {
  CodexQuotaResult,
  ClaudeQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from '../../../cliproxy/quota/quota-types';
import type { QuotaResult } from '../../../cliproxy/quota/quota-fetcher';
import type { CLIProxyProvider } from '../../../cliproxy/types';
import { CLIPROXY_PROFILES } from '../../../auth/profile-detector';
import { logger, isQuotaRouteRateLimited } from './shared';
import { shouldCacheQuotaResult } from './quota-helpers';

function replyRateLimited(res: Response): void {
  res.status(429).json({ error: 'Too many quota requests', message: 'Retry after a short delay' });
}

function isInvalidAccountId(accountId: string | undefined): boolean {
  return (
    !accountId || accountId.includes('..') || accountId.includes('/') || accountId.includes('\\')
  );
}

/**
 * Registers all `/quota/*` routes on the given router.
 */
export function registerQuotaRoutes(router: Router): void {
  router.get('/quota/codex/:accountId', async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.params;
    if (isQuotaRouteRateLimited(req, 'codex')) {
      replyRateLimited(res);
      return;
    }
    if (isInvalidAccountId(accountId)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    try {
      const cached = getCachedQuota<CodexQuotaResult>('codex', accountId);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const result = await fetchCodexQuota(accountId);

      if (shouldCacheQuotaResult(result)) {
        setCachedQuota('codex', accountId, result);
      }

      res.json(result);
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

  router.get('/quota/claude/:accountId', async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.params;
    if (isQuotaRouteRateLimited(req, 'claude')) {
      replyRateLimited(res);
      return;
    }
    if (isInvalidAccountId(accountId)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    try {
      const cached = getCachedQuota<ClaudeQuotaResult>('claude', accountId);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const result = await fetchClaudeQuota(accountId);

      if (shouldCacheQuotaResult(result)) {
        setCachedQuota('claude', accountId, result);
      }

      res.json(result);
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

  router.get('/quota/gemini/:accountId', async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.params;
    if (isQuotaRouteRateLimited(req, 'gemini')) {
      replyRateLimited(res);
      return;
    }
    if (isInvalidAccountId(accountId)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    try {
      const cached = getCachedQuota<GeminiCliQuotaResult>('gemini', accountId);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const result = await fetchGeminiCliQuota(accountId);

      if (shouldCacheQuotaResult(result)) {
        setCachedQuota('gemini', accountId, result);
      }

      res.json(result);
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

  router.get('/quota/ghcp/:accountId', async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.params;
    if (isQuotaRouteRateLimited(req, 'ghcp')) {
      replyRateLimited(res);
      return;
    }
    if (isInvalidAccountId(accountId)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    try {
      const cached = getCachedQuota<GhcpQuotaResult>('ghcp', accountId);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const result = await fetchGhcpQuota(accountId);

      if (shouldCacheQuotaResult(result)) {
        setCachedQuota('ghcp', accountId, result);
      }

      res.json(result);
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

  router.get('/quota/:provider/:accountId', async (req: Request, res: Response): Promise<void> => {
    const { provider, accountId } = req.params;
    if (isQuotaRouteRateLimited(req, provider)) {
      replyRateLimited(res);
      return;
    }

    const validProviders: CLIProxyProvider[] = [...CLIPROXY_PROFILES];
    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({
        error: 'Invalid provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`,
      });
      return;
    }

    if (isInvalidAccountId(accountId)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    try {
      const cached = getCachedQuota<QuotaResult>(provider, accountId);
      if (cached) {
        res.json({ ...cached, cached: true });
        return;
      }

      const result = await fetchAccountQuota(provider as CLIProxyProvider, accountId);

      if (result.success) {
        setCachedQuota(provider, accountId, result);
      }

      res.json(result);
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
