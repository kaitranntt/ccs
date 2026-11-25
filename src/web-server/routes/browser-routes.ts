import { Router, type Request, type Response } from 'express';

import type { BrowserConfig, BrowserEvalMode } from '../../config/unified-config-types';
import { getBrowserStatus } from '../../utils/browser';
import { getUserFacingBrowserConfig } from '../../utils/browser/browser-status';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { mutateConfig } from '../../config/config-loader-facade';
import { createRouteErrorHelpers } from './route-helpers';

const router = Router();
const { respondInternalError } = createRouteErrorHelpers('browser-routes');
const BROWSER_LOCAL_ACCESS_ERROR =
  'Browser endpoints require localhost access when dashboard auth is disabled.';

interface BrowserRouteBody {
  claude?: {
    enabled?: boolean;
    policy?: 'auto' | 'manual';
    userDataDir?: string;
    devtoolsPort?: number;
    evalMode?: BrowserEvalMode;
  };
  codex?: {
    enabled?: boolean;
    policy?: 'auto' | 'manual';
    evalMode?: BrowserEvalMode;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBrowserPolicy(value: string): value is 'auto' | 'manual' {
  return value === 'auto' || value === 'manual';
}

function isValidBrowserEvalMode(value: string): value is BrowserEvalMode {
  return value === 'disabled' || value === 'readonly' || value === 'readwrite';
}

function isValidDevtoolsPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

router.use((req: Request, res: Response, next) => {
  if (requireLocalAccessWhenAuthDisabled(req, res, BROWSER_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = getUserFacingBrowserConfig();
    const status = await getBrowserStatus();
    res.json({
      config: toBrowserRouteConfig(config),
      status,
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load browser configuration.');
  }
});

router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getBrowserStatus());
  } catch (error) {
    respondInternalError(res, error, 'Failed to load browser status.');
  }
});

router.put('/', async (req: Request, res: Response): Promise<void> => {
  if (!isPlainObject(req.body)) {
    res.status(400).json({ error: 'Invalid request body. Must be an object.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const rootKeys = Object.keys(body);
  const unknownRootKeys = rootKeys.filter((key) => key !== 'claude' && key !== 'codex');
  if (unknownRootKeys.length > 0) {
    res.status(400).json({
      error: `Unknown browser config field(s): ${unknownRootKeys.join(', ')}.`,
    });
    return;
  }

  const { claude, codex } = body as BrowserRouteBody;
  if (Object.prototype.hasOwnProperty.call(body, 'claude') && !isPlainObject(claude)) {
    res.status(400).json({ error: 'Invalid value for claude. Must be an object.' });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'codex') && !isPlainObject(codex)) {
    res.status(400).json({ error: 'Invalid value for codex. Must be an object.' });
    return;
  }
  const unknownClaudeKeys = Object.keys(claude ?? {}).filter(
    (key) =>
      key !== 'enabled' &&
      key !== 'policy' &&
      key !== 'userDataDir' &&
      key !== 'devtoolsPort' &&
      key !== 'evalMode'
  );
  if (unknownClaudeKeys.length > 0) {
    res.status(400).json({
      error: `Unknown claude browser field(s): ${unknownClaudeKeys.join(', ')}.`,
    });
    return;
  }
  const unknownCodexKeys = Object.keys(codex ?? {}).filter(
    (key) => key !== 'enabled' && key !== 'policy' && key !== 'evalMode'
  );
  if (unknownCodexKeys.length > 0) {
    res.status(400).json({
      error: `Unknown codex browser field(s): ${unknownCodexKeys.join(', ')}.`,
    });
    return;
  }
  if (claude?.enabled !== undefined && typeof claude.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for claude.enabled. Must be a boolean.' });
    return;
  }
  if (
    claude?.policy !== undefined &&
    (typeof claude.policy !== 'string' || !isValidBrowserPolicy(claude.policy))
  ) {
    res.status(400).json({ error: 'Invalid value for claude.policy. Must be auto or manual.' });
    return;
  }
  if (claude?.userDataDir !== undefined && typeof claude.userDataDir !== 'string') {
    res.status(400).json({ error: 'Invalid value for claude.userDataDir. Must be a string.' });
    return;
  }
  if (
    claude?.devtoolsPort !== undefined &&
    (typeof claude.devtoolsPort !== 'number' || !isValidDevtoolsPort(claude.devtoolsPort))
  ) {
    res.status(400).json({
      error: 'Invalid value for claude.devtoolsPort. Must be an integer between 1 and 65535.',
    });
    return;
  }
  if (
    claude?.evalMode !== undefined &&
    (typeof claude.evalMode !== 'string' || !isValidBrowserEvalMode(claude.evalMode))
  ) {
    res.status(400).json({
      error: 'Invalid value for claude.evalMode. Must be one of: disabled, readonly, readwrite.',
    });
    return;
  }
  if (codex?.enabled !== undefined && typeof codex.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for codex.enabled. Must be a boolean.' });
    return;
  }
  if (
    codex?.policy !== undefined &&
    (typeof codex.policy !== 'string' || !isValidBrowserPolicy(codex.policy))
  ) {
    res.status(400).json({ error: 'Invalid value for codex.policy. Must be auto or manual.' });
    return;
  }
  if (
    codex?.evalMode !== undefined &&
    (typeof codex.evalMode !== 'string' || !isValidBrowserEvalMode(codex.evalMode))
  ) {
    res.status(400).json({
      error: 'Invalid value for codex.evalMode. Must be one of: disabled, readonly, readwrite.',
    });
    return;
  }

  try {
    const current = getUserFacingBrowserConfig();
    const nextClaudeUserDataDir =
      claude?.userDataDir === undefined ? current.claude.user_data_dir : claude.userDataDir.trim();
    mutateConfig((config) => {
      config.browser = {
        claude: {
          enabled: claude?.enabled ?? current.claude.enabled,
          policy: claude?.policy ?? current.claude.policy,
          user_data_dir: nextClaudeUserDataDir,
          devtools_port: claude?.devtoolsPort ?? current.claude.devtools_port,
          eval_mode: claude?.evalMode ?? current.claude.eval_mode,
        },
        codex: {
          enabled: codex?.enabled ?? current.codex.enabled,
          policy: codex?.policy ?? current.codex.policy,
          eval_mode: codex?.evalMode ?? current.codex.eval_mode,
        },
      };
    });

    const config = getUserFacingBrowserConfig();
    const status = await getBrowserStatus();
    res.json({
      success: true,
      browser: {
        config: toBrowserRouteConfig(config),
        status,
      },
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to update browser configuration.');
  }
});

function toBrowserRouteConfig(config: BrowserConfig) {
  return {
    claude: {
      enabled: config.claude.enabled,
      policy: config.claude.policy,
      userDataDir: config.claude.user_data_dir,
      devtoolsPort: config.claude.devtools_port,
      evalMode: config.claude.eval_mode ?? 'readonly',
    },
    codex: {
      enabled: config.codex.enabled,
      policy: config.codex.policy,
      evalMode: config.codex.eval_mode ?? 'readonly',
    },
  };
}

export default router;
