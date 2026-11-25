/**
 * Shared types for CLIProxy Model Catalog
 */

import type { CLIProxyProvider } from './types';

/**
 * Thinking support configuration for a model.
 * Defines how thinking/reasoning budget can be controlled.
 */
export interface ThinkingSupport {
  /** Type of thinking control: 'budget' (token count), 'levels' (named levels), 'none' */
  type: 'budget' | 'levels' | 'none';
  /** Minimum budget tokens (for budget type) */
  min?: number;
  /** Maximum budget tokens (for budget type) */
  max?: number;
  /** Valid level names (for levels type) */
  levels?: string[];
  /** Maximum reasoning effort level (caps effort at this level for levels type) */
  maxLevel?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Whether zero/disabled thinking is allowed */
  zeroAllowed?: boolean;
  /** Whether dynamic/auto thinking is allowed */
  dynamicAllowed?: boolean;
}

/**
 * Model entry definition
 */
export interface ModelEntry {
  /** Literal model name to put in settings.json */
  id: string;
  /** Human-readable name for display */
  name: string;
  /** Access tier indicator - 'ultra' for Claude, 'pro' for premium Gemini, 'free' for basic */
  tier?: 'free' | 'pro' | 'ultra';
  /** Optional description for the model */
  description?: string;
  /** Total context window in tokens when authoritatively known */
  contextWindow?: number;
  /** Model has known issues - show warning when selected */
  broken?: boolean;
  /** Issue URL for broken models */
  issueUrl?: string;
  /** Model is deprecated - show warning when selected */
  deprecated?: boolean;
  /** Deprecation reason/message */
  deprecationReason?: string;
  /** Thinking/reasoning support configuration */
  thinking?: ThinkingSupport;
  /** Whether model supports 1M extended context window (appends [1m] suffix) */
  extendedContext?: boolean;
  /** Whether model can read image inputs natively without the Image transformer */
  nativeImageInput?: boolean;
  /** Additional Codex service-tier suffixes supported by this model. */
  codexServiceTiers?: Array<'fast'>;
}

/**
 * Provider catalog definition
 */
export interface ProviderCatalog {
  provider: CLIProxyProvider;
  displayName: string;
  models: ModelEntry[];
  defaultModel: string;
}
