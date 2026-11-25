/**
 * OpenAI Compatibility Layer Manager
 *
 * Manages OpenAI-compatible providers (OpenRouter, Together, etc.)
 * in CLIProxyAPI's config.yaml.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ConfigError } from '../../errors/error-types';
import { configExists, regenerateConfig } from '../config/generator';
import { getCliproxyConfigPath } from '../config/path-resolver';
import { rewriteTopLevelYamlSection } from './config-yaml-sections';

/** Model alias configuration */
export interface OpenAICompatModel {
  name: string; // Upstream model name
  alias: string; // Client-visible alias
}

/** OpenAI-compatible provider configuration */
export interface OpenAICompatProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: OpenAICompatModel[];
}

/** Config.yaml structure for parsing */
interface ConfigYaml {
  port?: number;
  'api-keys'?: string[];
  'auth-dir'?: string;
  'openai-compatibility'?: Array<{
    name: string;
    'base-url': string;
    headers?: Record<string, string>;
    'api-key-entries': Array<{
      'api-key': string;
      'proxy-url'?: string;
    }>;
    models?: Array<{
      name: string;
      alias: string;
    }>;
  }>;
  [key: string]: unknown;
}

/**
 * Load current config.yaml
 */
function loadConfig(): ConfigYaml {
  const configPath = getCliproxyConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return (yaml.load(content) as ConfigYaml) || {};
  } catch {
    return {};
  }
}

/**
 * Persist only the openai-compatibility section so the generated config header
 * and unrelated user-managed sections survive legacy writes.
 */
function saveConfig(config: ConfigYaml): void {
  const configPath = getCliproxyConfigPath();
  if (!configExists()) {
    regenerateConfig();
  }

  const currentContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
  const sectionContent =
    config['openai-compatibility'] && config['openai-compatibility'].length > 0
      ? yaml.dump(
          { 'openai-compatibility': config['openai-compatibility'] },
          {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false,
          }
        )
      : null;
  const nextContent = rewriteTopLevelYamlSection(
    currentContent,
    'openai-compatibility',
    sectionContent
  );
  const tempPath = `${configPath}.tmp`;
  fs.writeFileSync(tempPath, nextContent, { mode: 0o600 });
  fs.renameSync(tempPath, configPath);
}

/**
 * List all configured OpenAI-compatible providers
 */
export function listOpenAICompatProviders(): OpenAICompatProvider[] {
  const config = loadConfig();
  const providers = config['openai-compatibility'] || [];

  return providers.map((p) => ({
    name: p.name,
    baseUrl: p['base-url'],
    apiKey: p['api-key-entries']?.[0]?.['api-key'] || '',
    models: (p.models || []).map((m) => ({
      name: m.name,
      alias: m.alias,
    })),
  }));
}

/**
 * Get a specific provider by name
 */
export function getOpenAICompatProvider(name: string): OpenAICompatProvider | null {
  const providers = listOpenAICompatProviders();
  return providers.find((p) => p.name === name) || null;
}

/**
 * Add a new OpenAI-compatible provider
 * @throws Error if provider with same name already exists
 */
export function addOpenAICompatProvider(provider: OpenAICompatProvider): void {
  const config = loadConfig();

  // Initialize array if not exists
  if (!config['openai-compatibility']) {
    config['openai-compatibility'] = [];
  }

  // Check for duplicate
  const existing = config['openai-compatibility'].find((p) => p.name === provider.name);
  if (existing) {
    throw new ConfigError(`Provider '${provider.name}' already exists`);
  }

  // Add new provider
  config['openai-compatibility'].push({
    name: provider.name,
    'base-url': provider.baseUrl,
    'api-key-entries': [{ 'api-key': provider.apiKey }],
    models: provider.models.map((m) => ({
      name: m.name,
      alias: m.alias,
    })),
  });

  saveConfig(config);
}

/**
 * Update an existing provider
 * @throws Error if provider doesn't exist
 */
export function updateOpenAICompatProvider(
  name: string,
  updates: Partial<OpenAICompatProvider>
): void {
  const config = loadConfig();

  if (!config['openai-compatibility']) {
    throw new ConfigError(`Provider '${name}' not found`);
  }

  const index = config['openai-compatibility'].findIndex((p) => p.name === name);
  if (index === -1) {
    throw new ConfigError(`Provider '${name}' not found`);
  }

  const provider = config['openai-compatibility'][index];

  // Apply updates
  if (updates.baseUrl) {
    provider['base-url'] = updates.baseUrl;
  }
  if (updates.apiKey) {
    provider['api-key-entries'] = [{ 'api-key': updates.apiKey }];
  }
  if (updates.models) {
    provider.models = updates.models.map((m) => ({
      name: m.name,
      alias: m.alias,
    }));
  }
  if (updates.name && updates.name !== name) {
    provider.name = updates.name;
  }

  saveConfig(config);
}

/**
 * Remove a provider
 * @returns true if removed, false if not found
 */
export function removeOpenAICompatProvider(name: string): boolean {
  const config = loadConfig();

  if (!config['openai-compatibility']) {
    return false;
  }

  const index = config['openai-compatibility'].findIndex((p) => p.name === name);
  if (index === -1) {
    return false;
  }

  config['openai-compatibility'].splice(index, 1);

  // Remove empty array
  if (config['openai-compatibility'].length === 0) {
    delete config['openai-compatibility'];
  }

  saveConfig(config);
  return true;
}

/** Pre-configured OpenRouter template */
export const OPENROUTER_TEMPLATE: Omit<OpenAICompatProvider, 'apiKey'> = {
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  models: [
    { name: 'anthropic/claude-3.5-sonnet', alias: 'claude-sonnet' },
    { name: 'anthropic/claude-3-opus', alias: 'claude-opus' },
    { name: 'google/gemini-pro-1.5', alias: 'gemini-pro' },
  ],
};

/** Pre-configured Together template */
export const TOGETHER_TEMPLATE: Omit<OpenAICompatProvider, 'apiKey'> = {
  name: 'together',
  baseUrl: 'https://api.together.xyz/v1',
  models: [
    { name: 'meta-llama/Llama-3-70b-chat-hf', alias: 'llama-70b' },
    { name: 'mistralai/Mixtral-8x7B-Instruct-v0.1', alias: 'mixtral' },
  ],
};
