#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { collectMaintainabilityMetrics } = require('./maintainability-metrics.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const REPORT_DIR = path.join(ROOT_DIR, 'docs', 'reports');
const JSON_REPORT_PATH = path.join(REPORT_DIR, 'hardening-inventory.json');
const MD_REPORT_PATH = path.join(REPORT_DIR, 'hardening-inventory.md');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const HOTPATH_PATTERNS = [
  /^src\/web-server\//,
  /^src\/commands\//,
  /^src\/cliproxy\//,
  /^src\/management\//,
  /^src\/auth\//,
  /^src\/delegation\//,
  /^src\/utils\//,
  /^src\/ccs\.ts$/,
];

const SYNC_CALL_NAMES = [
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'closeSync',
  'copyFileSync',
  'cpSync',
  'existsSync',
  'fstatSync',
  'fsyncSync',
  'ftruncateSync',
  'futimesSync',
  'lchmodSync',
  'lchownSync',
  'linkSync',
  'lstatSync',
  'mkdirSync',
  'mkdtempSync',
  'openSync',
  'opendirSync',
  'readFileSync',
  'readdirSync',
  'readlinkSync',
  'readSync',
  'readvSync',
  'realpathSync',
  'renameSync',
  'rmSync',
  'rmdirSync',
  'statSync',
  'symlinkSync',
  'truncateSync',
  'unlinkSync',
  'utimesSync',
  'writeFileSync',
  'writeSync',
  'writevSync',
];
const SYNC_CALL_CAPTURE_REGEX = new RegExp(
  `(?:\\bfs(?:\\s*\\?\\.)?\\s*\\.\\s*|(?<![\\w$.]))(${SYNC_CALL_NAMES.join('|')})\\s*\\(`,
  'g'
);
const LEGACY_MARKER_REGEX =
  /(?:\blegacy\b|\bshim\b|backward compatibility|backwards compatibility|compatibility layer|deprecated.*re-export|re-export.*compatibility)/i;
const REGEX_LITERAL_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'else',
  'do',
  'delete',
  'void',
  'typeof',
  'instanceof',
  'in',
  'of',
  'yield',
  'await',
  'new',
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toPosixPath(path.relative(ROOT_DIR, filePath));
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isHotpath(filePath) {
  return HOTPATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function walkFiles(dirPath) {
  const output = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && isSourceFile(fullPath)) {
      output.push(fullPath);
    }
  }

  return output;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function sortByCountDesc(items) {
  return [...items].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.file.localeCompare(b.file);
  });
}

function summarize(items, limit = 10) {
  return sortByCountDesc(items)
    .slice(0, limit)
    .map((item) => ({
      file: item.file,
      count: item.count,
      calls: uniqueSorted(item.calls || []),
      markers: uniqueSorted(item.markers || []),
    }));
}

function isRegexLiteralStart(previousSignificantChar, previousIdentifier) {
  return (
    previousSignificantChar === '' ||
    '([{:;,=!?+-*%^&|~<>'.includes(previousSignificantChar) ||
    REGEX_LITERAL_KEYWORDS.has(previousIdentifier)
  );
}

