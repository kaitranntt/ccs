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
    console.log('\n=== Max Turns Determination Tests ===\n');

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Test suite
const runner = new TestRunner();

/**
 * Test 1: Simple tasks (5 turns)
 */
runner.test('Detect simple task: typo', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('fix typo in README');
  assertEqual(maxTurns, 5, 'Typo fix should be 5 turns');
});

runner.test('Detect simple task: comment', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('add comment to function');
  assertEqual(maxTurns, 5, 'Add comment should be 5 turns');
});

runner.test('Detect simple task: formatting', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('format code with prettier');
  assertEqual(maxTurns, 5, 'Format should be 5 turns');
});

runner.test('Detect simple task: rename', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('rename variable foo to bar');
  assertEqual(maxTurns, 5, 'Rename should be 5 turns');
});

/**
 * Test 2: Complex tasks (20 turns)
 */
runner.test('Detect complex task: implement', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('implement user authentication');
  assertEqual(maxTurns, 20, 'Implement should be 20 turns');
});

runner.test('Detect complex task: refactor', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('refactor database layer');
  assertEqual(maxTurns, 20, 'Refactor should be 20 turns');
});

runner.test('Detect complex task: analyze', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('analyze codebase for security issues');
  assertEqual(maxTurns, 20, 'Analyze should be 20 turns');
});

runner.test('Detect complex task: migrate', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('migrate from SQLite to PostgreSQL');
  assertEqual(maxTurns, 20, 'Migrate should be 20 turns');
});

/**
 * Test 3: Medium tasks (10 turns - default)
 */
runner.test('Detect medium task: add function', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('add validation to user form');
  assertEqual(maxTurns, 10, 'Add function should be 10 turns');
});

runner.test('Detect medium task: update', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('update error handling in auth module');
  assertEqual(maxTurns, 10, 'Update should be 10 turns');
});

runner.test('Detect medium task: generic', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('make the dashboard more responsive');
  assertEqual(maxTurns, 10, 'Generic task should default to 10 turns');
});

/**
 * Test 4: Case insensitivity
 */
runner.test('Case insensitive: TYPO', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('FIX TYPO in docs');
  assertEqual(maxTurns, 5, 'Should be case insensitive');
});

runner.test('Case insensitive: Implement', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('Implement New Feature');
  assertEqual(maxTurns, 20, 'Should be case insensitive');
});

/**
 * Test 5: Priority (simple > complex)
 */
runner.test('Simple takes priority: typo in refactor', () => {
  const maxTurns = HeadlessExecutor._determineMaxTurns('fix typo before refactor');
  assertEqual(maxTurns, 5, 'Simple keyword should take priority');
});

// Run tests
runner.run();
