/**
 * Custom ESLint rule: disallow `throw new Error(...)` outside a baseline allowlist.
 *
 * P7 enforcement gate. Forces new error sites to use the typed-error taxonomy
 * (src/errors/error-types.ts: AuthError, ConfigError, ProfileError, ProviderError,
 * ...) so handleError emits differentiated exit codes. Existing ~400 sites are
 * grandfathered via a generated baseline (scripts/generate-throw-error-baseline.js
 * -> eslint-rules/throw-error-baseline.json); only NEW violations are reported.
 *
 * Detects `throw new Error(...)` (NewExpression with callee name 'Error').
 * Typed subclasses (throw new ConfigError(...)) and re-throws are allowed.
 *
 * Option: { allowlist: string[] } — entries are `${relativePath}:${line}` keys.
 * The relative path matches ESLint's context filename (relative to the repo root
 * when eslint is invoked from the root). Line drift after edits above an
 * allowlisted site causes a false positive until the baseline is regenerated;
 * quarterly pruning keeps it accurate.
 */

'use strict';

const path = require('path');

function isNewErrorExpression(node) {
  return (
    node !== null &&
    node !== undefined &&
    node.type === 'NewExpression' &&
    node.callee !== null &&
    node.callee !== undefined &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Error'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow throw new Error(...) outside the baseline; use a typed error from src/errors/error-types.ts.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpected:
        "Unexpected throw new Error(...). Use a typed error from src/errors/error-types.ts (AuthError, ConfigError, ProfileError, ProviderError, ...) so handleError emits a differentiated exit code, or regenerate the baseline via 'node scripts/generate-throw-error-baseline.js'.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowlist = new Set(options.allowlist || []);

    return {
      ThrowStatement(node) {
        if (!isNewErrorExpression(node.argument)) {
          return;
        }
        const filename = context.getFilename();
        // Normalize to a repo-root-relative path so the baseline keys (which are
        // relative, e.g. 'src/auth/profile-registry.ts') match regardless of
        // whether ESLint reports an absolute or relative filename.
        const normalized = path.isAbsolute(filename)
          ? path.relative(process.cwd(), filename)
          : filename;
        const line = node.loc && node.loc.start ? node.loc.start.line : -1;
        const key = `${normalized}:${line}`;
        if (allowlist.has(key)) {
          return;
        }
        context.report({ node, messageId: 'unexpected' });
      },
    };
  },
};
