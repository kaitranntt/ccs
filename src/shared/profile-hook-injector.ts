/**
 * Shared Profile Hook Injector
 *
 * Consolidates per-profile settings.json PreToolUse hook injection,
 * deduplication, timeout synchronization, and migration marker management
 * across WebSearch and Image Analyzer hook injectors.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from './ccs-paths';

export function getProfileSettingsPath(profileName: string, settingsPath?: string | null): string {
  if (typeof settingsPath === 'string' && settingsPath.trim().length > 0) {
    return settingsPath;
  }

  return path.join(getCcsDir(), `${profileName}.settings.json`);
}

export function hasPreToolUseHook(
  settings: Record<string, unknown>,
  matcherFn: (hook: Record<string, unknown>) => boolean
): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.PreToolUse) {
    return false;
  }

  return hooks.PreToolUse.some((hook) => matcherFn(hook as Record<string, unknown>));
}

export function hasProfilePreToolUseHook(
  profileName: string,
  settingsPath: string | null | undefined,
  validProfileNamePattern: RegExp,
  matcherFn: (hook: Record<string, unknown>) => boolean
): boolean {
  if (!validProfileNamePattern.test(profileName)) {
    return false;
  }

  const resolvedSettingsPath = getProfileSettingsPath(profileName, settingsPath);
  if (!fs.existsSync(resolvedSettingsPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(resolvedSettingsPath, 'utf8');
    const settings = JSON.parse(content) as Record<string, unknown>;
    return hasPreToolUseHook(settings, matcherFn);
  } catch {
    return false;
  }
}

export function removeProfilePreToolUseHooks(
  profileName: string,
  settingsPath: string | null | undefined,
  validProfileNamePattern: RegExp,
  removeFn: (settings: Record<string, unknown>) => boolean,
  onRemoved?: (resolvedSettingsPath: string) => void
): boolean {
  if (!validProfileNamePattern.test(profileName)) {
    return false;
  }

  const resolvedSettingsPath = getProfileSettingsPath(profileName, settingsPath);
  if (!fs.existsSync(resolvedSettingsPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(resolvedSettingsPath, 'utf8');
    const settings = JSON.parse(content) as Record<string, unknown>;
    if (!removeFn(settings)) {
      return false;
    }

    fs.writeFileSync(resolvedSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    onRemoved?.(resolvedSettingsPath);
    return true;
  } catch {
    return false;
  }
}

export function ensureHookMigrationMarker(
  markerPath: string,
  options: {
    beforeCreate?: () => void;
    onError?: (error: Error) => void;
  } = {}
): void {
  if (fs.existsSync(markerPath)) {
    return;
  }

  try {
    options.beforeCreate?.();
    const ccsDir = getCcsDir();
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }
    // Create marker file atomically (wx = fail if exists, prevents race condition)
    fs.writeFileSync(markerPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    options.onError?.(error as Error);
  }
}

export function removeHookMigrationMarker(
  markerPath: string,
  onError?: (error: Error) => void
): void {
  try {
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch (error) {
    onError?.(error as Error);
  }
}

export function updateProfileHookTimeoutIfNeeded(options: {
  settings: Record<string, unknown>;
  settingsPath: string;
  matcher: string;
  commandPathFragment: string;
  expectedHookPath: string;
  hookConfig: Record<string, unknown>;
  onUpdated?: () => void;
  onError?: (error: Error) => void;
}): boolean {
  try {
    const hooks = options.settings.hooks as Record<string, unknown[]>;
    const expectedCommand = `node "${options.expectedHookPath}"`;
    const expectedHooks = (options.hookConfig.PreToolUse as Array<Record<string, unknown>>)[0]
      .hooks as Array<Record<string, unknown>>;
    const expectedTimeout = expectedHooks[0].timeout as number;

    let needsUpdate = false;

    for (const entry of hooks.PreToolUse) {
      const hook = entry as Record<string, unknown>;
      if (hook.matcher !== options.matcher) continue;

      const hookArray = hook.hooks as Array<Record<string, unknown>>;
      if (!hookArray?.[0]?.command) continue;

      const command = hookArray[0].command;
      if (typeof command !== 'string') continue;

      // Normalize path separators for cross-platform matching (Windows uses backslashes)
      const normalizedCommand = command.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (!normalizedCommand.includes(options.commandPathFragment)) continue;

      if (hookArray[0].command !== expectedCommand) {
        hookArray[0].command = expectedCommand;
        needsUpdate = true;
      }

      if (hookArray[0].timeout !== expectedTimeout) {
        hookArray[0].timeout = expectedTimeout;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      fs.writeFileSync(options.settingsPath, JSON.stringify(options.settings, null, 2), 'utf8');
      options.onUpdated?.();
    }

    return true;
  } catch (error) {
    options.onError?.(error as Error);
    return false;
  }
}

export function ensurePreToolUseProfileHook(options: {
  profileName: string;
  settingsPath: string;
  matcher: string;
  commandPathFragment: string;
  expectedHookPath: string;
  getHookConfig: () => Record<string, unknown>;
  isHookEntry: (hook: Record<string, unknown>) => boolean;
  deduplicateHooks: (settings: Record<string, unknown>) => boolean;
  compareExistingOnDeduplicate?: boolean;
  onMalformed?: (error: Error) => void;
  onDeduplicated?: () => void;
  onAdded?: () => void;
  onTimeoutUpdated?: () => void;
  onTimeoutError?: (error: Error) => void;
}): boolean {
  const ccsDir = getCcsDir();
  if (!fs.existsSync(ccsDir)) {
    fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
  }

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(options.settingsPath)) {
    try {
      const content = fs.readFileSync(options.settingsPath, 'utf8');
      settings = JSON.parse(content);
    } catch (parseError) {
      options.onMalformed?.(parseError as Error);
      // Never overwrite malformed settings files; avoid destructive data loss.
      return false;
    }
  }

  if (hasPreToolUseHook(settings, options.isHookEntry)) {
    const hadDuplicates = options.deduplicateHooks(settings);
    if (hadDuplicates) {
      const newContent = JSON.stringify(settings, null, 2);
      if (options.compareExistingOnDeduplicate) {
        const existingContent = fs.readFileSync(options.settingsPath, 'utf8');
        if (newContent !== existingContent) {
          fs.writeFileSync(options.settingsPath, newContent, 'utf8');
          options.onDeduplicated?.();
        }
      } else {
        fs.writeFileSync(options.settingsPath, newContent, 'utf8');
        options.onDeduplicated?.();
      }
    }

    return updateProfileHookTimeoutIfNeeded({
      settings,
      settingsPath: options.settingsPath,
      matcher: options.matcher,
      commandPathFragment: options.commandPathFragment,
      expectedHookPath: options.expectedHookPath,
      hookConfig: options.getHookConfig(),
      onUpdated: options.onTimeoutUpdated,
      onError: options.onTimeoutError,
    });
  }

  const hookConfig = options.getHookConfig();
  if (!settings.hooks) {
    settings.hooks = {};
  }

  const settingsHooks = settings.hooks as Record<string, unknown[]>;
  if (!settingsHooks.PreToolUse) {
    settingsHooks.PreToolUse = [];
  }

  const preToolUseHooks = hookConfig.PreToolUse as unknown[];
  settingsHooks.PreToolUse.push(...preToolUseHooks);

  fs.writeFileSync(options.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  options.onAdded?.();

  return true;
}
