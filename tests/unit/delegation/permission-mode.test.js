#!/usr/bin/env node
'use strict';

const { HeadlessExecutor } = require('../../../bin/delegation/headless-executor');

/**
 * Test runner
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
    console.log('\n=== Permission Mode Tests ===\n');

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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Test suite
const runner = new TestRunner();

/**
 * Test 1: Validation accepts valid modes
 */
runner.test('Validate acceptEdits mode', () => {
  // Should not throw
  HeadlessExecutor._validatePermissionMode('acceptEdits');
});

runner.test('Validate plan mode', () => {
  HeadlessExecutor._validatePermissionMode('plan');
});

runner.test('Validate default mode', () => {
  HeadlessExecutor._validatePermissionMode('default');
});

runner.test('Validate bypassPermissions mode', () => {
  HeadlessExecutor._validatePermissionMode('bypassPermissions');
});

/**
 * Test 2: Validation rejects invalid modes
 */
runner.test('Reject invalid mode', () => {
  let thrown = false;
  try {
    HeadlessExecutor._validatePermissionMode('invalidMode');
  } catch (error) {
    thrown = true;
    assert(error.message.includes('Invalid permission mode'), 'Error message should mention invalid mode');
    assert(error.message.includes('invalidMode'), 'Error should show the invalid value');
  }
  assert(thrown, 'Should throw error for invalid mode');
});

runner.test('Reject empty mode', () => {
  let thrown = false;
  try {
    HeadlessExecutor._validatePermissionMode('');
  } catch (error) {
    thrown = true;
  }
  assert(thrown, 'Should throw error for empty mode');
});

runner.test('Reject null mode', () => {
  let thrown = false;
  try {
    HeadlessExecutor._validatePermissionMode(null);
  } catch (error) {
    thrown = true;
  }
  assert(thrown, 'Should throw error for null mode');
});

/**
 * Test 3: CLI args construction (simulation)
 */
runner.test('Build args for acceptEdits mode', () => {
  const args = ['-p', 'test', '--settings', '/path/settings.json'];
  const permissionMode = 'acceptEdits';

  if (permissionMode && permissionMode !== 'default') {
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', permissionMode);
    }
  }

  assert(args.includes('--permission-mode'), 'Should have permission-mode flag');
  assert(args.includes('acceptEdits'), 'Should have acceptEdits value');
  assert(!args.includes('--dangerously-skip-permissions'), 'Should not have bypass flag');
});

runner.test('Build args for plan mode', () => {
  const args = ['-p', 'test', '--settings', '/path/settings.json'];
  const permissionMode = 'plan';

  if (permissionMode && permissionMode !== 'default') {
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', permissionMode);
    }
  }

  assert(args.includes('--permission-mode'), 'Should have permission-mode flag');
  assert(args.includes('plan'), 'Should have plan value');
});

runner.test('Build args for bypassPermissions mode', () => {
  const args = ['-p', 'test', '--settings', '/path/settings.json'];
  const permissionMode = 'bypassPermissions';

  if (permissionMode && permissionMode !== 'default') {
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', permissionMode);
    }
  }

  assert(args.includes('--dangerously-skip-permissions'), 'Should have bypass flag');
  assert(!args.includes('--permission-mode'), 'Should not have permission-mode flag');
});

runner.test('Build args for default mode (no flag)', () => {
  const args = ['-p', 'test', '--settings', '/path/settings.json'];
  const permissionMode = 'default';

  if (permissionMode && permissionMode !== 'default') {
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', permissionMode);
    }
  }

  assert(!args.includes('--permission-mode'), 'Should not add permission-mode for default');
  assert(!args.includes('--dangerously-skip-permissions'), 'Should not add bypass for default');
  assert(args.length === 4, 'Should only have base args');
});

// Run tests
runner.run();
