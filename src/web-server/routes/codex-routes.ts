import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import {
  CodexRawConfigConflictError,
  CodexRawConfigValidationError,
  getCodexDashboardDiagnostics,
  getCodexRawConfig,
  patchCodexConfig,
  saveCodexRawConfig,
} from '../services/codex-dashboard-service';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

const router = Router();
const CODEX_LOCAL_ACCESS_ERROR =
  'Codex dashboard endpoints require localhost access when dashboard auth is disabled.';

router.use((req: Request, res: Response, next: NextFunction): void => {
  if (requireLocalAccessWhenAuthDisabled(req, res, CODEX_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

router.get('/diagnostics', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getCodexDashboardDiagnostics());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/config/raw', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getCodexRawConfig());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/config/raw', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rawText, expectedMtime } = req.body ?? {};

    if (typeof rawText !== 'string') {
      res.status(400).json({ error: 'rawText must be a string.' });
      return;
    }
    if (
      expectedMtime !== undefined &&
      (typeof expectedMtime !== 'number' || !Number.isFinite(expectedMtime))
    ) {
      res.status(400).json({ error: 'expectedMtime must be a finite number when provided.' });
      return;
    }

    res.json(await saveCodexRawConfig({ rawText, expectedMtime }));
  } catch (error) {
    if (error instanceof CodexRawConfigValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof CodexRawConfigConflictError) {
      res.status(409).json({ error: error.message, mtime: error.mtime });
      return;
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/config/patch', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body ?? {};
    if (typeof body.kind !== 'string' || body.kind.trim().length === 0) {
      res.status(400).json({ error: 'kind is required.' });
      return;
    }
    if (
      body.expectedMtime !== undefined &&
      (typeof body.expectedMtime !== 'number' || !Number.isFinite(body.expectedMtime))
    ) {
      res.status(400).json({ error: 'expectedMtime must be a finite number when provided.' });
      return;
    }

    res.json(await patchCodexConfig(body));
  } catch (error) {
    if (error instanceof CodexRawConfigValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof CodexRawConfigConflictError) {
      res.status(409).json({ error: error.message, mtime: error.mtime });
      return;
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
