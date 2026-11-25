#!/usr/bin/env node

/**
 * Verify UI bundle size stays reasonable
 *
 * Current stack: React + TanStack Query + Radix UI + shadcn/ui + Recharts
 * Expected range: 800KB - 1.5MB gzipped for full-featured dashboard
 *
 * This is a developer tool, not a public-facing site, so we optimize for
 * features over minimal bundle size. The limit is a sanity check to catch
 * accidental large dependencies, not a hard performance target.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT_DIR, 'dist/ui');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const SHEBANG = '#!/usr/bin/env node';
const REQUIRED_DIRS = ['lib', 'config'];
// 1.75MB - bumped from 1.5MB when the code editor moved from
// react-simple-code-editor + prism-react-renderer (~18KB) to CodeMirror 6
// (~80KB gzipped) to restore native selection/copy in the raw config viewers.
const MAX_SIZE = 1.75 * 1024 * 1024;

function getGzipSize(filePath) {
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

function walkDir(dir) {
  let totalSize = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      totalSize += walkDir(filePath);
    } else {
      totalSize += getGzipSize(filePath);
    }
  }

  return totalSize;
}

/**
 * Verify required runtime asset directories exist.
 */
function verifyRequiredDirectories(rootDir = ROOT_DIR) {
  let ok = true;

  for (const dirName of REQUIRED_DIRS) {
    const dirPath = path.join(rootDir, dirName);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      console.error(`[X] Required directory missing: ${dirName}/`);
      ok = false;
    } else {
      console.log(`[OK] Directory present: ${dirName}/`);
    }
  }

  return ok;
}

/**
 * Verify dist/ccs.js and all package.json bin entrypoints exist with Node shebangs.
 */
function verifyBinEntrypoints(rootDir = ROOT_DIR, packageJsonPath = PACKAGE_JSON_PATH) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binEntries = pkg.bin || {};
  const entrypoints = Array.from(new Set(['dist/ccs.js', ...Object.values(binEntries)]));
  let ok = true;

  for (const relPath of entrypoints) {
    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      console.error(`[X] Missing entrypoint: ${relPath}`);
      ok = false;
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf8');
    if (!content.startsWith(SHEBANG)) {
      console.error(`[X] Missing '${SHEBANG}' shebang in ${relPath}`);
      ok = false;
      continue;
    }

    console.log(`[OK] Entrypoint verified: ${relPath}`);
  }

  return ok;
}

/**
 * Verify built UI assets exist and stay within the gzipped size budget.
 */
function verifyUiBundle(uiDir = UI_DIR) {
  if (!fs.existsSync(uiDir)) {
    console.log('[!] dist/ui not found. Run bun run ui:build first.');
    return false;
  }

  const totalSize = walkDir(uiDir);
  const sizeKB = (totalSize / 1024).toFixed(1);
  const maxKB = (MAX_SIZE / 1024).toFixed(0);

  if (totalSize > MAX_SIZE) {
    console.log(`[X] Bundle too large: ${sizeKB}KB gzipped (max: ${maxKB}KB)`);
    return false;
  }

  console.log(`[OK] Bundle size: ${sizeKB}KB gzipped`);
  return true;
}

function main() {
  const dirsOk = verifyRequiredDirectories();
  const binsOk = verifyBinEntrypoints();
  const uiOk = verifyUiBundle();

  if (!dirsOk || !binsOk || !uiOk) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getGzipSize,
  walkDir,
  verifyRequiredDirectories,
  verifyBinEntrypoints,
  verifyUiBundle,
  main,
};
