/**
 * Routes Aggregator - Combines all domain-specific route modules
 *
 * This file serves as the central entry point for all API routes,
 * mounting each domain router at its appropriate path.
 */

import { Router } from 'express';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

// Import domain routers
import profileRoutes from './profile-routes';
import accountRoutes from './account-routes';
import configRoutes from './config-routes';
import healthRoutes from './health-routes';
import providerRoutes from './provider-routes';
import variantRoutes from './variant-routes';
import settingsRoutes from './settings-routes';
import channelsRoutes from './channels-routes';
import websearchRoutes from './websearch-routes';
import imageAnalysisRoutes from './image-analysis-routes';
import browserRoutes from './browser-routes';
import cliproxyAuthRoutes from './cliproxy-auth-routes';
import cliproxyStatsRoutes from './cliproxy-stats-routes';
import cliproxyRoutingRoutes from './cliproxy-routing-routes';
import cliproxySyncRoutes from './cliproxy-sync-routes';
import aiProviderRoutes from './ai-provider-routes';
import copilotRoutes from './copilot-routes';
import cursorRoutes from './cursor-routes';
import droidRoutes from './droid-routes';
import codexRoutes from './codex-routes';
import miscRoutes from './misc-routes';
import cliproxyServerRoutes from './proxy-routes';
import authRoutes from './auth-routes';
import persistRoutes from './persist-routes';
import catalogRoutes from './catalog-routes';
import claudeExtensionRoutes from './claude-extension-routes';
import logsRoutes from './logs-routes';
import barRoutes from './bar-routes';

// Create the main API router
export const apiRoutes = Router();

const REMOTE_WRITE_ACCESS_ERROR =
  'Remote dashboard writes require localhost access when dashboard auth is disabled.';

// CCS Bar endpoints (/api/bar/*) expose the user's native quota, tier, and cost
// snapshot. Unlike the rest of the read API these are sensitive even on GET, so
// they are gated for ALL methods (not just mutations) by the same
// localhost-when-auth-disabled choke point.
const BAR_LOCAL_ACCESS_ERROR =
  'CCS Bar endpoints require localhost access when dashboard auth is disabled.';

function isMutationMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return (
    normalized === 'POST' ||
    normalized === 'PUT' ||
    normalized === 'PATCH' ||
    normalized === 'DELETE'
  );
}

apiRoutes.use((req, res, next) => {
  // /api/bar/* leaks native quota/tier/cost data; gate it for every method.
  // This middleware runs before the '/bar' mount below, so req.path still
  // carries the '/bar' prefix here.
  // Exact segment match so a future sibling like '/barbaz' isn't accidentally gated.
  if (req.path === '/bar' || req.path.startsWith('/bar/')) {
    if (requireLocalAccessWhenAuthDisabled(req, res, BAR_LOCAL_ACCESS_ERROR)) {
      next();
    }
    return;
  }

  if (!isMutationMethod(req.method)) {
    next();
    return;
  }

  if (requireLocalAccessWhenAuthDisabled(req, res, REMOTE_WRITE_ACCESS_ERROR)) {
    next();
  }
});

// ==================== Profile & Settings ====================
// Profile CRUD, settings management, presets, accounts
apiRoutes.use('/profiles', profileRoutes);
apiRoutes.use('/settings', settingsRoutes);
apiRoutes.use('/channels', channelsRoutes);
apiRoutes.use('/accounts', accountRoutes);

// ==================== Unified Config ====================
// Config format, migration
apiRoutes.use('/config', configRoutes);

// ==================== Health Checks ====================
apiRoutes.use('/health', healthRoutes);

// ==================== Dashboard Auth ====================
apiRoutes.use('/auth', authRoutes);

// ==================== Persist (Backup Management) ====================
apiRoutes.use('/persist', persistRoutes);
apiRoutes.use('/claude-extension', claudeExtensionRoutes);

// ==================== CLIProxy ====================
// Variants, auth, accounts, stats, status, models, error logs
apiRoutes.use('/cliproxy', cliproxyRoutingRoutes);
apiRoutes.use('/cliproxy', variantRoutes);
apiRoutes.use('/cliproxy/auth', cliproxyAuthRoutes);
apiRoutes.use('/cliproxy', cliproxyStatsRoutes);
apiRoutes.use('/cliproxy/sync', cliproxySyncRoutes);
apiRoutes.use('/cliproxy/catalog', catalogRoutes);
apiRoutes.use('/cliproxy/ai-providers', aiProviderRoutes);
apiRoutes.use('/cliproxy/openai-compat', providerRoutes);

// ==================== WebSearch ====================
apiRoutes.use('/websearch', websearchRoutes);
apiRoutes.use('/browser', browserRoutes);
apiRoutes.use('/image-analysis', imageAnalysisRoutes);

// ==================== Copilot ====================
apiRoutes.use('/copilot', copilotRoutes);

// ==================== Cursor ====================
apiRoutes.use('/cursor', cursorRoutes);
apiRoutes.use('/legacy/cursor', cursorRoutes);

// ==================== Droid ====================
apiRoutes.use('/droid', droidRoutes);

// ==================== Codex ====================
apiRoutes.use('/codex', codexRoutes);

// ==================== CLIProxy Server Settings ====================
apiRoutes.use('/cliproxy-server', cliproxyServerRoutes);

// ==================== Bar (Menu Bar Glance) ====================
apiRoutes.use('/bar', barRoutes);

// ==================== Misc (File API, Global Env) ====================
apiRoutes.use('/', miscRoutes);
apiRoutes.use('/logs', logsRoutes);
