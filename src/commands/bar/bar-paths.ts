/**
 * Shared path helpers for the `ccs bar` command family.
 *
 * Centralises the paths under ~/.ccs/bar/ so every subcommand stays DRY.
 * All paths derive from ccsDir (i.e. getCcsDir()) so CCS_HOME isolation
 * works correctly in tests.
 */

import * as path from 'path';

/** launch.json — consumed by the Swift app to spawn the server without a shell PATH. */
export function getLaunchJsonPath(ccsDir: string): string {
  return path.join(ccsDir, 'bar', 'launch.json');
}

/** server.pid — PID of the live detached server process. */
export function getServerPidPath(ccsDir: string): string {
  return path.join(ccsDir, 'bar', 'server.pid');
}

/** serve.log — stdout/stderr of the detached server process. */
export function getServeLogPath(ccsDir: string): string {
  return path.join(ccsDir, 'bar', 'serve.log');
}

/** bar.json — live discovery file consumed by the Swift app. */
export function getBarJsonPath(ccsDir: string): string {
  return path.join(ccsDir, 'bar.json');
}

/** bar/ subdirectory (parent of all bar artefacts). */
export function getBarDir(ccsDir: string): string {
  return path.join(ccsDir, 'bar');
}

/** Schema version constant for launch.json. */
export const LAUNCH_JSON_SCHEMA = 1;

/** Shape of launch.json written by install and refreshed by launch. */
export interface LaunchJson {
  schema: typeof LAUNCH_JSON_SCHEMA;
  /** Absolute path to the node/bun binary (process.execPath). */
  runtime: string;
  /** Absolute private CCS launcher shim + subcommand args: [ccs.js, 'bar', 'serve']. */
  args: string[];
  /** os.homedir() — cwd for the spawned server. */
  home: string;
  /** CCS_HOME env value when set; omitted otherwise. */
  ccsHome?: string;
}
