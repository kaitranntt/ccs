#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(relativePath, expected) {
  if (!read(relativePath).includes(expected)) {
    failures.push(`${relativePath} is missing: ${expected}`);
  }
}

function collectFiles(directory, filePattern) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, filePattern));
    } else if (entry.isFile() && filePattern.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

const removedGuides = [
  'docs/ccs-bar.md',
  'docs/cursor-integration.md',
  'docs/dashboard-auth-cli.md',
  'docs/session-sharing-technical-analysis.md',
];

for (const relativePath of removedGuides) {
  if (fs.existsSync(path.join(root, relativePath))) {
    failures.push(`${relativePath} should use its canonical public-doc replacement`);
  }
}

requireText('README.md', 'https://docs.ccs.kaitran.ca/features/proxy/openai-compatible-providers');
requireText('README.md', 'https://docs.ccs.kaitran.ca/features/workflow/browser-automation');
requireText('docs/browser-automation.md', 'CCS_BROWSER_INTERCEPT_FULFILL_MODE=enabled');
requireText('docs/browser-automation.md', 'CCS_BROWSER_UPLOAD_ROOTS');
requireText('docs/browser-automation.md', 'CCS_BROWSER_DOWNLOAD_ROOTS');
requireText('docs/browser-automation.md', 'browser_wait_for_event');
requireText('docs/browser-automation.md', 'path-scoped bearer values');
requireText('docs/codex-auth.md', 'src/codex-auth/codex-auth-help.ts');
requireText('docs/codex-auth.md', 'CCSXP_CODEX_HOME');
requireText('docs/image-analysis.md', 'https://docs.ccs.kaitran.ca/features/ai/image-analysis');
requireText('docs/openai-compatible-providers.md', 'CCS_OPENAI_PROXY_INSECURE');
requireText('docs/openai-compatible-providers.md', 'CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS');
requireText('macos-bar/README.md', 'macos-bar/VERSION');
requireText('macos-bar/README.md', '.github/workflows/bar-release.yml');
requireText(
  '.github/ISSUE_TEMPLATE/documentation.yml',
  'https://docs.ccs.kaitran.ca/providers/oauth/cursor'
);

const practicalGuidanceFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'CLAUDE.md'),
  path.join(root, 'CONTRIBUTING.md'),
  path.join(root, 'SECURITY.md'),
  path.join(root, 'docker', 'README.md'),
  path.join(root, 'macos-bar', 'README.md'),
  ...collectFiles(path.join(root, 'docs'), /\.mdx?$/),
  ...collectFiles(path.join(root, '.github', 'ISSUE_TEMPLATE'), /\.(md|ya?ml)$/),
];

for (const staleGuidePath of removedGuides) {
  for (const guidancePath of practicalGuidanceFiles) {
    if (read(path.relative(root, guidancePath)).includes(staleGuidePath)) {
      failures.push(
        `${path.relative(root, guidancePath)} references deleted guide: ${staleGuidePath}`
      );
    }
  }
}

const markdownFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'docker', 'README.md'),
  path.join(root, 'macos-bar', 'README.md'),
  ...collectFiles(path.join(root, 'docs'), /\.mdx?$/),
];
const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;

for (const markdownPath of markdownFiles) {
  const source = fs.readFileSync(markdownPath, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || target.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(target)) {
      continue;
    }

    target = target.split('#', 1)[0].split('?', 1)[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      failures.push(`${path.relative(root, markdownPath)} has invalid link encoding: ${match[1]}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(markdownPath), target);
    if (!fs.existsSync(resolved)) {
      failures.push(`${path.relative(root, markdownPath)} has missing relative link: ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error('[X] Documentation freshness checks failed:');
  for (const failure of failures) {
    console.error(`    ${failure}`);
  }
  process.exit(1);
}

console.log('[OK] Documentation pointers, retained contracts, and relative links are current.');
