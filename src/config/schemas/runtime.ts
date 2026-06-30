/**
 * Runtime configuration types and defaults.
 *
 * The runtime section holds opt-in knobs that affect how CCS launches the
 * downstream CLI (Claude Code, Gemini CLI, etc.). Everything here is optional;
 * an absent section preserves the downstream CLI's own defaults exactly.
 *
 * Output limits (issue #231): users hit the downstream CLI's low default caps
 * for MCP tool output and Bash output during normal workflows and previously
 * had to hand-edit the spawned CLI's settings file. When set, CCS injects the
 * matching downstream env vars (as strings) into the spawned-CLI environment.
 */

/**
 * Opt-in output-limit overrides for the spawned downstream CLI.
 *
 * Each field is optional. When a field is unset, CCS injects NOTHING for it,
 * so the downstream CLI keeps its own built-in default. This is intentional:
 * always-injecting a high cap could regress context budget / OOM behavior.
 */
export interface OutputLimitsConfig {
  /**
   * Max MCP tool output tokens.
   * Maps to the downstream env var MAX_MCP_OUTPUT_TOKENS (Claude Code default ~25000).
   */
  maxMcpOutputTokens?: number;
  /**
   * Max Bash command output length in characters.
   * Maps to the downstream env var BASH_MAX_OUTPUT_LENGTH.
   */
  bashMaxOutputLength?: number;
}

/**
 * Runtime configuration section (optional everywhere).
 * Absent = current behavior unchanged.
 */
export interface RuntimeConfig {
  /** Opt-in output-limit overrides for the spawned CLI. */
  outputLimits?: OutputLimitsConfig;
}

/**
 * Downstream env var names that CCS is allowed to write for output limits.
 * Used as the managed-env allowlist for this feature.
 */
export const OUTPUT_LIMITS_ENV_KEYS = {
  maxMcpOutputTokens: 'MAX_MCP_OUTPUT_TOKENS',
  bashMaxOutputLength: 'BASH_MAX_OUTPUT_LENGTH',
} as const;

/**
 * Map an OutputLimitsConfig to downstream env vars.
 *
 * Returns ONLY the keys that are explicitly configured with a finite,
 * non-negative number. Values are emitted as strings (all env values written
 * by CCS must be strings). When the config is undefined/empty, returns an empty
 * object so callers inject nothing and downstream defaults are preserved.
 */
export function buildOutputLimitsEnv(
  outputLimits: OutputLimitsConfig | undefined
): Record<string, string> {
  const env: Record<string, string> = {};
  if (!outputLimits) {
    return env;
  }

  const { maxMcpOutputTokens, bashMaxOutputLength } = outputLimits;

  if (isUsableLimit(maxMcpOutputTokens)) {
    env[OUTPUT_LIMITS_ENV_KEYS.maxMcpOutputTokens] = String(maxMcpOutputTokens);
  }
  if (isUsableLimit(bashMaxOutputLength)) {
    env[OUTPUT_LIMITS_ENV_KEYS.bashMaxOutputLength] = String(bashMaxOutputLength);
  }

  return env;
}

/** A limit is usable only when it is a finite, non-negative number. */
function isUsableLimit(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
