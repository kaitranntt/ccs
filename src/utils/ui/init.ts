/**
 * UI Initialization
 *
 * Handles lazy loading of ESM dependencies
 * @module utils/ui/init
 */

import { moduleCache, initialized, setInitialized } from './types';

/**
 * Native dynamic import that bypasses TypeScript's require() transformation.
 * This preserves ESM import() at runtime, fixing Node 24 ESM/CJS interop issues.
 *
 * TypeScript compiles `import('x')` to `require('x')` when targeting CommonJS,
 * which breaks ESM packages like ora that depend on other ESM-only modules.
 */

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<unknown>;

/**
 * Initialize UI dependencies (call once at startup)
 * Uses native dynamic imports for ESM packages in CommonJS project
 */
export async function initUI(): Promise<void> {
  if (initialized) return;

  try {
    // Use native dynamic import to avoid TypeScript's require() transformation
    const [chalkImport, boxenImport, gradientImport, oraImport, listrImport] = await Promise.all([
      dynamicImport('chalk'),
      dynamicImport('boxen'),
      dynamicImport('gradient-string'),
      dynamicImport('ora'),
      dynamicImport('listr2'),
    ]);

    // ESM modules: use .default for the actual export
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getDefault = (mod: any) => mod.default || mod;

    moduleCache.chalk = getDefault(chalkImport);
    moduleCache.boxen = getDefault(boxenImport);
    moduleCache.gradient = getDefault(gradientImport);
    moduleCache.ora = getDefault(oraImport);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listr = listrImport as any;
    moduleCache.listr = listr.Listr || listr.default?.Listr;
    setInitialized(true);
  } catch (_e) {
    // Fallback: UI works without colors if imports fail
    console.error('[!] UI initialization failed, using plain text mode');
    setInitialized(true);
  }
}

/**
 * Check if colors should be used
 * Respects NO_COLOR and FORCE_COLOR environment variables
 */
export function useColors(): boolean {
  // NO_COLOR takes precedence over FORCE_COLOR (https://no-color.org/)
  if (process.env.NO_COLOR) return false;
  // FORCE_COLOR enables colors even without TTY
  if (process.env.FORCE_COLOR) return true;
  // Otherwise, check if TTY
  return !!process.stdout.isTTY;
}

/**
 * Check if interactive mode (TTY + not CI)
 */
export function isInteractive(): boolean {
  return !!process.stdout.isTTY && !process.env.CI && !process.env.NO_COLOR;
}

/**
 * Detect if running inside Claude Code tool context
 *
 * Heuristics:
 * - No TTY (stdout captured)
 * - CI-like environment
 * - CLAUDE_CODE env var set
 */
export function isClaudeCodeContext(): boolean {
  return (
    !process.stdout.isTTY ||
    !!process.env.CI ||
    !!process.env.CLAUDE_CODE ||
    process.env.TERM === 'dumb'
  );
}
