/**
 * WebSearch Hook Configuration
 *
 * Manages hook configuration in Claude settings.json.
 *
 * @module utils/websearch/hook-config
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { info, warn } from '../ui';
import { getWebSearchConfig } from '../../config/unified-config-loader';
import { getCcsDir } from '../config-manager';
import { isCcsWebSearchHook, deduplicateCcsHooks } from './hook-utils';

// Hook file name
const WEBSEARCH_HOOK = 'websearch-transformer.cjs';

/**
 * Get Claude settings path (respects CCS_HOME for test isolation)
 * In tests, returns path under CCS_HOME; in production, uses real ~/.claude/
 */
function getClaudeSettingsPath(): string {
  const ccsHome = process.env.CCS_HOME;
  if (ccsHome) {
    // Test mode: use CCS_HOME parent for .claude directory
    // This prevents tests from modifying user's real settings
    return path.join(path.dirname(ccsHome), '.claude', 'settings.json');
  }
  // Production: use real home directory
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/**
 * Get CCS hooks directory (respects CCS_HOME for test isolation)
 */
export function getCcsHooksDir(): string {
  return path.join(getCcsDir(), 'hooks');
}

// Buffer time added to max provider timeout for hook timeout (seconds)
const HOOK_TIMEOUT_BUFFER = 30;

// Minimum hook timeout in seconds (fallback if no providers configured)
const MIN_HOOK_TIMEOUT = 60;

/**
 * Get path to WebSearch hook
 */
export function getHookPath(): string {
  return path.join(getCcsHooksDir(), WEBSEARCH_HOOK);
}

/**
 * Get WebSearch hook configuration for settings.json
 * Timeout is computed from max provider timeout in config.yaml + buffer
 */
export function getWebSearchHookConfig(): Record<string, unknown> {
  const hookPath = getHookPath();
  const wsConfig = getWebSearchConfig();

  // Compute max timeout from enabled providers
  const timeouts: number[] = [];
  if (wsConfig.providers?.gemini?.enabled && wsConfig.providers.gemini.timeout) {
    timeouts.push(wsConfig.providers.gemini.timeout);
  }
  if (wsConfig.providers?.opencode?.enabled && wsConfig.providers.opencode.timeout) {
    timeouts.push(wsConfig.providers.opencode.timeout);
  }
  if (wsConfig.providers?.grok?.enabled && wsConfig.providers.grok.timeout) {
    timeouts.push(wsConfig.providers.grok.timeout);
  }

  // Hook timeout = max provider timeout + buffer (or minimum if none configured)
  const maxProviderTimeout = timeouts.length > 0 ? Math.max(...timeouts) : MIN_HOOK_TIMEOUT;
  const hookTimeout = maxProviderTimeout + HOOK_TIMEOUT_BUFFER;

  return {
    PreToolUse: [
      {
        matcher: 'WebSearch',
        hooks: [
          {
            type: 'command',
            command: `node "${hookPath}"`,
            timeout: hookTimeout,
          },
        ],
      },
    ],
  };
}

/**
 * Ensure WebSearch hook is configured in ~/.claude/settings.json
 */
export function ensureHookConfig(): boolean {
  try {
    const wsConfig = getWebSearchConfig();

    if (!wsConfig.enabled) {
      return false;
    }

    // Read existing settings or start fresh
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(getClaudeSettingsPath())) {
      try {
        const content = fs.readFileSync(getClaudeSettingsPath(), 'utf8');
        settings = JSON.parse(content);
      } catch {
        if (process.env.CCS_DEBUG) {
          console.error(warn('Malformed settings.json - will merge carefully'));
        }
      }
    }

    // Check if WebSearch hook already configured
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    const expectedHookPath = getHookPath();
    const expectedCommand = `node "${expectedHookPath}"`;

    if (hooks?.PreToolUse) {
      const webSearchHookIndex = hooks.PreToolUse.findIndex((h: unknown) => {
        const hook = h as Record<string, unknown>;
        if (hook.matcher !== 'WebSearch') return false;

        const hookArray = hook.hooks as Array<Record<string, unknown>> | undefined;
        const command = hookArray?.[0]?.command;
        if (typeof command !== 'string') return false;

        const normalized = command.replace(/\\/g, '/');
        return normalized.includes('.ccs/hooks/websearch-transformer');
      });

      if (webSearchHookIndex !== -1) {
        // Hook exists - first clean up any duplicates
        // INVARIANT: webSearchHookIndex remains valid after deduplication because:
        // - findIndex() returns the FIRST matching CCS hook
        // - deduplicateCcsHooks() keeps the FIRST CCS hook and removes subsequent duplicates
        // This means the index always points to the preserved hook.
        const hadDuplicates = deduplicateCcsHooks(settings);

        // Then check if it needs updating
        const existingHook = hooks.PreToolUse[webSearchHookIndex] as Record<string, unknown>;
        const existingHooks = existingHook.hooks as Array<Record<string, unknown>>;
        const currentHookConfig = getWebSearchHookConfig();
        const expectedHooks = (currentHookConfig.PreToolUse as Array<Record<string, unknown>>)[0]
          .hooks as Array<Record<string, unknown>>;
        const expectedTimeout = expectedHooks[0].timeout as number;

        let needsUpdate = false;

        if (existingHooks?.[0]?.command !== expectedCommand) {
          existingHooks[0].command = expectedCommand;
          needsUpdate = true;
        }

        if (existingHooks?.[0]?.timeout !== expectedTimeout) {
          existingHooks[0].timeout = expectedTimeout;
          needsUpdate = true;
        }

        // Combine into single write if either changed
        if (hadDuplicates || needsUpdate) {
          fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
          if (process.env.CCS_DEBUG) {
            if (hadDuplicates)
              console.error(info('Removed duplicate WebSearch hooks from settings.json'));
            if (needsUpdate) console.error(info('Updated WebSearch hook config in settings.json'));
          }
        }
        return true;
      }
    }

    // Get hook config
    const hookConfig = getWebSearchHookConfig();

    // Merge hook config into settings
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const settingsHooks = settings.hooks as Record<string, unknown[]>;
    if (!settingsHooks.PreToolUse) {
      settingsHooks.PreToolUse = [];
    }

    // Remove any existing CCS hooks first to prevent duplicates
    settingsHooks.PreToolUse = settingsHooks.PreToolUse.filter((h: unknown) => {
      const hook = h as Record<string, unknown>;
      return !isCcsWebSearchHook(hook);
    });

    // Add our hook config
    const preToolUseHooks = hookConfig.PreToolUse as unknown[];
    settingsHooks.PreToolUse.push(...preToolUseHooks);

    // Ensure ~/.claude directory exists
    const claudeDir = path.dirname(getClaudeSettingsPath());
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
    }

    // Write updated settings
    fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');

    if (process.env.CCS_DEBUG) {
      console.error(info('Added WebSearch hook to settings.json'));
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to configure WebSearch hook: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Remove CCS WebSearch hook from ~/.claude/settings.json
 * Only removes hooks matching: matcher='WebSearch' AND command contains '.ccs/hooks/websearch-transformer'
 * Preserves user-defined WebSearch hooks
 */
export function removeHookConfig(): boolean {
  try {
    if (!fs.existsSync(getClaudeSettingsPath())) {
      return true; // Nothing to remove
    }

    const content = fs.readFileSync(getClaudeSettingsPath(), 'utf8');
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(content);
    } catch {
      return false; // Malformed JSON, don't touch
    }

    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks?.PreToolUse) {
      return true; // No hooks to remove
    }

    const originalLength = hooks.PreToolUse.length;
    hooks.PreToolUse = hooks.PreToolUse.filter((h: unknown) => {
      const hook = h as Record<string, unknown>;
      if (hook.matcher !== 'WebSearch') return true; // Keep non-WebSearch hooks

      const hookArray = hook.hooks as Array<Record<string, unknown>> | undefined;
      if (!hookArray?.[0]?.command) return true; // Keep malformed entries

      const command = hookArray[0].command as string;
      // Normalize path separators for cross-platform matching (Windows uses backslashes)
      const normalizedCommand = command.replace(/\\/g, '/');
      return !normalizedCommand.includes('.ccs/hooks/websearch-transformer'); // Remove if CCS hook
    });

    if (hooks.PreToolUse.length === originalLength) {
      return true; // Nothing changed
    }

    // Clean up empty hooks object
    if (hooks.PreToolUse.length === 0) {
      delete hooks.PreToolUse;
    }
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }

    fs.writeFileSync(getClaudeSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');

    if (process.env.CCS_DEBUG) {
      console.error(info('Removed WebSearch hook from settings.json'));
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to remove hook config: ${(error as Error).message}`));
    }
    return false;
  }
}
