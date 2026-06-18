/**
 * shared-manager.ts - public barrel for the SharedManager module.
 *
 * Originally a 1631-line god file; split into focused submodules under
 * ./shared-manager/. This file re-exports the full original public surface
 * so consumers importing from 'shared-manager' (and from the
 * 'management/index' re-export) continue to resolve unchanged:
 *
 *   - default export: SharedManager class (now a thin orchestrator)
 *   - named exports: normalizePluginMetadataContent,
 *                    normalizePluginMetadataPathString
 *
 * No logic lives in this file. Add new behavior to the appropriate
 * submodule under ./shared-manager/.
 */

export { default } from './shared-manager/orchestrator';
export {
  normalizePluginMetadataContent,
  normalizePluginMetadataPathString,
} from './plugin-path-normalizer';
