import { Router, Request, Response } from 'express';
import {
  applyCliproxyRoutingStrategy,
  applyCliproxySessionAffinitySettings,
  normalizeCliproxyRoutingStrategy,
  normalizeCliproxySessionAffinityEnabled,
  normalizeCliproxySessionAffinityTtl,
  readCliproxyRoutingState,
  readCliproxySessionAffinityState,
} from '../../cliproxy/routing/routing-strategy';
import {
  applyCliproxyRetrySettings,
  normalizeCliproxyRetryValue,
  readCliproxyRetryState,
} from '../../cliproxy/routing/retry-settings';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy routing endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

router.get('/routing/strategy', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await readCliproxyRoutingState());
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.put('/routing/strategy', async (req: Request, res: Response): Promise<void> => {
  const strategy = normalizeCliproxyRoutingStrategy(req.body?.value ?? req.body?.strategy);
  if (!strategy) {
    res.status(400).json({ error: 'Invalid strategy. Use: round-robin or fill-first' });
    return;
  }

  try {
    res.json(await applyCliproxyRoutingStrategy(strategy));
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.get('/routing/session-affinity', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await readCliproxySessionAffinityState());
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.put('/routing/session-affinity', async (req: Request, res: Response): Promise<void> => {
  const enabled = normalizeCliproxySessionAffinityEnabled(req.body?.enabled ?? req.body?.value);
  const ttl = req.body?.ttl;
  const normalizedTtl: string | undefined =
    ttl === undefined ? undefined : (normalizeCliproxySessionAffinityTtl(ttl) ?? undefined);

  if (enabled === null || (ttl !== undefined && !normalizedTtl)) {
    res.status(400).json({
      error: 'Invalid session affinity payload. Use enabled=true|false and ttl like 30m or 1h.',
    });
    return;
  }

  try {
    const result = await applyCliproxySessionAffinitySettings({
      enabled,
      ttl: normalizedTtl,
    });
    if (!result.manageable || result.applied === 'unsupported') {
      res.status(400).json({
        error: result.message || 'Session affinity is not supported for this target.',
      });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.get('/retry', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await readCliproxyRetryState());
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.put('/retry', async (req: Request, res: Response): Promise<void> => {
  const requestRetry = normalizeCliproxyRetryValue(req.body?.request_retry);
  const maxRetryInterval = normalizeCliproxyRetryValue(req.body?.max_retry_interval);
  if (requestRetry === null || maxRetryInterval === null) {
    res.status(400).json({
      error: 'Invalid retry payload. Use non-negative safe integers for both retry fields.',
    });
    return;
  }

  try {
    res.json(
      await applyCliproxyRetrySettings({
        request_retry: requestRetry,
        max_retry_interval: maxRetryInterval,
      })
    );
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

export default router;
