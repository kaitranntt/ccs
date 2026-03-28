import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  CodexRawConfigConflictError,
  CodexRawConfigValidationError,
  getCodexDashboardDiagnostics,
  getCodexRawConfig,
  saveCodexRawConfig,
} from '../services/codex-dashboard-service';

const router = Router();

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

export default router;
