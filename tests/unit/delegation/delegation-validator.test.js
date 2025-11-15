#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DelegationValidator } = require('../../../bin/utils/delegation-validator');

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
    console.log('\n=== DelegationValidator Tests ===\n');

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
function createMockProfile(profileName, apiKey) {
  const profileDir = path.join(os.homedir(), '.ccs', 'profiles', profileName);
  const settingsPath = path.join(profileDir, 'settings.json');

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const settings = {
    env: {
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: 'test-model'
    }
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

function cleanupMockProfile(profileName) {
  const profileDir = path.join(os.homedir(), '.ccs', 'profiles', profileName);
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

/**
 * Run tests
 */
const runner = new TestRunner();

// Test 1: Validate with missing profile
runner.test('Should fail for non-existent profile', () => {
  const result = DelegationValidator.validate('nonexistent-profile-xyz');

  assert(!result.valid, 'Should be invalid');
  assert(result.error.includes('not found'), 'Should mention not found');
  assert(result.suggestion, 'Should provide suggestion');
});

// Test 2: Validate with default placeholder API key
runner.test('Should fail for default placeholder API key', () => {
  const testProfile = 'test-default-key';

  try {
    createMockProfile(testProfile, 'YOUR_GLM_API_KEY_HERE');

    const result = DelegationValidator.validate(testProfile);

    assert(!result.valid, 'Should be invalid for placeholder');
    assert(result.error.includes('placeholder'), 'Should mention placeholder');
    assert(result.suggestion.includes('configure'), 'Should suggest configuration');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 3: Validate with valid API key
runner.test('Should succeed for valid API key', () => {
  const testProfile = 'test-valid-key';

  try {
    createMockProfile(testProfile, 'sk-ant-1234567890abcdef');

    const result = DelegationValidator.validate(testProfile);

    assert(result.valid, 'Should be valid');
    assert(!result.error, 'Should have no error');
    assert(result.settingsPath, 'Should include settings path');
    assert(result.apiKey, 'Should include masked API key');
    assert(result.apiKey.includes('...'), 'API key should be masked');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 4: Validate with corrupted JSON
runner.test('Should fail for corrupted settings.json', () => {
  const testProfile = 'test-corrupted';
  const profileDir = path.join(os.homedir(), '.ccs', 'profiles', testProfile);
  const settingsPath = path.join(profileDir, 'settings.json');

  try {
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Write invalid JSON
    fs.writeFileSync(settingsPath, '{invalid json');

    const result = DelegationValidator.validate(testProfile);

    assert(!result.valid, 'Should be invalid for corrupted JSON');
    assert(result.error.includes('parse') || result.error.includes('JSON'), 'Should mention JSON error');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 5: Validate with missing API key in settings
runner.test('Should fail for missing API key field', () => {
  const testProfile = 'test-missing-key';
  const profileDir = path.join(os.homedir(), '.ccs', 'profiles', testProfile);
  const settingsPath = path.join(profileDir, 'settings.json');

  try {
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Write settings without API key
    const settings = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com'
      }
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const result = DelegationValidator.validate(testProfile);

    assert(!result.valid, 'Should be invalid without API key');
    assert(result.error.includes('API key') || result.error.includes('AUTH_TOKEN'), 'Should mention missing API key');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 6: Validate GLM profile specifically
runner.test('Should recognize GLM-specific placeholders', () => {
  const testProfile = 'test-glm-placeholder';

  try {
    createMockProfile(testProfile, 'YOUR_GLM_API_KEY_HERE_GET_FROM_BIGMODEL_CN');

    const result = DelegationValidator.validate(testProfile);

    assert(!result.valid, 'Should be invalid for GLM placeholder');
    assert(result.error.includes('placeholder'), 'Should detect placeholder');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 7: Validate Kimi profile specifically
runner.test('Should recognize Kimi-specific placeholders', () => {
  const testProfile = 'test-kimi-placeholder';

  try {
    createMockProfile(testProfile, 'YOUR_KIMI_API_KEY_HERE');

    const result = DelegationValidator.validate(testProfile);

    assert(!result.valid, 'Should be invalid for Kimi placeholder');
    assert(result.error.includes('placeholder'), 'Should detect placeholder');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 8: API key masking
runner.test('Should properly mask API keys', () => {
  const testProfile = 'test-masking';

  try {
    const fullKey = 'sk-ant-api03-1234567890abcdef';
    createMockProfile(testProfile, fullKey);

    const result = DelegationValidator.validate(testProfile);

    assert(result.valid, 'Should be valid');
    assert(result.apiKey, 'Should have masked key');
    assert(!result.apiKey.includes(fullKey), 'Should not expose full key');
    assert(result.apiKey.includes('...'), 'Should contain ellipsis');
    assert(result.apiKey.length < fullKey.length, 'Masked key should be shorter');
  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Run all tests
runner.run();
