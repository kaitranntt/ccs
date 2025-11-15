#!/usr/bin/env node
'use strict';

const { ResultFormatter } = require('../../../bin/delegation/result-formatter');

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
    console.log('\n=== ResultFormatter Tests ===\n');

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

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `Expected to include "${needle}"`);
  }
}

/**
 * Run tests
 */
const runner = new TestRunner();

// Test 1: Basic formatting
runner.test('Should format successful result', () => {
  const result = {
    profile: 'glm',
    cwd: '/home/user/project',
    exitCode: 0,
    stdout: 'Task completed successfully',
    stderr: '',
    duration: 2300,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, 'Delegated to GLM-4.6', 'Should mention model');
  assertIncludes(formatted, 'ccs:glm', 'Should mention profile');
  assertIncludes(formatted, '/home/user/project', 'Should include CWD');
  assertIncludes(formatted, '2.3s', 'Should format duration');
  assertIncludes(formatted, 'Exit Code: 0', 'Should show exit code');
  assertIncludes(formatted, '[OK]', 'Should show success');
});

// Test 2: Failed result
runner.test('Should format failed result', () => {
  const result = {
    profile: 'glm',
    cwd: '/home/user/project',
    exitCode: 1,
    stdout: 'Error occurred',
    stderr: 'Command failed',
    duration: 1500,
    success: false
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, '[X]', 'Should show failure indicator');
  assertIncludes(formatted, 'Exit Code: 1', 'Should show non-zero exit code');
  assertIncludes(formatted, 'Delegation failed', 'Should indicate failure');
  assertIncludes(formatted, 'Stderr:', 'Should include stderr section');
  assertIncludes(formatted, 'Command failed', 'Should show stderr content');
});

// Test 3: Extract created files
runner.test('Should extract created files from output', () => {
  const output = 'Created: src/auth.js\nCreated: tests/auth.test.js';

  const { created, modified } = ResultFormatter.extractFileChanges(output);

  assert(created.length === 2, 'Should find 2 created files');
  assertIncludes(created[0], 'src/auth.js', 'Should include first file');
  assertIncludes(created[1], 'tests/auth.test.js', 'Should include second file');
});

// Test 4: Extract modified files
runner.test('Should extract modified files from output', () => {
  const output = 'Modified: src/index.js\nUpdated: package.json';

  const { created, modified } = ResultFormatter.extractFileChanges(output);

  assert(modified.length === 2, 'Should find 2 modified files');
  assertIncludes(modified[0], 'src/index.js', 'Should include first file');
  assertIncludes(modified[1], 'package.json', 'Should include second file');
});

// Test 5: Extract mixed file changes
runner.test('Should extract both created and modified files', () => {
  const output = 'Created: src/new.js\nModified: src/old.js\nCreated: tests/new.test.js';

  const { created, modified } = ResultFormatter.extractFileChanges(output);

  assert(created.length === 2, 'Should find 2 created files');
  assert(modified.length === 1, 'Should find 1 modified file');
});

// Test 6: No duplicate files in lists
runner.test('Should not duplicate files in created/modified lists', () => {
  const output = 'Created: src/file.js\nCreated: src/file.js\nModified: src/file.js';

  const { created, modified } = ResultFormatter.extractFileChanges(output);

  assert(created.length === 1, 'Should deduplicate created files');
  assert(modified.length === 0, 'Should not list created files as modified');
});

// Test 7: Format file lists
runner.test('Should format file lists in output', () => {
  const result = {
    profile: 'glm',
    cwd: '/home/user/project',
    exitCode: 0,
    stdout: 'Created: src/new.js\nModified: src/old.js',
    stderr: '',
    duration: 1000,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, '[i] Created Files:', 'Should have created header');
  assertIncludes(formatted, 'src/new.js', 'Should list created file');
  assertIncludes(formatted, '[i] Modified Files:', 'Should have modified header');
  assertIncludes(formatted, 'src/old.js', 'Should list modified file');
});

// Test 8: ASCII box formatting
runner.test('Should use ASCII box characters', () => {
  const result = {
    profile: 'glm',
    cwd: '/home/user/project',
    exitCode: 0,
    stdout: 'Done',
    stderr: '',
    duration: 1000,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, '╔', 'Should have top-left corner');
  assertIncludes(formatted, '╗', 'Should have top-right corner');
  assertIncludes(formatted, '╚', 'Should have bottom-left corner');
  assertIncludes(formatted, '╝', 'Should have bottom-right corner');
  assertIncludes(formatted, '║', 'Should have vertical borders');
  assertIncludes(formatted, '═', 'Should have horizontal borders');
});

// Test 9: Model display names
runner.test('Should use correct model display names', () => {
  const glmResult = {
    profile: 'glm',
    cwd: '/test',
    exitCode: 0,
    stdout: '',
    stderr: '',
    duration: 1000,
    success: true
  };

  const glmFormatted = ResultFormatter.format(glmResult);
  assertIncludes(glmFormatted, 'GLM-4.6', 'Should show GLM-4.6');

  const kimiResult = { ...glmResult, profile: 'kimi' };
  const kimiFormatted = ResultFormatter.format(kimiResult);
  assertIncludes(kimiFormatted, 'Kimi', 'Should show Kimi');
});

// Test 10: Duration formatting
runner.test('Should format duration correctly', () => {
  const result = {
    profile: 'glm',
    cwd: '/test',
    exitCode: 0,
    stdout: '',
    stderr: '',
    duration: 12345,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, '12.3s', 'Should format to 1 decimal place');
});

// Test 11: Empty output handling
runner.test('Should handle empty output', () => {
  const result = {
    profile: 'glm',
    cwd: '/test',
    exitCode: 0,
    stdout: '',
    stderr: '',
    duration: 1000,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, 'No output', 'Should indicate no output');
});

// Test 12: Minimal format
runner.test('Should support minimal format', () => {
  const result = {
    profile: 'glm',
    cwd: '/test',
    exitCode: 0,
    stdout: 'Done',
    stderr: '',
    duration: 1500,
    success: true
  };

  const minimal = ResultFormatter.formatMinimal(result);

  assertIncludes(minimal, '[OK]', 'Should show success');
  assertIncludes(minimal, 'GLM-4.6', 'Should show model');
  assertIncludes(minimal, '1.5s', 'Should show duration');
  assert(minimal.split('\n').length <= 3, 'Should be concise');
});

// Test 13: Case-insensitive file pattern matching
runner.test('Should match file patterns case-insensitively', () => {
  const output = 'CREATED: src/file.js\nMODIFIED: src/other.js';

  const { created, modified } = ResultFormatter.extractFileChanges(output);

  assert(created.length === 1, 'Should find created file (uppercase)');
  assert(modified.length === 1, 'Should find modified file (uppercase)');
});

// Test 14: File count in info box
runner.test('Should show file counts in info box', () => {
  const result = {
    profile: 'glm',
    cwd: '/test',
    exitCode: 0,
    stdout: 'Created: a.js\nCreated: b.js\nModified: c.js',
    stderr: '',
    duration: 1000,
    success: true
  };

  const formatted = ResultFormatter.format(result);

  assertIncludes(formatted, 'Files Created: 2', 'Should show created count');
  assertIncludes(formatted, 'Files Modified: 1', 'Should show modified count');
});

// Run all tests
runner.run();
