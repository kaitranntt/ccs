/**
 * Base Config Loader for CLIProxy Providers
 *
 * Loads provider configurations from config/base-{provider}.settings.json files.
 * This allows model mappings to be easily updated without digging into code.
 *
 * Config files are bundled with the npm package and read at runtime.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CLIProxyProvider, ProviderModelMapping } from '../types';

/** Base settings file structure */
interface BaseSettings {
  env: {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_MODEL?: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  };
}

/** Cached configs to avoid repeated file reads */
const configCache: Map<CLIProxyProvider, BaseSettings> = new Map();

/**
 * Get path to base config file for provider
 * Config files are in the config/ directory relative to package root
 */
function getBaseConfigPath(provider: CLIProxyProvider): string {
  // __dirname points to dist/cliproxy at runtime
  // Config files are at package root: ../config/
  const configDir = path.join(__dirname, '..', '..', '..', 'config');
  return path.join(configDir, `base-${provider}.settings.json`);
}

/**
 * Load base config for a provider
 * Returns parsed settings from config/base-{provider}.settings.json
 */
export function loadBaseConfig(provider: CLIProxyProvider): BaseSettings {
  // Check cache first
  const cached = configCache.get(provider);
  if (cached) {
    return cached;
  }

  const configPath = getBaseConfigPath(provider);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Base config not found for provider '${provider}': ${configPath}\n` +
        `Expected file: config/base-${provider}.settings.json`
    );
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const settings: BaseSettings = JSON.parse(content);

    // Validate required fields
    if (!settings.env || typeof settings.env !== 'object') {
      throw new Error('Missing or invalid "env" object');
    }

    // claude provider is model-neutral: it does not pin model env vars so that
    // the user's own Claude Code model selection is respected end-to-end.
    if (provider !== 'claude') {
      const required = [
        'ANTHROPIC_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      ];

      for (const field of required) {
        if (!settings.env[field as keyof BaseSettings['env']]) {
          throw new Error(`Missing required field: env.${field}`);
        }
      }
    }

    // Cache and return
    configCache.set(provider, settings);
    return settings;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to load base config for '${provider}': ${err.message}`);
  }
}

/**
 * Get model mapping from base config
 * Extracts model names from env vars.
 * Returns undefined model fields for the claude provider (model-neutral passthrough).
 */
export function getModelMappingFromConfig(provider: CLIProxyProvider): ProviderModelMapping {
  const config = loadBaseConfig(provider);

  // claude is model-neutral: ANTHROPIC_MODEL is absent from its config; callers
  // that need model IDs (e.g. getClaudeEnvVars) guard on provider !== 'claude'.
  return {
    defaultModel: config.env.ANTHROPIC_MODEL ?? '',
    claudeModel: config.env.ANTHROPIC_MODEL ?? '',
    opusModel: config.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    sonnetModel: config.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    haikuModel: config.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  };
}

/**
 * Get full env vars from base config
 * Returns the complete env object for Claude CLI
 */
export function getEnvVarsFromConfig(provider: CLIProxyProvider): NodeJS.ProcessEnv {
  const config = loadBaseConfig(provider);
  return config.env as unknown as NodeJS.ProcessEnv;
}

/**
 * Clear config cache (useful for testing)
 */
export function clearConfigCache(): void {
  configCache.clear();
}
