/**
 * Barrel for the Gemini CLI quota fetcher submodule.
 *
 * Re-exports the original public surface of `quota-fetcher-gemini-cli.ts`
 * so the file at the original path can be reduced to a thin re-export
 * (preserving import paths and signatures). Submodules are private
 * implementation detail; only the symbols below are part of the contract.
 */

// Public API
export { fetchGeminiCliQuota, fetchAllGeminiCliQuotas } from './quota-fetcher';

// Exported helpers (also part of the public surface - used by tests and
// the bucket/grouping normalization tests).
export { resolveGeminiCliProjectId } from './token-parsing';
export { buildGeminiCliBuckets } from './bucket-building';

// Test exports: keep the original `__testExports` bag shape stable so the
// existing test suite (which destructures `__testExports`) keeps working.
export {
  sanitizeGeminiCliErrorDetail,
  extractGeminiCliNestedMessage,
  parseGeminiCliErrorBody,
  buildGeminiCliForbiddenActionHint,
} from './error-parsing';

// Re-export `__testExports` as a single object to preserve the original
// named-const export shape (`__testExports`).
import {
  sanitizeGeminiCliErrorDetail,
  extractGeminiCliNestedMessage,
  parseGeminiCliErrorBody,
  buildGeminiCliForbiddenActionHint,
} from './error-parsing';

export const __testExports = {
  sanitizeGeminiCliErrorDetail,
  extractGeminiCliNestedMessage,
  parseGeminiCliErrorBody,
  buildGeminiCliForbiddenActionHint,
};