function stripComments(sourceText) {
  let output = '';
  let index = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateLiteral = false;
  let inRegexLiteral = false;
  let inRegexCharClass = false;
  let previousSignificantChar = '';
  let previousIdentifier = '';

  while (index < sourceText.length) {
    const current = sourceText[index];
    const next = sourceText[index + 1];

    if (inLineComment) {
      if (current === '\n' || current === '\r') {
        inLineComment = false;
        output += current;
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        output += '  ';
        index += 2;
        inBlockComment = false;
        continue;
      }

      output += current === '\n' || current === '\r' ? current : ' ';
      index += 1;
      continue;
    }

    if (inRegexLiteral) {
      if (current === '\n' || current === '\r') {
        output += current;
        index += 1;
        inRegexLiteral = false;
        inRegexCharClass = false;
        continue;
      }

      output += ' ';

      if (current === '\\') {
        output += next === '\n' || next === '\r' ? next : ' ';
        index += 2;
        continue;
      }

      if (!inRegexCharClass && current === '[') {
        inRegexCharClass = true;
        index += 1;
        continue;
      }

      if (inRegexCharClass && current === ']') {
        inRegexCharClass = false;
        index += 1;
        continue;
      }

      if (!inRegexCharClass && current === '/') {
        index += 1;
        while (index < sourceText.length && /[a-z]/i.test(sourceText[index])) {
          output += ' ';
          index += 1;
        }
        inRegexLiteral = false;
        previousSignificantChar = 'r';
        previousIdentifier = '';
        continue;
      }

      index += 1;
      continue;
    }

    if (inSingleQuote) {
      output += current === '\n' || current === '\r' ? current : ' ';
      if (current === '\\') {
        output += next === '\n' || next === '\r' ? next : ' ';
        index += 2;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
        previousSignificantChar = 's';
        previousIdentifier = '';
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      output += current === '\n' || current === '\r' ? current : ' ';
      if (current === '\\') {
        output += next === '\n' || next === '\r' ? next : ' ';
        index += 2;
        continue;
      }
      if (current === '"') {
        inDoubleQuote = false;
        previousSignificantChar = 's';
        previousIdentifier = '';
      }
      index += 1;
      continue;
    }

    if (inTemplateLiteral) {
      output += current === '\n' || current === '\r' ? current : ' ';
      if (current === '\\') {
        output += next === '\n' || next === '\r' ? next : ' ';
        index += 2;
        continue;
      }
      if (current === '`') {
        inTemplateLiteral = false;
        previousSignificantChar = 's';
        previousIdentifier = '';
      }
      index += 1;
      continue;
    }

    if (current === '/' && next === '/') {
      output += '  ';
      index += 2;
      inLineComment = true;
      continue;
    }

    if (current === '/' && next === '*') {
      output += '  ';
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (current === '/' && isRegexLiteralStart(previousSignificantChar, previousIdentifier)) {
      output += ' ';
      index += 1;
      inRegexLiteral = true;
      inRegexCharClass = false;
      continue;
    }

    if (/[A-Za-z_$]/.test(current)) {
      let tokenEnd = index + 1;
      while (tokenEnd < sourceText.length && /[A-Za-z0-9_$]/.test(sourceText[tokenEnd])) {
        tokenEnd += 1;
      }
      const token = sourceText.slice(index, tokenEnd);
      output += token;
      previousSignificantChar = 'i';
      previousIdentifier = token;
      index = tokenEnd;
      continue;
    }

    if (current === "'") {
      inSingleQuote = true;
      output += ' ';
      index += 1;
      continue;
    }

    if (current === '"') {
      inDoubleQuote = true;
      output += ' ';
      index += 1;
      continue;
    }

    if (current === '`') {
      inTemplateLiteral = true;
      output += ' ';
      index += 1;
      continue;
    }

    output += current;
    if (!/\s/.test(current)) {
      previousSignificantChar = current;
      previousIdentifier = '';
    }
    index += 1;
  }

  return output;
}

function collectSyncCallSites(sourceText) {
  const sanitizedSource = stripComments(sourceText);
  const captureRegex = new RegExp(SYNC_CALL_CAPTURE_REGEX.source, SYNC_CALL_CAPTURE_REGEX.flags);
  const calls = [];

  for (const match of sanitizedSource.matchAll(captureRegex)) {
    calls.push(match[1]);
  }

  return {
    count: calls.length,
    calls,
  };
}

function buildReport() {
  const files = walkFiles(SRC_DIR);
  const syncEntries = [];
  const legacyEntries = [];

  for (const fullPath of files) {
    const file = relativePath(fullPath);
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const lines = sourceText.split(/\r?\n/);
    const { count: syncCount, calls: syncCalls } = collectSyncCallSites(sourceText);
    let legacyCount = 0;
    const legacyMarkers = [];

    for (const line of lines) {
      if (LEGACY_MARKER_REGEX.test(line)) {
        legacyCount += 1;
        const normalized = line.trim();
        if (normalized.length > 0) {
          legacyMarkers.push(normalized);
        }
      }
    }

    if (syncCount > 0) {
      syncEntries.push({
        file,
        count: syncCount,
        calls: syncCalls,
        hotpath: isHotpath(file),
      });
    }

    if (legacyCount > 0) {
      legacyEntries.push({
        file,
        count: legacyCount,
        markers: legacyMarkers,
      });
    }
  }

  const syncHotpathEntries = syncEntries.filter((entry) => entry.hotpath);
  const totalSyncCount = syncEntries.reduce((acc, entry) => acc + entry.count, 0);
  const totalSyncHotpathCount = syncHotpathEntries.reduce((acc, entry) => acc + entry.count, 0);
  const totalLegacyMarkers = legacyEntries.reduce((acc, entry) => acc + entry.count, 0);

  return {
    scope: 'src/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    syncFs: {
      totalOccurrences: totalSyncCount,
      filesAffected: syncEntries.length,
      hotpathOccurrences: totalSyncHotpathCount,
      hotpathFilesAffected: syncHotpathEntries.length,
      topHotpathFiles: summarize(syncHotpathEntries),
      topFilesOverall: summarize(syncEntries),
    },
    legacyShim: {
      totalMarkers: totalLegacyMarkers,
      filesAffected: legacyEntries.length,
      topFiles: summarize(legacyEntries),
      explicitShimFiles: uniqueSorted(
        legacyEntries
          .map((entry) => entry.file)
          .filter((file) => /shim|re-export|compat/i.test(path.basename(file)))
      ),
    },
    maintainability: collectMaintainabilityMetrics(ROOT_DIR),
  };
}

function renderMarkdown(report) {
  const lines = [];

  lines.push('# Hardening Inventory Report');
  lines.push('');
  lines.push(`Scope: \`${report.scope}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Sync fs occurrences (all) | ${report.syncFs.totalOccurrences} |`);
  lines.push(`| Sync fs files affected (all) | ${report.syncFs.filesAffected} |`);
  lines.push(`| Sync fs occurrences (runtime hotpaths) | ${report.syncFs.hotpathOccurrences} |`);
  lines.push(`| Sync fs files affected (runtime hotpaths) | ${report.syncFs.hotpathFilesAffected} |`);
  lines.push(`| Legacy shim markers | ${report.legacyShim.totalMarkers} |`);
  lines.push(`| Legacy shim files affected | ${report.legacyShim.filesAffected} |`);
  lines.push('');

  lines.push('## Top Runtime Hotpath Sync fs Files');
  lines.push('');
  lines.push('| File | Sync Calls | API Names |');
  lines.push('|---|---:|---|');

  for (const item of report.syncFs.topHotpathFiles) {
    lines.push(`| \`${item.file}\` | ${item.count} | ${item.calls.join(', ')} |`);
  }

  if (report.syncFs.topHotpathFiles.length === 0) {
    lines.push('| _none_ | 0 | - |');
  }

  lines.push('');
  lines.push('## Top Legacy Shim Marker Files');
  lines.push('');
  lines.push('| File | Marker Count |');
  lines.push('|---|---:|');

  for (const item of report.legacyShim.topFiles) {
    lines.push(`| \`${item.file}\` | ${item.count} |`);
  }

  if (report.legacyShim.topFiles.length === 0) {
    lines.push('| _none_ | 0 |');
  }

  lines.push('');
  lines.push('## Explicit Shim/Re-export Files');
  lines.push('');
  for (const file of report.legacyShim.explicitShimFiles) {
    lines.push(`- \`${file}\``);
  }
  if (report.legacyShim.explicitShimFiles.length === 0) {
    lines.push('- _none_');
  }

  const m = report.maintainability;
  if (m) {
    lines.push('## Maintainability Metrics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---:|');
    lines.push(
      `| typed-error adoption (typed/total throws) | ${(m.typedErrors.adoptionRatio * 100).toFixed(1)}% (${m.typedErrors.typedThrows}/${m.typedErrors.totalThrows}) |`
    );
    lines.push(
      `| typed-error adoption (P4 locked subdomains) | ${(m.typedErrorAdoption.ratio * 100).toFixed(1)}% (${m.typedErrorAdoption.numerator}/${m.typedErrorAdoption.denominator}), target 40% |`
    );
    lines.push(
      `| hotpath console.error/warn occurrences | ${m.hotpathConsoleErrors.hotpathOccurrences} (${m.hotpathConsoleErrors.totalOccurrences} total, ${m.hotpathConsoleErrors.exemptOccurrences} CLI-UX exempt) |`
    );
    lines.push(`| hotpath console.error/warn files | ${m.hotpathConsoleErrors.filesAffected} |`);
    lines.push(
      `| files with createLogger | ${m.loggerCoverage.filesWithCreateLogger}/${m.loggerCoverage.totalSourceFiles} |`
    );
    lines.push(
      `| subdomains with zero createLogger | ${m.loggerCoverage.subdomainsWithZeroCreateLogger.length} (${m.loggerCoverage.subdomainsWithZeroCreateLogger.join(', ') || 'none'}) |`
    );
    lines.push(`| files > 400 LOC | ${m.largeFiles.countOver400} |`);
    lines.push(`| files > 600 LOC | ${m.largeFiles.countOver600} |`);
    lines.push('');
    lines.push('### Top Hotpath console.error/warn Files');
    lines.push('');
    lines.push('| File | console.error/warn |');
    lines.push('|---|---:|');
    for (const item of m.hotpathConsoleErrors.topFiles) {
      lines.push(`| \`${item.file}\` | ${item.count} |`);
    }
    if (m.hotpathConsoleErrors.topFiles.length === 0) {
      lines.push('| _none_ | 0 |');
    }
    lines.push('');
    lines.push('### Files > 400 LOC (top 15)');
    lines.push('');
    lines.push('| File | LOC |');
    lines.push('|---|---:|');
    for (const item of m.largeFiles.topOver400) {
      lines.push(`| \`${item.file}\` | ${item.loc} |`);
    }
    if (m.largeFiles.topOver400.length === 0) {
      lines.push('| _none_ | 0 |');
    }
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const report = buildReport();

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(MD_REPORT_PATH, renderMarkdown(report), 'utf8');

  const relJson = relativePath(JSON_REPORT_PATH);
  const relMd = relativePath(MD_REPORT_PATH);

  console.log(`[hardening-inventory] generatedAt=${new Date().toISOString()}`);
  console.log(
    `[hardening-inventory] sync-fs total=${report.syncFs.totalOccurrences}, hotpath=${report.syncFs.hotpathOccurrences}`
  );
  console.log(
    `[hardening-inventory] legacy markers total=${report.legacyShim.totalMarkers}, files=${report.legacyShim.filesAffected}`
  );
  if (report.maintainability) {
    const mt = report.maintainability;
    console.log(
      `[hardening-inventory] maintainability: typed-adoption=${(mt.typedErrors.adoptionRatio * 100).toFixed(1)}% (${mt.typedErrors.typedThrows}/${mt.typedErrors.totalThrows}), locked=${(mt.typedErrorAdoption.ratio * 100).toFixed(1)}% (${mt.typedErrorAdoption.numerator}/${mt.typedErrorAdoption.denominator}), console.error=${mt.hotpathConsoleErrors.hotpathOccurrences}, zero-logger-subdomains=${mt.loggerCoverage.subdomainsWithZeroCreateLogger.length}, >400LOC=${mt.largeFiles.countOver400}`
    );
  }
  console.log(`[hardening-inventory] wrote ${relJson}`);
  console.log(`[hardening-inventory] wrote ${relMd}`);
}

module.exports = {
  buildReport,
  collectSyncCallSites,
  renderMarkdown,
  stripComments,
};

if (require.main === module) {
  main();
}
