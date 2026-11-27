/**
 * Shared Data Routes (Phase 07)
 *
 * Thin Express router — delegates all logic to focused sub-modules.
 * API routes for commands, skills, agents, and plugins from ~/.ccs/shared/
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { getCcsDir } from '../config/config-loader-facade';
import { getClaudeConfigDir } from '../utils/claude-config-path';
import { requireLocalAccessWhenAuthDisabled } from './middleware/auth-middleware';
import { isSharedContentType } from './shared-routes-types';
import {
  safeRealPath,
  resolveAllowedRoots,
  resolveSettingsAllowedRoots,
  isPathWithinAny,
} from './shared-routes-path-guards';
import { getSharedItems } from './shared-routes-collections';
import { getSharedItemContent } from './shared-routes-content';
import { checkSymlinkStatus } from './shared-routes-symlink-status';

/** Strips extended fields so the summary endpoint stays wire-compatible. */
function symlinkStatusForSummary(): { valid: boolean; message: string } {
  const { valid, message } = checkSymlinkStatus();
  return { valid, message };
}

export const sharedRoutes = Router();

sharedRoutes.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'Shared-content endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

/**
 * GET /api/shared/commands
 */
sharedRoutes.get('/commands', (_req: Request, res: Response) => {
  const items = getSharedItems('commands');
  res.json({ items });
});

/**
 * GET /api/shared/skills
 */
sharedRoutes.get('/skills', (_req: Request, res: Response) => {
  const items = getSharedItems('skills');
  res.json({ items });
});

/**
 * GET /api/shared/agents
 */
sharedRoutes.get('/agents', (_req: Request, res: Response) => {
  const items = getSharedItems('agents');
  res.json({ items });
});

/**
 * GET /api/shared/plugins
 */
sharedRoutes.get('/plugins', (_req: Request, res: Response) => {
  const items = getSharedItems('plugins');
  res.json({ items });
});

/**
 * GET /api/shared/content?type=commands|skills|agents|plugins|settings&path=<item-path>
 */
sharedRoutes.get('/content', (req: Request, res: Response) => {
  const typeParam = req.query.type;
  const itemPathParam = req.query.path;

  if (!isSharedContentType(typeParam)) {
    res.status(400).json({ error: 'Invalid or missing type parameter' });
    return;
  }
  if (typeof itemPathParam !== 'string' || itemPathParam.trim().length === 0) {
    res.status(400).json({ error: 'Invalid or missing path parameter' });
    return;
  }

  const ccsDir = getCcsDir();
  const sharedDir =
    typeParam === 'settings' ? path.join(ccsDir, 'shared') : path.join(ccsDir, 'shared', typeParam);

  const hasSharedDir = fs.existsSync(sharedDir);
  const hasClaudeSkillsDir =
    typeParam === 'skills' && fs.existsSync(path.join(getClaudeConfigDir(), 'skills'));

  if (typeParam === 'skills' ? !hasSharedDir && !hasClaudeSkillsDir : !hasSharedDir) {
    res.status(404).json({ error: 'Shared directory not found' });
    return;
  }

  const sharedDirRoot = hasSharedDir ? (safeRealPath(sharedDir) ?? path.resolve(sharedDir)) : null;
  const fallbackSharedDirRoot = sharedDirRoot ?? path.resolve(sharedDir);
  const allowedRoots =
    typeParam === 'settings'
      ? resolveSettingsAllowedRoots(ccsDir, fallbackSharedDirRoot)
      : resolveAllowedRoots(typeParam, ccsDir, sharedDirRoot);

  const contentResult = getSharedItemContent(
    typeParam,
    itemPathParam,
    allowedRoots,
    fallbackSharedDirRoot
  );

  if (!contentResult) {
    res.status(404).json({ error: 'Shared content not found' });
    return;
  }

  res.json(contentResult);
});

/**
 * GET /api/shared/summary
 */
sharedRoutes.get('/summary', (_req: Request, res: Response) => {
  const commands = getSharedItems('commands').length;
  const skills = getSharedItems('skills').length;
  const agents = getSharedItems('agents').length;
  const plugins = getSharedItems('plugins').length;

  const ccsDir = getCcsDir();
  const settingsPath = path.join(ccsDir, 'shared', 'settings.json');
  const sharedDirRoot = safeRealPath(path.join(ccsDir, 'shared'));
  const resolvedSettingsPath = safeRealPath(settingsPath);
  const settingsAllowedRoots = sharedDirRoot
    ? resolveSettingsAllowedRoots(ccsDir, sharedDirRoot)
    : new Set<string>();
  const hasSettings =
    Boolean(sharedDirRoot) &&
    Boolean(resolvedSettingsPath) &&
    isPathWithinAny(resolvedSettingsPath as string, settingsAllowedRoots);

  res.json({
    commands,
    skills,
    agents,
    plugins,
    settings: hasSettings,
    total: commands + skills + agents + plugins + (hasSettings ? 1 : 0),
    symlinkStatus: symlinkStatusForSummary(),
  });
});
