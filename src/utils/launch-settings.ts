import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

import type { Settings } from '../types/config';
import { getCcsDir } from './config-manager';
import {
  ANTHROPIC_MODEL_ENV_KEYS,
  ANTHROPIC_ROUTING_ENV_KEYS,
  stripAnthropicRoutingEnv,
} from './shell-executor';
import { EXTRA_EXTENDED_CONTEXT_MODEL_ENV_KEYS } from '../shared/extended-context-utils';

/**
 * Environment keys that control provider routing/model selection and are read
 * by Claude CLI. Overlaid by default when an active proxy chain is resolved.
 */
export const LAUNCH_ROUTING_ENV_KEYS: readonly string[] = [
  ...ANTHROPIC_ROUTING_ENV_KEYS,
  ...ANTHROPIC_MODEL_ENV_KEYS,
  ...EXTRA_EXTENDED_CONTEXT_MODEL_ENV_KEYS,
];

export interface UnifiedLaunchSettingsOptions {
  /**
   * Key-value map of environment variables to overlay into the settings file's `env` block.
   */
  overlayEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /**
   * Keys to explicitly strip/delete from the settings file's `env` block.
   * Runs AFTER overlayEnv, guaranteeing these keys are completely absent from the output.
   */
  stripKeys?: readonly string[];
  /**
   * If true, also strip all default Anthropic routing keys via stripAnthropicRoutingEnv.
   */
  stripAnthropicRouting?: boolean;
  /**
   * When true, snapshot the isolated settings to a durable, profile-scoped
   * cache directory (~/.ccs/cache/isolated-settings/<hash>/) using atomic temp-and-rename.
   * Required for background fleet daemon respawns (Issue #1734).
   */
  durable?: boolean;
  /**
   * If false and no routing/strip changes occurred, ephemeral mode returns the original
   * settingsPath without writing a temporary file. Defaults to false.
   */
  forceWrite?: boolean;
}

export interface UnifiedLaunchSettingsResult {
  settingsPath: string;
  cleanup: () => void;
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds the modified settings JSON object by applying overlayEnv and stripKeys.
 */
export function buildUnifiedLaunchSettings(
  initialSettings: Settings | Record<string, unknown>,
  options?: UnifiedLaunchSettingsOptions
): { settings: Settings; changed: boolean } {
  const base = JSON.parse(JSON.stringify(initialSettings)) as Settings;
  let mergedEnv: Record<string, unknown> = isRecord(base.env) ? { ...base.env } : {};
  let changed = false;

  // 1. Apply overlayEnv if provided
  if (options?.overlayEnv) {
    const keysToCheck = LAUNCH_ROUTING_ENV_KEYS;
    for (const key of keysToCheck) {
      const resolved = options.overlayEnv[key];
      if (typeof resolved === 'string' && mergedEnv[key] !== resolved) {
        mergedEnv[key] = resolved;
        changed = true;
      }
    }
  }

  // 2. Strip Anthropic routing keys if requested
  if (options?.stripAnthropicRouting) {
    const beforeCount = Object.keys(mergedEnv).length;
    mergedEnv = Object.fromEntries(
      Object.entries(stripAnthropicRoutingEnv(mergedEnv as Record<string, string>)).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
    if (Object.keys(mergedEnv).length !== beforeCount) {
      changed = true;
    }
  }

  // 3. Apply explicit stripKeys (forced-absent keys, e.g. ANTHROPIC_API_KEY)
  if (options?.stripKeys && options.stripKeys.length > 0) {
    for (const key of options.stripKeys) {
      if (key in mergedEnv) {
        delete mergedEnv[key];
        changed = true;
      }
    }
  }

  // Clean up empty env
  if (Object.keys(mergedEnv).length > 0) {
    base.env = mergedEnv as Record<string, string>;
  } else if ('env' in base) {
    delete base.env;
    changed = true;
  }

  return { settings: base, changed };
}

/**
 * Prepares launch settings with unified overlay, strip, and durable/ephemeral isolation.
 */
export function createUnifiedLaunchSettings(
  sourceSettingsPath: string,
  initialSettings?: Settings | Record<string, unknown>,
  options?: UnifiedLaunchSettingsOptions
): UnifiedLaunchSettingsResult {
  const noopResult = (changed: boolean): UnifiedLaunchSettingsResult => ({
    settingsPath: sourceSettingsPath,
    cleanup: () => {},
    changed,
  });

  let baseSettings: Settings | Record<string, unknown> = initialSettings ?? {};
  if (!initialSettings && fs.existsSync(sourceSettingsPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(sourceSettingsPath, 'utf8'));
      if (isRecord(parsed)) {
        baseSettings = parsed;
      }
    } catch {
      baseSettings = {};
    }
  }

  const { settings, changed } = buildUnifiedLaunchSettings(baseSettings, options);

  // If no change and forceWrite is false and not durable, return original path
  if (!changed && !options?.forceWrite && !options?.durable) {
    return noopResult(false);
  }

  const contentStr = JSON.stringify(settings, null, 2) + '\n';
  const fileName = path.basename(sourceSettingsPath) || 'settings.json';

  // 1. Durable mode: stored in ~/.ccs/cache/isolated-settings/<hash>/
  if (options?.durable) {
    const pathHash = createHash('sha256')
      .update(path.resolve(sourceSettingsPath))
      .digest('hex')
      .slice(0, 16);
    const durableDir = path.join(getCcsDir(), 'cache', 'isolated-settings', pathHash);
    fs.mkdirSync(durableDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(durableDir, 0o700);

    const targetPath = path.join(durableDir, fileName);
    const tempFile = path.join(durableDir, `.${fileName}.${randomUUID()}.tmp`);

    let renamed = false;
    try {
      fs.writeFileSync(tempFile, contentStr, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(tempFile, targetPath);
      renamed = true;
    } finally {
      if (!renamed) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore
        }
      }
    }

    return {
      settingsPath: targetPath,
      cleanup: () => {},
      changed,
    };
  }

  // 2. Ephemeral mode: os.tmpdir() with 0o700 / 0o600
  try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-launch-settings-'));
    fs.chmodSync(tempDir, 0o700);

    const runtimePath = path.join(tempDir, fileName);
    fs.writeFileSync(runtimePath, contentStr, {
      encoding: 'utf8',
      mode: 0o600,
    });

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };

    return {
      settingsPath: runtimePath,
      cleanup,
      changed,
    };
  } catch {
    return noopResult(changed);
  }
}
