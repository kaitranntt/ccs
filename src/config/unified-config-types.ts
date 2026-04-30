/**
 * Unified Config Types for CCS v2
 *
 * This file defines the new unified YAML configuration format that consolidates:
 * - config.json (API profiles)
 * - profiles.json (account metadata)
 * - *.settings.json (env vars)
 *
 * Into a single config.yaml structure.
 *
 * Types have been reorganized into src/config/schemas/ for maintainability.
 * This file re-exports everything for backward compatibility.
 */
export * from './schemas/index';
