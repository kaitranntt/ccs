/**
 * Bun global manifest diagnostics used by `ccs update`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CurrentInstall } from './package-manager-detector';

export interface GlobalManifestIssue {
  manifestPath: string;
  invalidNames: string[];
}

// Loose npm package-name shape: optional scope, no leading dot, no path separators.
const VALID_DEPENDENCY_NAME = /^(@[^/\s.][^/\s]*\/)?[^/\\\s.][^/\\\s]*$/;

/**
 * Detect invalid dependency names in bun's global manifest. Entries such as
 * `"": "."` (left behind by `bun add -g .` or `bun link`) make every later
 * `bun add -g` exit non-zero with "refusing to install dependency with unsafe name".
 */
export function findGlobalManifestIssues(
  currentInstall: CurrentInstall,
  env: NodeJS.ProcessEnv
): GlobalManifestIssue | null {
  if (currentInstall.manager !== 'bun') {
    return null;
  }

  const bunInstall = env.BUN_INSTALL || path.join(os.homedir(), '.bun');
  const manifestPath = path.join(bunInstall, 'install', 'global', 'package.json');

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, unknown>;
    };
    const invalidNames = Object.keys(manifest.dependencies ?? {}).filter(
      (name) => !VALID_DEPENDENCY_NAME.test(name)
    );
    return invalidNames.length > 0 ? { manifestPath, invalidNames } : null;
  } catch {
    return null;
  }
}
