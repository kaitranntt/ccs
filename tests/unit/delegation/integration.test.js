#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DelegationValidator } = require('../../../bin/utils/delegation-validator');
const { PromptEnhancer } = require('../../../bin/utils/prompt-enhancer');
const { CwdResolver } = require('../../../bin/delegation/cwd-resolver');
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
    console.log('\n=== Delegation Integration Tests ===\n');

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

// Test 1: Full delegation workflow (validation -> enhancement -> formatting)
runner.test('Should complete full delegation workflow', () => {
  const testProfile = 'test-integration';

  try {
    // Step 1: Create and validate profile
    createMockProfile(testProfile, 'sk-ant-valid-key-12345');
    const validation = DelegationValidator.validate(testProfile);

    assert(validation.valid, 'Profile should be valid');

    // Step 2: Enhance prompt
    const rawPrompt = 'Fix bug in auth.js';
    const enhanced = PromptEnhancer.enhance(rawPrompt, {
      cwd: '/home/user/project',
      files: ['src/auth.js']
    });

    assertIncludes(enhanced, '# Task', 'Should have Task section');
    assertIncludes(enhanced, rawPrompt, 'Should include original prompt');
    assertIncludes(enhanced, '/home/user/project', 'Should include CWD');

    // Step 3: Simulate execution result
    const executionResult = {
      profile: testProfile,
      cwd: '/home/user/project',
      exitCode: 0,
      stdout: 'Modified: src/auth.js',
      stderr: '',
      duration: 1500,
      success: true
    };

    // Step 4: Format result
    const formatted = ResultFormatter.format(executionResult);

    assertIncludes(formatted, 'Delegation completed', 'Should show completion');
    assertIncludes(formatted, 'src/auth.js', 'Should list modified file');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 2: Workflow with invalid profile (should fail at validation)
runner.test('Should fail workflow for invalid profile', () => {
  const testProfile = 'test-invalid';

  try {
    // Step 1: Create profile with placeholder
    createMockProfile(testProfile, 'YOUR_GLM_API_KEY_HERE');

    // Step 2: Validate (should fail)
    const validation = DelegationValidator.validate(testProfile);

    assert(!validation.valid, 'Profile should be invalid');
    assert(validation.error, 'Should have error message');
    assert(validation.suggestion, 'Should have suggestion');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 3: Workflow with monorepo CWD resolution
runner.test('Should resolve monorepo CWD in workflow', () => {
  const testProfile = 'test-monorepo';

  try {
    // Create valid profile
    createMockProfile(testProfile, 'sk-ant-valid-key');

    // Prompt with monorepo hint
    const prompt = 'Update packages/api module';
    const currentCwd = '/home/user/monorepo';

    // Resolve CWD
    const resolvedCwd = CwdResolver.resolve(prompt, currentCwd);

    // Should detect packages/ pattern
    assert(resolvedCwd.includes('packages') || resolvedCwd === currentCwd,
      'Should attempt to resolve monorepo path');

    // Enhance with resolved CWD
    const enhanced = PromptEnhancer.enhance(prompt, {
      cwd: resolvedCwd
    });

    assertIncludes(enhanced, 'Update packages/api', 'Should include original prompt');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 4: Workflow with multiple file changes
runner.test('Should handle multiple file changes in workflow', () => {
  const testProfile = 'test-multifile';

  try {
    createMockProfile(testProfile, 'sk-ant-valid-key');

    const prompt = 'Refactor authentication module';
    const enhanced = PromptEnhancer.enhance(prompt, {
      files: ['src/auth.js', 'src/utils.js', 'tests/auth.test.js']
    });

    // Simulate result with multiple changes
    const result = {
      profile: testProfile,
      cwd: '/home/user/project',
      exitCode: 0,
      stdout: `
        Modified: src/auth.js
        Modified: src/utils.js
        Created: tests/auth.test.js
        Created: tests/utils.test.js
      `,
      stderr: '',
      duration: 3000,
      success: true
    };

    const formatted = ResultFormatter.format(result);

    assertIncludes(formatted, 'Created Files:', 'Should show created section');
    assertIncludes(formatted, 'Modified Files:', 'Should show modified section');
    assertIncludes(formatted, 'Files Created: 2', 'Should count created files');
    assertIncludes(formatted, 'Files Modified: 2', 'Should count modified files');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 5: Workflow with execution failure
runner.test('Should handle execution failure in workflow', () => {
  const testProfile = 'test-failure';

  try {
    createMockProfile(testProfile, 'sk-ant-valid-key');

    // Simulate failed execution
    const result = {
      profile: testProfile,
      cwd: '/home/user/project',
      exitCode: 1,
      stdout: 'Error: File not found',
      stderr: 'Command failed with exit code 1',
      duration: 500,
      success: false
    };

    const formatted = ResultFormatter.format(result);

    assertIncludes(formatted, '[X]', 'Should show failure indicator');
    assertIncludes(formatted, 'Delegation failed', 'Should indicate failure');
    assertIncludes(formatted, 'Exit Code: 1', 'Should show exit code');
    assertIncludes(formatted, 'Stderr:', 'Should include stderr');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 6: End-to-end prompt enhancement with all options
runner.test('Should enhance prompt with all context options', () => {
  const testProfile = 'test-full-context';

  try {
    createMockProfile(testProfile, 'sk-ant-valid-key');

    const enhanced = PromptEnhancer.enhance('Implement feature', {
      cwd: '/home/user/project/packages/api',
      files: ['src/index.js', 'src/router.js'],
      scope: 'REST API endpoints',
      metadata: {
        modelHint: 'Simple CRUD operations',
        priority: 'high'
      }
    });

    assertIncludes(enhanced, '# Task', 'Should have Task');
    assertIncludes(enhanced, '# Working Directory', 'Should have CWD');
    assertIncludes(enhanced, '# Files', 'Should have Files');
    assertIncludes(enhanced, 'REST API endpoints', 'Should have scope');
    assertIncludes(enhanced, 'Simple CRUD operations', 'Should have model hint');
    assertIncludes(enhanced, '# Requirements', 'Should have Requirements');
    assertIncludes(enhanced, '# Success Criteria', 'Should have Success Criteria');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Test 7: Workflow resilience to missing optional data
runner.test('Should handle workflow with minimal data', () => {
  const testProfile = 'test-minimal';

  try {
    createMockProfile(testProfile, 'sk-ant-valid-key');

    // Minimal prompt enhancement
    const enhanced = PromptEnhancer.enhance('Simple task');

    assertIncludes(enhanced, 'Simple task', 'Should include prompt');
    assertIncludes(enhanced, '# Requirements', 'Should still have structure');

    // Minimal execution result
    const result = {
      profile: testProfile,
      cwd: '/test',
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: 100,
      success: true
    };

    const formatted = ResultFormatter.format(result);

    assertIncludes(formatted, '[OK]', 'Should show success');
    assert(formatted.length > 0, 'Should produce output');

  } finally {
    cleanupMockProfile(testProfile);
  }
});

// Run all tests
runner.run();
