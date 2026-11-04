/**
 * Launch settings overlay.
 *
 * CCS routes third-party providers through an ephemeral local proxy chain
 * (tool-sanitization + codex-reasoning). The resolved `ANTHROPIC_BASE_URL`
 * (and model/auth overrides) for that chain only exists in the spawned Claude
 * process environment, because the proxy ports are random per launch and cannot
 * be persisted to the on-disk provider settings file.
 *
 * Claude CLI is launched with `--settings <providerSettings.json>`. Recent
 * Claude Code releases apply the settings file's `env` block on top of the
 * inherited process environment, so the persisted `ANTHROPIC_BASE_URL` (which
 * points straight at CLIProxy) overrides the proxy-chain URL CCS injected via
 * env. Claude then bypasses the proxy chain entirely — breaking tool-name
 * sanitization and Codex system-message folding.
 *
 * This module delegates to the canonical `src/utils/launch-settings.ts` helper
 * which unifies overlay and strip-based launch settings.
 */

import {
  buildUnifiedLaunchSettings,
  createUnifiedLaunchSettings,
  LAUNCH_ROUTING_ENV_KEYS,
} from '../../utils/launch-settings';

export { LAUNCH_ROUTING_ENV_KEYS as ROUTING_ENV_KEYS };

/**
 * Build a settings object based on the persisted settings file, with routing
 * env vars overlaid from the resolved launch environment.
 */
export function buildLaunchSettingsOverlay(
  settingsPath: string,
  env: NodeJS.ProcessEnv
): { settings: Record<string, unknown>; changed: boolean } {
  let base: Record<string, unknown> = {};
  try {
    const fs = require('fs');
    if (fs.existsSync(settingsPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    }
  } catch {
    base = {};
  }

  const { settings, changed } = buildUnifiedLaunchSettings(base, { overlayEnv: env });
  return { settings: settings as Record<string, unknown>, changed };
}

/**
 * Prepare the settings file path to hand to `claude --settings`.
 */
export function prepareLaunchSettings(
  settingsPath: string,
  env: NodeJS.ProcessEnv
): { settingsPath: string; cleanup: () => void } {
  const result = createUnifiedLaunchSettings(settingsPath, undefined, {
    overlayEnv: env,
    forceWrite: false,
  });

  return {
    settingsPath: result.settingsPath,
    cleanup: result.cleanup,
  };
}
