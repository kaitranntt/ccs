import type { Settings } from '../types/config';
import {
  createUnifiedLaunchSettings,
  type UnifiedLaunchSettingsOptions,
  type UnifiedLaunchSettingsResult,
} from './launch-settings';

export interface OpenAICompatLaunchSettings {
  settingsPath: string;
  cleanup: () => void;
}

export interface OpenAICompatLaunchSettingsOptions {
  /**
   * When true, snapshot the isolated settings to a durable, profile-scoped
   * cache directory (~/.ccs/cache/isolated-settings/<hash>/) using atomic temp-and-rename.
   */
  durable?: boolean;
}

/**
 * Creates isolated launch settings for OpenAI-compatible profiles.
 * Strips Anthropic routing variables and guarantees ANTHROPIC_API_KEY is absent
 * so spawned processes route exclusively through proxyEnv without auth bypass.
 */
export function createOpenAICompatLaunchSettings(
  settingsPath: string,
  settings: Settings,
  options?: OpenAICompatLaunchSettingsOptions
): OpenAICompatLaunchSettings {
  const unifiedOptions: UnifiedLaunchSettingsOptions = {
    stripAnthropicRouting: true,
    stripKeys: ['ANTHROPIC_API_KEY'],
    durable: options?.durable,
    forceWrite: true,
  };

  const result: UnifiedLaunchSettingsResult = createUnifiedLaunchSettings(
    settingsPath,
    settings,
    unifiedOptions
  );

  return {
    settingsPath: result.settingsPath,
    cleanup: result.cleanup,
  };
}
