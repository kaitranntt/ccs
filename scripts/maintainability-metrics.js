#!/usr/bin/env node

/**
 * Maintainability metrics collector for the CCS CLI maintainability epic.
 *
 * Computes the metrics the epic tracks across phases:
 *   - typed-error adoption (throw new <TypedError> vs throw new Error vs other)
 *   - createLogger coverage by subdomain (which subdomains have zero)
 *   - hotpath console.error / console.warn call-site count (CLI-UX exempt)
 *   - files > 400 / 600 LOC
 *   - typed-error adoption in the P4 LOCKED denominator subdomains
 *
 * Accuracy relies on stripping comments/strings before regex matching. We
 * reuse hardening-inventory.js#stripComments for that. The require is lazy
 * (inside sanitize()) because hardening-inventory.js requires THIS module at
 * its top level; a top-level require back would capture hardening-inventory's
 * partial module.exports during the load cycle (it reassigns module.exports at
 * the bottom). A function-scope require resolves against the fully-loaded
 * module at call time, so the cycle is harmless.
 *
 * Approximate by design (grep-based). Method documented in
 * docs/hardening-debt-burndown.md. Re-baseline when the schema changes.
 */

const fs = require('fs');
const path = require('path');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// CCSError subclasses (src/errors/error-types.ts). A `throw new <OneOfThese>`
// counts as TYPED. `throw new Error(...)` is plain. Any other `throw new X(`
// is "other" (error subclass outside the canonical taxonomy).
const TYPED_ERROR_CLASSES = new Set([
  'CCSError',
  'ConfigError',
  'NetworkError',
  'AuthError',
  'BinaryError',
  'ProviderError',
  'ProfileError',
  'ProxyError',
  'MigrationError',
  'UserAbortError',
  'ValidationError',
  'RetryableError',
]);

// P4 LOCKED denominator: typed-error adoption is measured ONLY over these
// subdomains so the >40% goal cannot be gamed by narrowing scope. Emits both
// numerator and denominator counts alongside the ratio.
const TYPED_ADOPTION_SUBDOMAINS = ['cliproxy/quota', 'cliproxy/auth', 'web-server/routes', 'auth'];

// CLI-UX print surfaces exempt from the hotpath console.error sweep (P3).
// Diagnostics here are legitimate user-facing terminal output, not loggable
// errors, and stay on stdout/stderr via utils/ui.
const CLI_UX_EXEMPT_PREFIXES = ['src/commands/', 'src/management/', 'src/utils/ui/'];

