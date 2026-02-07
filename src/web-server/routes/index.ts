/**
 * Routes Aggregator - Combines all domain-specific route modules
 *
 * This file serves as the central entry point for all API routes,
 * mounting each domain router at its appropriate path.
 */

import { Router } from 'express';

// Import domain routers
import profileRoutes from './profile-routes';
import accountRoutes from './account-routes';
import configRoutes from './config-routes';
import healthRoutes from './health-routes';
import providerRoutes from './provider-routes';
import variantRoutes from './variant-routes';
import settingsRoutes from './settings-routes';
import websearchRoutes from './websearch-routes';
import cliproxyAuthRoutes from './cliproxy-auth-routes';
import cliproxyStatsRoutes from './cliproxy-stats-routes';
import cliproxySyncRoutes from './cliproxy-sync-routes';
import copilotRoutes from './copilot-routes';
import miscRoutes from './misc-routes';
import cliproxyServerRoutes from './proxy-routes';
import authRoutes from './auth-routes';
import persistRoutes from './persist-routes';
import catalogRoutes from './catalog-routes';

// Create the main API router
export const apiRoutes = Router();

// ==================== Profile & Settings ====================
// Profile CRUD, settings management, presets, accounts
apiRoutes.use('/profiles', profileRoutes);
apiRoutes.use('/settings', settingsRoutes);
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

// ==================== CLIProxy ====================
// Variants, auth, accounts, stats, status, models, error logs
apiRoutes.use('/cliproxy', variantRoutes);
apiRoutes.use('/cliproxy/auth', cliproxyAuthRoutes);
apiRoutes.use('/cliproxy', cliproxyStatsRoutes);
apiRoutes.use('/cliproxy/sync', cliproxySyncRoutes);
apiRoutes.use('/cliproxy/catalog', catalogRoutes);
apiRoutes.use('/cliproxy/openai-compat', providerRoutes);

// ==================== WebSearch ====================
apiRoutes.use('/websearch', websearchRoutes);

// ==================== Copilot ====================
apiRoutes.use('/copilot', copilotRoutes);

// ==================== CLIProxy Server Settings ====================
apiRoutes.use('/cliproxy-server', cliproxyServerRoutes);

// ==================== Misc (File API, Global Env) ====================
apiRoutes.use('/', miscRoutes);
