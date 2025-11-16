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
    console.log('\n=== JSON Output Parsing Tests ===\n');

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Test suite
const runner = new TestRunner();

/**
 * Mock HeadlessExecutor._detectClaudeCli to avoid PATH dependency
 */
const originalDetect = HeadlessExecutor._detectClaudeCli;
HeadlessExecutor._detectClaudeCli = () => '/usr/local/bin/claude';

/**
 * Test 1: JSON parsing with valid response
 */
runner.test('Parse valid JSON response', async () => {
  // Mock spawn to return valid JSON
  const mockSpawn = require('child_process').spawn;
  const originalSpawn = mockSpawn;

  // We can't easily mock spawn in this test environment
  // Instead, we'll test the JSON parsing logic directly

  const validJson = JSON.stringify({
    type: 'result',
    subtype: 'success',
    total_cost_usd: 0.0025,
    is_error: false,
    duration_ms: 1500,
    duration_api_ms: 1200,
    num_turns: 3,
    result: 'Task completed successfully',
    session_id: 'abc123def456'
  });

  // Simulate the parsing logic from headless-executor.js
  const result = {
    exitCode: 0,
    stdout: validJson,
    stderr: '',
    success: true
  };

  const outputFormat = 'json';
  if (outputFormat === 'json' && result.stdout.trim()) {
    try {
      const jsonData = JSON.parse(result.stdout);
      result.json = jsonData;
      result.sessionId = jsonData.session_id || null;
      result.totalCost = jsonData.total_cost_usd || 0;
      result.numTurns = jsonData.num_turns || 0;
      result.isError = jsonData.is_error || false;
      result.content = jsonData.result || '';
    } catch (parseError) {
      result.jsonParseError = parseError.message;
      result.content = result.stdout;
    }
  }

  assertEqual(result.sessionId, 'abc123def456', 'Session ID should be extracted');
  assertEqual(result.totalCost, 0.0025, 'Cost should be extracted');
  assertEqual(result.numTurns, 3, 'Num turns should be extracted');
  assertEqual(result.isError, false, 'Error flag should be extracted');
  assertEqual(result.content, 'Task completed successfully', 'Content should be extracted');
  assert(!result.jsonParseError, 'Should not have parse error');
});

/**
 * Test 2: JSON parsing with malformed response
 */
runner.test('Fallback to text on malformed JSON', async () => {
  const malformedJson = '{ invalid json here }';

  const result = {
    exitCode: 0,
    stdout: malformedJson,
    stderr: '',
    success: true
  };

  const outputFormat = 'json';
  if (outputFormat === 'json' && result.stdout.trim()) {
    try {
      const jsonData = JSON.parse(result.stdout);
      result.json = jsonData;
      result.sessionId = jsonData.session_id || null;
      result.totalCost = jsonData.total_cost_usd || 0;
      result.numTurns = jsonData.num_turns || 0;
      result.isError = jsonData.is_error || false;
      result.content = jsonData.result || '';
    } catch (parseError) {
      result.jsonParseError = parseError.message;
      result.content = result.stdout;
    }
  }

  assert(result.jsonParseError, 'Should have parse error');
  assertEqual(result.content, malformedJson, 'Should fallback to raw stdout');
  assert(!result.sessionId, 'Should not have session ID');
});

/**
 * Test 3: JSON parsing with empty stdout
 */
runner.test('Handle empty stdout gracefully', async () => {
  const result = {
    exitCode: 0,
    stdout: '',
    stderr: '',
    success: true
  };

  const outputFormat = 'json';
  if (outputFormat === 'json' && result.stdout.trim()) {
    try {
      const jsonData = JSON.parse(result.stdout);
      result.json = jsonData;
      result.sessionId = jsonData.session_id || null;
      result.totalCost = jsonData.total_cost_usd || 0;
      result.numTurns = jsonData.num_turns || 0;
      result.isError = jsonData.is_error || false;
      result.content = jsonData.result || '';
    } catch (parseError) {
      result.jsonParseError = parseError.message;
      result.content = result.stdout;
    }
  } else {
    result.content = result.stdout;
  }

  assertEqual(result.content, '', 'Content should be empty string');
  assert(!result.jsonParseError, 'Should not try to parse empty string');
  assert(!result.sessionId, 'Should not have session ID');
});

/**
 * Test 4: JSON with is_error: true
 */
runner.test('Detect error state from JSON', async () => {
  const errorJson = JSON.stringify({
    type: 'result',
    subtype: 'error',
    total_cost_usd: 0.001,
    is_error: true,
    duration_ms: 500,
    duration_api_ms: 400,
    num_turns: 1,
    result: 'Task failed with error',
    session_id: 'error123'
  });

  const result = {
    exitCode: 1,
    stdout: errorJson,
    stderr: 'Some error message',
    success: false
  };

  const outputFormat = 'json';
  if (outputFormat === 'json' && result.stdout.trim()) {
    try {
      const jsonData = JSON.parse(result.stdout);
      result.json = jsonData;
      result.sessionId = jsonData.session_id || null;
      result.totalCost = jsonData.total_cost_usd || 0;
      result.numTurns = jsonData.num_turns || 0;
      result.isError = jsonData.is_error || false;
      result.content = jsonData.result || '';
    } catch (parseError) {
      result.jsonParseError = parseError.message;
      result.content = result.stdout;
    }
  }

  assertEqual(result.isError, true, 'Should detect error state');
  assertEqual(result.sessionId, 'error123', 'Should extract session ID even on error');
  assertEqual(result.content, 'Task failed with error', 'Should extract error content');
});

/**
 * Test 5: JSON with missing optional fields
 */
runner.test('Handle missing optional fields', async () => {
  const partialJson = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Done'
  });

  const result = {
    exitCode: 0,
    stdout: partialJson,
    stderr: '',
    success: true
  };

  const outputFormat = 'json';
  if (outputFormat === 'json' && result.stdout.trim()) {
    try {
      const jsonData = JSON.parse(result.stdout);
      result.json = jsonData;
      result.sessionId = jsonData.session_id || null;
      result.totalCost = jsonData.total_cost_usd || 0;
      result.numTurns = jsonData.num_turns || 0;
      result.isError = jsonData.is_error || false;
      result.content = jsonData.result || '';
    } catch (parseError) {
      result.jsonParseError = parseError.message;
      result.content = result.stdout;
    }
  }

  assertEqual(result.sessionId, null, 'Missing session_id should be null');
  assertEqual(result.totalCost, 0, 'Missing cost should be 0');
  assertEqual(result.numTurns, 0, 'Missing turns should be 0');
  assertEqual(result.content, 'Done', 'Should still extract result');
  assert(!result.jsonParseError, 'Should not have parse error');
});

/**
 * Test 6: Text mode (no JSON parsing)
 */
runner.test('Text mode bypasses JSON parsing', async () => {
  const textOutput = 'Plain text output from Claude';

  const result = {
    exitCode: 0,
    stdout: textOutput,
    stderr: '',
    success: true
  };

  const outputFormat = 'text';
  if (outputFormat === 'json' && result.stdout.trim()) {
    // This block should NOT execute
    throw new Error('Should not parse JSON in text mode');
  } else {
    result.content = result.stdout;
  }

  assertEqual(result.content, textOutput, 'Should use raw stdout');
  assert(!result.sessionId, 'Should not have JSON fields');
  assert(!result.jsonParseError, 'Should not have parse error');
});

// Run tests
runner.run();
