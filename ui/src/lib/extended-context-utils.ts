/**
 * Extended Context Utilities
 * Shared utilities for extended context (1M token window) feature.
 */

/** The suffix that enables 1M token context in Claude Code */
export const EXTENDED_CONTEXT_SUFFIX = '[1m]';

/**
 * Check if model is a native Gemini model (auto-enabled behavior).
 * Native Gemini models have the gemini-* prefix.
 *
 * NOTE: This function is intentionally duplicated from src/cliproxy/model-catalog.ts
 * to avoid bundling backend code in the UI. Keep both in sync.
 */
export function isNativeGeminiModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('gemini-');
}

/**
 * Check if model string already has [1m] suffix
 */
export function hasExtendedContextSuffix(model: string): boolean {
  return model.toLowerCase().endsWith(EXTENDED_CONTEXT_SUFFIX.toLowerCase());
}

/**
 * Apply [1m] suffix to model string if not already present
 */
export function applyExtendedContextSuffix(model: string): string {
  if (!model) return model;
  if (hasExtendedContextSuffix(model)) return model;
  return `${model}${EXTENDED_CONTEXT_SUFFIX}`;
}

/**
 * Strip [1m] suffix from model string
 */
export function stripExtendedContextSuffix(model: string): string {
  if (!model) return model;
  if (hasExtendedContextSuffix(model)) {
    return model.slice(0, -EXTENDED_CONTEXT_SUFFIX.length);
  }
  return model;
}
