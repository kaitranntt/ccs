/**
 * Target Adapter Interface
 *
 * Abstraction layer for different CLI targets (Claude, Droid, etc.).
 * Profile resolution is target-agnostic — only the "last mile" execution differs.
 */

/**
 * Supported CLI target types.
 * 'claude' is the default; additional targets register via target-registry.
 */
import type { ProfileType } from '../types/profile';

export type TargetType = 'claude' | 'droid' | 'codex';

/**
 * Credentials resolved by CCS profile system, ready for delivery to target CLI.
 */
export interface TargetCredentials {
  /** CCS profile name (e.g., 'gemini', 'codex', 'glm') */
  profile: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'generic-chat-completion-api';
  /**
   * Runtime reasoning/thinking override resolved from CCS flags/env
   * (e.g. --thinking high, --effort xhigh, CCS_THINKING=medium).
   * Targets may ignore this when unsupported.
   */
  reasoningOverride?: string | number;
  /** Additional env vars from profile resolution (websearch, hooks, etc.) */
  envVars?: NodeJS.ProcessEnv;
}

/**
 * Result of detecting a target CLI binary on the system.
 */
export interface TargetBinaryInfo {
  path: string;
  needsShell: boolean; // Windows .cmd/.bat/.ps1
  version?: string;
  features?: readonly string[];
}

/**
 * Target adapter contract.
 *
 * Each target CLI implements this interface to handle:
 * - Binary detection (is the CLI installed?)
 * - Credential delivery (env vars vs config file writes)
 * - Argument building (target-specific flags)
 * - Process spawning (cross-platform execution)
 */
export interface TargetAdapter {
  readonly type: TargetType;
  readonly displayName: string;

  /**
   * Resolve the target CLI executable on the current machine.
   * Return `null` when the binary is unavailable.
   */
  detectBinary(): TargetBinaryInfo | null;

  /**
   * Prepare credential delivery for the target.
   * Targets may write config files, mutate process state, or no-op.
   *
   * @throws Error when required credentials are missing or invalid.
   */
  prepareCredentials(creds: TargetCredentials): Promise<void>;

  /**
   * Build target-specific argument vector.
   * `userArgs` are the arguments after CCS profile/flag parsing.
   */
  buildArgs(
    profile: string,
    userArgs: string[],
    options?: {
      creds?: TargetCredentials;
      profileType?: ProfileType;
      binaryInfo?: TargetBinaryInfo;
    }
  ): string[];

  /**
   * Build environment variables for process spawn.
   * `profileType` allows targets to vary env behavior by CCS profile mode.
   */
  buildEnv(creds: TargetCredentials, profileType: ProfileType): NodeJS.ProcessEnv;

  /**
   * Spawn and hand over execution to the target CLI process.
   * Implementations are responsible for signal forwarding and exit propagation.
   *
   * @throws Error for unrecoverable launch failures (if not exiting directly).
   */
  exec(
    args: string[],
    env: NodeJS.ProcessEnv,
    options?: { cwd?: string; binaryInfo?: TargetBinaryInfo }
  ): void;

  /**
   * Report whether this target can run a given CCS profile type.
   */
  supportsProfileType(profileType: ProfileType): boolean;
}
