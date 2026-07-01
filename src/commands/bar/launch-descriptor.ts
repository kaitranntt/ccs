/**
 * Safe launch descriptor builder for the native CCS Bar app.
 *
 * The Swift app intentionally distrusts `~/.ccs/bar/launch.json`; it only
 * accepts a regular, non-group-writable/non-world-writable `ccs.js` entrypoint.
 * Bun global installs expose `~/.bun/bin/ccs` as a symlink and the target file
 * can be group/world writable, so the descriptor points at a private shim
 * instead of the package-manager entrypoint.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigError } from '../../errors/error-types';
import { LAUNCH_JSON_SCHEMA } from './bar-paths';
import type { LaunchJson } from './bar-paths';

const SHIM_MODE = 0o700;

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

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
  const expectedEntrypointHash = sha256File(resolvedEntrypoint);
  const shimPath = getLaunchShimPath(home);
  const shimDir = path.dirname(shimPath);
  const contents = [
    '#!/usr/bin/env node',
    "const crypto = require('crypto');",
    "const fs = require('fs');",
    "const Module = require('module');",
    "const path = require('path');",
    `const expectedEntrypoint = ${JSON.stringify(resolvedEntrypoint)};`,
    `const expectedHash = ${JSON.stringify(expectedEntrypointHash)};`,
    'const resolvedEntrypoint = fs.realpathSync(expectedEntrypoint);',
    "if (resolvedEntrypoint !== expectedEntrypoint) throw new Error('CCS Bar launch shim target changed. Run `ccs bar launch` to refresh launch.json.');",
    'const entrypointStat = fs.statSync(resolvedEntrypoint);',
    "if (!entrypointStat.isFile()) throw new Error('CCS Bar launch shim target is not a regular file.');",
    'const source = fs.readFileSync(resolvedEntrypoint);',
    "const actualHash = crypto.createHash('sha256').update(source).digest('hex');",
    "if (actualHash !== expectedHash) throw new Error('CCS Bar launch shim target changed. Run `ccs bar launch` to refresh launch.json.');",
    'const targetModule = new Module(resolvedEntrypoint, module);',
    'targetModule.filename = resolvedEntrypoint;',
    'targetModule.paths = Module._nodeModulePaths(path.dirname(resolvedEntrypoint));',
    'require.cache[resolvedEntrypoint] = targetModule;',
    "targetModule._compile(source.toString('utf8'), resolvedEntrypoint);",
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
