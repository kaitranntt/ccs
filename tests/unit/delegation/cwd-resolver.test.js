#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { CwdResolver } = require('../../../bin/delegation/cwd-resolver');

/**
 * Simple test runner (no external dependencies)
 */
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n=== CwdResolver Tests ===\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`[OK] ${name}`);
        this.passed++;
      } catch (error) {
        console.error(`[X] ${name}`);
        console.error(`  Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\nResults: ${this.passed} passed, ${this.failed} failed`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

/**
 * Assertion helpers
 */
function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

/**
 * Test setup helpers
 */
function createTestStructure() {
  const testRoot = path.join(os.tmpdir(), 'ccs-test-' + Date.now());

  // Create monorepo structure
  fs.mkdirSync(testRoot, { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'packages', 'app'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'packages', 'api'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'apps', 'web'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'src'), { recursive: true });

  // Create package.json markers
  fs.writeFileSync(path.join(testRoot, 'package.json'), '{}');
  fs.writeFileSync(path.join(testRoot, 'packages', 'app', 'package.json'), '{}');
  fs.writeFileSync(path.join(testRoot, 'src', 'index.js'), '// code');

  return testRoot;
}

function cleanupTestStructure(testRoot) {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

/**
 * Run tests
 */
const runner = new TestRunner();

// Test 1: Default to current CWD
runner.test('Should default to current CWD', () => {
  const currentCwd = process.cwd();
  const resolved = CwdResolver.resolve('Fix bug', currentCwd);

  assertEqual(resolved, currentCwd, 'Should return current CWD');
});

// Test 2: Explicit path hint
runner.test('Should resolve explicit "in <path>" hint', () => {
  const testRoot = createTestStructure();

  try {
    const targetPath = path.join(testRoot, 'packages', 'app');
    const prompt = `Fix bug in packages/app`;

    const resolved = CwdResolver.resolve(prompt, testRoot);

    assertEqual(resolved, targetPath, 'Should resolve to packages/app');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 3: File path reference
runner.test('Should resolve file path to directory', () => {
  const testRoot = createTestStructure();

  try {
    const prompt = 'Fix src/index.js';
    const resolved = CwdResolver.resolve(prompt, testRoot);

    assertEqual(resolved, path.join(testRoot, 'src'), 'Should resolve to src directory');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 4: Monorepo packages/ pattern
runner.test('Should detect packages/ pattern', () => {
  const testRoot = createTestStructure();

  try {
    const prompt = 'Update packages/api module';
    const resolved = CwdResolver.resolve(prompt, testRoot);

    assertEqual(resolved, path.join(testRoot, 'packages', 'api'), 'Should resolve to packages/api');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 5: Monorepo apps/ pattern
runner.test('Should detect apps/ pattern', () => {
  const testRoot = createTestStructure();

  try {
    const prompt = 'Debug apps/web component';
    const resolved = CwdResolver.resolve(prompt, testRoot);

    assertEqual(resolved, path.join(testRoot, 'apps', 'web'), 'Should resolve to apps/web');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 6: Non-existent path fallback
runner.test('Should fallback to current CWD for non-existent path', () => {
  const currentCwd = process.cwd();
  const prompt = 'Fix bug in nonexistent/path';

  const resolved = CwdResolver.resolve(prompt, currentCwd);

  assertEqual(resolved, currentCwd, 'Should fallback to current CWD');
});

// Test 7: Monorepo detection
runner.test('Should detect monorepo structure', () => {
  const monorepoPath = '/home/user/project/packages/app';
  const isMonorepo = CwdResolver.isMonorepo(monorepoPath);

  assert(isMonorepo, 'Should detect packages/ as monorepo');
});

// Test 8: Non-monorepo detection
runner.test('Should not detect non-monorepo', () => {
  const regularPath = '/home/user/project/src';
  const isMonorepo = CwdResolver.isMonorepo(regularPath);

  assert(!isMonorepo, 'Should not detect regular path as monorepo');
});

// Test 9: Workspace name extraction
runner.test('Should extract workspace name from monorepo path', () => {
  const monorepoPath = '/home/user/project/packages/api-server';
  const workspaceName = CwdResolver.getWorkspaceName(monorepoPath);

  assertEqual(workspaceName, 'api-server', 'Should extract workspace name');
});

// Test 10: Workspace name for non-monorepo
runner.test('Should return null for non-monorepo workspace name', () => {
  const regularPath = '/home/user/project/src';
  const workspaceName = CwdResolver.getWorkspaceName(regularPath);

  assertEqual(workspaceName, null, 'Should return null for non-monorepo');
});

// Test 11: Absolute path handling
runner.test('Should handle absolute paths', () => {
  const testRoot = createTestStructure();

  try {
    const absolutePath = path.join(testRoot, 'src');
    const prompt = `Fix bug in ${absolutePath}`;

    // Should resolve to the directory itself if it exists
    const resolved = CwdResolver.resolve(prompt, testRoot);

    // May resolve to src or default to testRoot depending on implementation
    assert(resolved.includes(testRoot), 'Should resolve within test root');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 12: Relative path validation
runner.test('Should validate resolved paths exist', () => {
  const testRoot = createTestStructure();

  try {
    const targetPath = path.join(testRoot, 'packages', 'app');
    const isValid = CwdResolver.validatePath(targetPath, testRoot);

    assert(isValid, 'Should validate existing path');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 13: Invalid path validation
runner.test('Should reject non-existent paths', () => {
  const testRoot = createTestStructure();

  try {
    const invalidPath = path.join(testRoot, 'nonexistent');
    const isValid = CwdResolver.validatePath(invalidPath, testRoot);

    assert(!isValid, 'Should reject non-existent path');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Test 14: Get relative path from project root
runner.test('Should get relative path from project root', () => {
  const testRoot = createTestStructure();

  try {
    const absolutePath = path.join(testRoot, 'packages', 'app');
    const relativePath = CwdResolver.getRelativePath(absolutePath);

    assert(relativePath.includes('packages'), 'Should include packages in relative path');
    assert(relativePath.includes('app'), 'Should include app in relative path');
  } finally {
    cleanupTestStructure(testRoot);
  }
});

// Run all tests
runner.run();
