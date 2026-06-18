#!/usr/bin/env node

/**
 * Generate the baseline allowlist for eslint-rules/no-new-throw-error.js.
 *
 * Walks src/ (non-test), finds every `throw new Error(...)` site using the same
 * comment-stripping as scripts/maintainability-metrics.js (so the baseline
 * matches what the ESLint AST sees — comments are not ThrowStatement nodes),
 * and writes eslint-rules/throw-error-baseline.json as a sorted array of
 * `${relativePath}:${line}` keys.
 *
 * Run after intentionally adding a new grandfathered throw, or quarterly to
 * prune entries that have since been converted to typed errors.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const OUTPUT_PATH = path.join(ROOT_DIR, 'eslint-rules', 'throw-error-baseline.json');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const THROW_NEW_ERROR_REGEX = /\bthrow\s+new\s+Error\s*\(/g;

function isTestPath(relPath) {
  return (
    /(?:^|\/)(?:__tests__|tests?)\//.test(relPath) ||
    /\.test\./.test(relPath) ||
    /\.spec\./.test(relPath)
  );
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function relPath(fullPath) {
  return toPosix(path.relative(ROOT_DIR, fullPath));
}

// Lazy require: hardening-inventory.js requires this module's sibling maintainability-metrics.js
// at top level; requiring it back at top level here would capture a partial module.exports.
// A function-scope require resolves against the fully-loaded module at call time.
function stripCommentsOnce(sourceText) {
  return require('./hardening-inventory.js').stripComments(sourceText);
}

function walkFiles(dirPath) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push.apply(out, walkFiles(full));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function collectSites() {
  const sites = [];
  for (const full of walkFiles(SRC_DIR)) {
    const rel = relPath(full);
    if (isTestPath(rel)) continue;
    // Match on the RAW source (not comment-stripped). ESLint lints the raw
    // file, so the baseline must reflect real throw lines as the AST sees them.
    // stripComments can undercount on files whose regex/template literals confuse
    // its state machine; raw matching is a superset (may include comment/string
    // mentions, which are harmless unused allowlist entries) and never undercounts.
    const sourceText = fs.readFileSync(full, 'utf8');
    const re = new RegExp(THROW_NEW_ERROR_REGEX.source, 'g');
    let match;
    while ((match = re.exec(sourceText)) !== null) {
      const line = sourceText.slice(0, match.index).split(/\r?\n/).length;
      sites.push(`${rel}:${line}`);
    }
  }
  return sites.sort();
}

function main() {
  const sites = collectSites();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sites, null, 2) + '\n', 'utf8');
  console.log(`[throw-error-baseline] ${sites.length} sites -> ${relPath(OUTPUT_PATH)}`);
}

if (require.main === module) {
  main();
}

module.exports = { collectSites, OUTPUT_PATH };
