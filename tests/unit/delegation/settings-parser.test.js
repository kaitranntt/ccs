#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SettingsParser } = require('../../../bin/delegation/settings-parser');

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
    console.log('\n=== Settings Parser Tests ===\n');

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

// Test fixture directory
const testDir = path.join(os.tmpdir(), 'ccs-test-settings');
const claudeDir = path.join(testDir, '.claude');

// Cleanup helpers
function setupTestDir() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(claudeDir, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
}

/**
 * Test 1: No settings files
 */
runner.test('Return empty arrays when no settings files', () => {
  setupTestDir();

  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 0, 'Should have 0 allowed tools');
  assertEqual(restrictions.disallowedTools.length, 0, 'Should have 0 disallowed tools');
});

/**
 * Test 2: Parse shared settings.json
 */
runner.test('Parse shared settings.json', () => {
  setupTestDir();

  const settingsPath = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    permissions: {
      allow: ['Bash(git:*)', 'Read'],
      deny: ['Bash(rm:*)']
    }
  }));

  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 2, 'Should have 2 allowed tools');
  assertEqual(restrictions.disallowedTools.length, 1, 'Should have 1 disallowed tool');
  assert(restrictions.allowedTools.includes('Bash(git:*)'), 'Should include git bash');
  assert(restrictions.disallowedTools.includes('Bash(rm:*)'), 'Should include rm deny');
});

/**
 * Test 3: Parse local settings overriding shared
 */
runner.test('Local settings override shared', () => {
  setupTestDir();

  // Shared settings
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    permissions: {
      allow: ['Read'],
      deny: []
    }
  }));

  // Local settings (adds more permissions)
  fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify({
    permissions: {
      allow: ['Bash(git:*)'],
      deny: ['Bash(rm:*)']
    }
  }));

  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 2, 'Should merge allowed tools');
  assert(restrictions.allowedTools.includes('Read'), 'Should have shared Read');
  assert(restrictions.allowedTools.includes('Bash(git:*)'), 'Should have local git');
  assertEqual(restrictions.disallowedTools.length, 1, 'Should have local deny');
});

/**
 * Test 4: Handle malformed JSON
 */
runner.test('Handle malformed JSON gracefully', () => {
  setupTestDir();

  const settingsPath = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsPath, '{ invalid json }');

  // Should not throw
  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 0, 'Should return empty arrays on parse error');
  assertEqual(restrictions.disallowedTools.length, 0);
});

/**
 * Test 5: Handle missing permissions key
 */
runner.test('Handle settings without permissions key', () => {
  setupTestDir();

  const settingsPath = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    someOtherKey: 'value'
  }));

  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 0, 'Should handle missing permissions');
  assertEqual(restrictions.disallowedTools.length, 0);
});

/**
 * Test 6: Handle empty permissions arrays
 */
runner.test('Handle empty permissions arrays', () => {
  setupTestDir();

  const settingsPath = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    permissions: {
      allow: [],
      deny: []
    }
  }));

  const restrictions = SettingsParser.parseToolRestrictions(testDir);

  assertEqual(restrictions.allowedTools.length, 0);
  assertEqual(restrictions.disallowedTools.length, 0);
});

// Run tests and cleanup
runner.run().finally(() => {
  cleanupTestDir();
});