const THROW_NEW_REGEX = /\bthrow\s+new\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const CONSOLE_ERR_WARN_REGEX = /\bconsole\s*\.\s*(?:error|warn)\s*\(/g;
const CREATE_LOGGER_REGEX = /\bcreateLogger\s*\(/;

function sanitize(sourceText) {
  // Lazy require; see module header for the circular-dependency rationale.
  return require('./hardening-inventory.js').stripComments(sourceText);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isTestFile(relPath) {
  return (
    /(?:^|\/)(?:__tests__|tests?)\//.test(relPath) ||
    /\.test\./.test(relPath) ||
    /\.spec\./.test(relPath)
  );
}

function isCliUxExempt(relPath) {
  return CLI_UX_EXEMPT_PREFIXES.some(function (prefix) {
    return relPath.startsWith(prefix);
  });
}

/**
 * Subdomain key for a src-relative path.
 *   src/cliproxy/quota/x.ts -> "cliproxy/quota"
 *   src/auth/x.ts           -> "auth"
 *   src/x.ts                -> "<root>"
 */
function subdomainOf(relPath) {
  const rest = relPath.replace(/^src\//, '');
  const parts = rest.split('/');
  if (parts[0] === 'cliproxy' && parts.length > 2) {
    return parts[0] + '/' + parts[1];
  }
  return parts[0] || '<root>';
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// Items may be file-shaped ({file,count}) or subdomain-shaped ({subdomain,count});
// the tiebreaker key is whichever label field is present.
function labelOf(item) {
  return item.file || item.subdomain || '';
}

function topByCount(items, limit) {
  return items
    .slice()
    .sort(function (a, b) {
      return b.count - a.count || labelOf(a).localeCompare(labelOf(b));
    })
    .slice(0, limit);
}

/** Classify `throw new X(` occurrences in sanitized source. */
function classifyThrows(sourceText) {
  const sanitized = sanitize(sourceText);
  const counts = { typed: 0, plain: 0, other: 0, total: 0 };
  const re = new RegExp(THROW_NEW_REGEX.source, 'g');
  let match;
  while ((match = re.exec(sanitized)) !== null) {
    const identifier = match[1];
    counts.total += 1;
    if (identifier === 'Error') {
      counts.plain += 1;
    } else if (TYPED_ERROR_CLASSES.has(identifier)) {
      counts.typed += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

/** Count console.error / console.warn call sites in sanitized source. */
function countConsoleErrors(sourceText) {
  const sanitized = sanitize(sourceText);
  const re = new RegExp(CONSOLE_ERR_WARN_REGEX.source, 'g');
  return (sanitized.match(re) || []).length;
}

/** True if the file directly creates a logger via createLogger(...). */
function hasCreateLogger(sourceText) {
  return CREATE_LOGGER_REGEX.test(sanitize(sourceText));
}

/** Raw line count of a source file (matches `wc -l` content semantics). */
function countLoc(sourceText) {
  if (!sourceText) return 0;
  const parts = sourceText.split(/\r?\n/);
  return sourceText.endsWith('\n') ? parts.length - 1 : parts.length;
}

function walkFiles(dirPath) {
  const output = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_err) {
    return output;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push.apply(output, walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isSourceFile(fullPath)) output.push(fullPath);
  }
  return output;
}

function emptyAggregates() {
  return {
    typedBySubdomain: {},
    loggerBySubdomain: {},
    hotpathByFile: [],
    hotpathTotal: 0,
    hotpathExempt: 0,
    hotpathNonExempt: 0,
    hotpathFilesAffected: 0,
    filesWithLogger: 0,
    totalSourceFiles: 0,
    typedTotal: 0,
    typedTyped: 0,
    typedPlain: 0,
    typedOther: 0,
    over400: [],
    over600: [],
  };
}

function ensureBucket(obj, key, factory) {
  if (!obj[key]) obj[key] = factory();
  return obj[key];
}

/**
 * Walk <rootDir>/src and aggregate maintainability metrics.
 * Returns the `maintainability` block merged into the hardening inventory.
 */
function collectMaintainabilityMetrics(rootDir) {
  const srcDir = path.join(rootDir, 'src');
  const files = walkFiles(srcDir);
  const agg = emptyAggregates();

  for (const fullPath of files) {
    const relPath = toPosixPath(path.relative(rootDir, fullPath));
    if (isTestFile(relPath)) continue;
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const sub = subdomainOf(relPath);

    const throws = classifyThrows(sourceText);
    agg.typedTotal += throws.total;
    agg.typedTyped += throws.typed;
    agg.typedPlain += throws.plain;
    agg.typedOther += throws.other;
    if (throws.total > 0) {
      const bucket = ensureBucket(agg.typedBySubdomain, sub, function () {
        return { typed: 0, plain: 0, other: 0, total: 0 };
      });
      bucket.typed += throws.typed;
      bucket.plain += throws.plain;
      bucket.other += throws.other;
      bucket.total += throws.total;
    }

    agg.totalSourceFiles += 1;
    const hasLogger = hasCreateLogger(sourceText);
    if (hasLogger) agg.filesWithLogger += 1;
    const lc = ensureBucket(agg.loggerBySubdomain, sub, function () {
      return { files: 0, withLogger: 0 };
    });
    lc.files += 1;
    if (hasLogger) lc.withLogger += 1;

    const ce = countConsoleErrors(sourceText);
    if (ce > 0) {
      agg.hotpathTotal += ce;
      if (isCliUxExempt(relPath)) {
        agg.hotpathExempt += ce;
      } else {
        agg.hotpathNonExempt += ce;
        agg.hotpathFilesAffected += 1;
        agg.hotpathByFile.push({ file: relPath, count: ce });
      }
    }

    const loc = countLoc(sourceText);
    if (loc > 600) agg.over600.push({ file: relPath, loc: loc });
    if (loc > 400) agg.over400.push({ file: relPath, loc: loc });
  }

  const adoptionRatio = agg.typedTotal > 0 ? agg.typedTyped / agg.typedTotal : 0;

  let numerator = 0;
  let denominator = 0;
  for (const sub of TYPED_ADOPTION_SUBDOMAINS) {
    const bucket = agg.typedBySubdomain[sub];
    if (bucket) {
      numerator += bucket.typed;
      denominator += bucket.total;
    }
  }
  const typedAdoptionRatio = denominator > 0 ? numerator / denominator : 0;

  const subdomainsWithZeroCreateLogger = Object.keys(agg.loggerBySubdomain)
    .filter(function (k) {
      return agg.loggerBySubdomain[k].files > 0 && agg.loggerBySubdomain[k].withLogger === 0;
    })
    .sort();

  const topOver400 = agg.over400
    .slice()
    .sort(function (a, b) {
      return b.loc - a.loc || a.file.localeCompare(b.file);
    })
    .slice(0, 15);

  return {
    typedErrors: {
      totalThrows: agg.typedTotal,
      typedThrows: agg.typedTyped,
      plainThrows: agg.typedPlain,
      otherThrows: agg.typedOther,
      adoptionRatio: round4(adoptionRatio),
      topSubdomainsByThrows: topByCount(
        Object.keys(agg.typedBySubdomain).map(function (k) {
          const v = agg.typedBySubdomain[k];
          return { subdomain: k, count: v.total, typed: v.typed, plain: v.plain };
        }),
        10
      ),
    },
    typedErrorAdoption: {
      subdomains: TYPED_ADOPTION_SUBDOMAINS.slice(),
      numerator: numerator,
      denominator: denominator,
      ratio: round4(typedAdoptionRatio),
      targetRatio: 0.4,
    },
    loggerCoverage: {
      filesWithCreateLogger: agg.filesWithLogger,
      totalSourceFiles: agg.totalSourceFiles,
      coverageRatio: round4(
        agg.totalSourceFiles > 0 ? agg.filesWithLogger / agg.totalSourceFiles : 0
      ),
      subdomainsWithZeroCreateLogger: subdomainsWithZeroCreateLogger,
      topSubdomainsByFiles: topByCount(
        Object.keys(agg.loggerBySubdomain).map(function (k) {
          const v = agg.loggerBySubdomain[k];
          return { subdomain: k, count: v.files, withLogger: v.withLogger };
        }),
        10
      ),
    },
    hotpathConsoleErrors: {
      totalOccurrences: agg.hotpathTotal,
      exemptOccurrences: agg.hotpathExempt,
      hotpathOccurrences: agg.hotpathNonExempt,
      filesAffected: agg.hotpathFilesAffected,
      topFiles: topByCount(agg.hotpathByFile, 15),
    },
    largeFiles: {
      countOver400: agg.over400.length,
      countOver600: agg.over600.length,
      topOver400: topOver400,
    },
  };
}

module.exports = {
  collectMaintainabilityMetrics: collectMaintainabilityMetrics,
  classifyThrows: classifyThrows,
  countConsoleErrors: countConsoleErrors,
  hasCreateLogger: hasCreateLogger,
  countLoc: countLoc,
  TYPED_ERROR_CLASSES: TYPED_ERROR_CLASSES,
  TYPED_ADOPTION_SUBDOMAINS: TYPED_ADOPTION_SUBDOMAINS,
};
