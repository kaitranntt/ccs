/**
 * Safe launch descriptor builder for the native CCS Bar app.
 *
 * The Swift app intentionally distrusts `~/.ccs/bar/launch.json`; it only
 * accepts a regular, non-group-writable/non-world-writable `ccs.js` entrypoint.
 * Bun global installs expose `~/.bun/bin/ccs` as a symlink and the target file
 * can be group/world writable, so the descriptor points at a private shim
 * instead of the package-manager entrypoint.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigError } from '../../errors/error-types';
import { LAUNCH_JSON_SCHEMA } from './bar-paths';
import type { LaunchJson } from './bar-paths';

const SHIM_MODE = 0o700;

export interface LaunchDescriptorOptions {
  entrypointPath?: string;
  runtime?: string;
  home?: string;
  ccsHome?: string;
}

export function getLaunchShimPath(home: string = os.homedir()): string {
  return path.join(home, 'Library', 'Application Support', 'CCS Bar', 'launcher', 'ccs.js');
}

function resolveEntrypoint(entrypointPath?: string): string {
  const candidate = entrypointPath ?? process.argv[1];
  if (!candidate) {
    throw new ConfigError('Unable to resolve the current CCS entrypoint for CCS Bar launch.json.');
  }
  return fs.realpathSync(candidate);
}

export function writeLaunchShim(home: string, entrypointPath?: string): string {
  const resolvedEntrypoint = resolveEntrypoint(entrypointPath);
  const shimPath = getLaunchShimPath(home);
  const shimDir = path.dirname(shimPath);
  const contents = [
    '#!/usr/bin/env node',
    `require(${JSON.stringify(resolvedEntrypoint)});`,
    '',
  ].join('\n');

  fs.mkdirSync(shimDir, { recursive: true, mode: SHIM_MODE });
  fs.writeFileSync(shimPath, contents, { mode: SHIM_MODE });
  fs.chmodSync(shimDir, SHIM_MODE);
  fs.chmodSync(shimPath, SHIM_MODE);

  return shimPath;
}

export function createBarLaunchDescriptor(options: LaunchDescriptorOptions = {}): LaunchJson {
  const home = options.home ?? os.homedir();
  const entrypoint = writeLaunchShim(home, options.entrypointPath);
  const ccsHome = options.ccsHome ?? process.env.CCS_HOME;
  return {
    schema: LAUNCH_JSON_SCHEMA,
    runtime: options.runtime ?? process.execPath,
    args: [entrypoint, 'bar', 'serve'],
    home,
    ...(ccsHome ? { ccsHome } : {}),
  };
}
