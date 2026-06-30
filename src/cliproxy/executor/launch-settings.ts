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
 * sanitization and Codex system-message folding (the latter surfaces as
 * `400 {"detail":"System messages are not allowed"}`).
 *
 * To keep the proxy chain authoritative regardless of Claude's env precedence,
 * we write a runtime copy of the settings file whose `env` routing keys are
 * overlaid with the resolved launch environment, and pass that copy to
 * `--settings`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ANTHROPIC_MODEL_ENV_KEYS, ANTHROPIC_ROUTING_ENV_KEYS } from '../../utils/shell-executor';

// SIBLING HELPER: src/utils/openai-compat-launch-settings.ts solves the same
// "persisted --settings env clobbers runtime routing env" problem by STRIPPING
// routing keys (process env wins by absence). This module instead OVERLAYS the
// resolved values (settings wins by overwrite). The two differ intentionally:
// strip vs overlay diverge when a key is present on disk but absent from the
// process env. Unifying them needs an explicit force-absent API — see issue #1609.

/**
 * Environment keys that control provider routing/model selection and are read
 * by Claude from the settings `env` block. These must reflect the resolved
 * proxy-chain environment, not the persisted on-disk values. Reuses the
 * canonical routing/model key lists from shell-executor.
 */
const ROUTING_ENV_KEYS = [...ANTHROPIC_ROUTING_ENV_KEYS, ...ANTHROPIC_MODEL_ENV_KEYS];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a settings object based on the persisted settings file, with routing
 * `env` keys overlaid from the resolved launch environment.
 *
 * @returns The merged settings and whether any routing key actually changed.
 */
export function buildLaunchSettingsOverlay(
  settingsPath: string,
  env: NodeJS.ProcessEnv
): { settings: Record<string, unknown>; changed: boolean } {
  let base: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (isRecord(parsed)) {
        base = parsed;
      }
    }
  } catch {
    // Corrupt/unreadable settings file: fall back to an env-only overlay.
    base = {};
  }

  const mergedEnv: Record<string, unknown> = isRecord(base.env) ? { ...base.env } : {};

  let changed = false;
  for (const key of ROUTING_ENV_KEYS) {
    const resolved = env[key];
    if (typeof resolved === 'string' && mergedEnv[key] !== resolved) {
      mergedEnv[key] = resolved;
      changed = true;
    }
  }

  return { settings: { ...base, env: mergedEnv }, changed };
}

/**
 * Prepare the settings file path to hand to `claude --settings`.
 *
 * When the resolved launch environment changes any routing key relative to the
 * persisted settings file (i.e. a proxy chain is active), a runtime overlay
 * file is written and its path returned together with a cleanup callback that
 * removes it. Otherwise the original `settingsPath` is returned unchanged and
 * cleanup is a no-op.
 */
export function prepareLaunchSettings(
  settingsPath: string,
  env: NodeJS.ProcessEnv
): { settingsPath: string; cleanup: () => void } {
  const noop = { settingsPath, cleanup: () => {} };

  let overlay: { settings: Record<string, unknown>; changed: boolean };
  try {
    overlay = buildLaunchSettingsOverlay(settingsPath, env);
  } catch {
    return noop;
  }

  if (!overlay.changed) {
    return noop;
  }

  try {
    // Write to a private temp dir (matches createOpenAICompatLaunchSettings) so
    // the overlay never lands in the user's ~/.ccs and is trivially isolated.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-launch-settings-'));
    fs.chmodSync(tempDir, 0o700);

    const runtimePath = path.join(tempDir, path.basename(settingsPath) || 'settings.json');
    fs.writeFileSync(runtimePath, JSON.stringify(overlay.settings, null, 2) + '\n', {
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
        // best-effort cleanup
      }
    };

    return { settingsPath: runtimePath, cleanup };
  } catch {
    // If we cannot write the overlay, fall back to the persisted file. Routing
    // may bypass the proxy chain, but the session still launches.
    return noop;
  }
}
