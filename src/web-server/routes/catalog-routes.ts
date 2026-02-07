import { Router, Request, Response } from 'express';
import { getAllResolvedCatalogs, getCacheAge } from '../../cliproxy/catalog-cache';

const router = Router();

/**
 * GET /api/cliproxy/catalog - Get merged model catalogs
 * Returns resolved catalogs (cached + static merged)
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    const catalogs = getAllResolvedCatalogs();
    const cacheAge = getCacheAge();
    res.json({
      catalogs,
      cache: {
        synced: cacheAge !== null,
        age: cacheAge,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
