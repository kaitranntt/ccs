#!/usr/bin/env node
'use strict';

const { PromptEnhancer } = require('../../../bin/utils/prompt-enhancer');

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
    console.log('\n=== PromptEnhancer Tests ===\n');

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

function assertNotIncludes(haystack, needle, message) {
  if (haystack.includes(needle)) {
    throw new Error(message || `Expected not to include "${needle}"`);
  }
}

/**
 * Run tests
 */
const runner = new TestRunner();

// Test 1: Basic enhancement
runner.test('Should enhance basic prompt', () => {
  const enhanced = PromptEnhancer.enhance('Fix the bug in auth.js');

  assertIncludes(enhanced, '# Task', 'Should include Task header');
  assertIncludes(enhanced, 'Fix the bug in auth.js', 'Should include original prompt');
  assertIncludes(enhanced, '# Requirements', 'Should include Requirements section');
  assertIncludes(enhanced, '# Success Criteria', 'Should include Success Criteria section');
});

// Test 2: Enhancement with CWD
runner.test('Should include working directory', () => {
  const enhanced = PromptEnhancer.enhance('Add tests', {
    cwd: '/home/user/project'
  });

  assertIncludes(enhanced, '# Working Directory', 'Should have CWD header');
  assertIncludes(enhanced, '/home/user/project', 'Should include CWD path');
});

// Test 3: Enhancement with files
runner.test('Should include file context', () => {
  const enhanced = PromptEnhancer.enhance('Refactor this', {
    files: ['src/auth.js', 'src/utils.js']
  });

  assertIncludes(enhanced, '# Files', 'Should have Files header');
  assertIncludes(enhanced, 'src/auth.js', 'Should include first file');
  assertIncludes(enhanced, 'src/utils.js', 'Should include second file');
});

// Test 4: Enhancement with scope
runner.test('Should include task scope', () => {
  const enhanced = PromptEnhancer.enhance('Add feature', {
    scope: 'authentication module'
  });

  assertIncludes(enhanced, 'authentication module', 'Should include scope');
});

// Test 5: Enhancement with metadata
runner.test('Should include custom metadata', () => {
  const enhanced = PromptEnhancer.enhance('Debug issue', {
    metadata: {
      modelHint: 'This is a simple refactoring task',
      priority: 'high'
    }
  });

  assertIncludes(enhanced, 'simple refactoring', 'Should include model hint');
  assertIncludes(enhanced, 'high', 'Should include priority');
});

// Test 6: Monorepo detection
runner.test('Should detect monorepo structure', () => {
  const enhanced = PromptEnhancer.enhance('Update package', {
    cwd: '/home/user/monorepo/packages/api'
  });

  assertIncludes(enhanced, 'packages/', 'Should recognize monorepo pattern');
});

// Test 7: Multiple options combined
runner.test('Should combine all options', () => {
  const enhanced = PromptEnhancer.enhance('Implement feature', {
    cwd: '/home/user/project',
    files: ['src/index.js'],
    scope: 'core functionality',
    metadata: { priority: 'high' }
  });

  assertIncludes(enhanced, '# Task', 'Should have Task');
  assertIncludes(enhanced, '# Working Directory', 'Should have CWD');
  assertIncludes(enhanced, '# Files', 'Should have Files');
  assertIncludes(enhanced, 'core functionality', 'Should have scope');
  assertIncludes(enhanced, 'high', 'Should have metadata');
});

// Test 8: Should not modify original prompt
runner.test('Should preserve original prompt text', () => {
  const original = 'Fix bug in auth.js: handle null user';
  const enhanced = PromptEnhancer.enhance(original);

  assertIncludes(enhanced, original, 'Should contain exact original text');
});

// Test 9: Empty prompt handling
runner.test('Should handle empty prompt', () => {
  const enhanced = PromptEnhancer.enhance('');

  assertIncludes(enhanced, '# Task', 'Should still have structure');
  assertIncludes(enhanced, '# Requirements', 'Should have requirements');
});

// Test 10: Whitespace trimming
runner.test('Should trim whitespace from prompt', () => {
  const enhanced = PromptEnhancer.enhance('  \n  Fix bug  \n  ');

  assertIncludes(enhanced, 'Fix bug', 'Should include trimmed text');
  assertNotIncludes(enhanced, '  \n  Fix bug  \n  ', 'Should not include extra whitespace');
});

// Test 11: Requirements section content
runner.test('Should include standard requirements', () => {
  const enhanced = PromptEnhancer.enhance('Add feature');

  assertIncludes(enhanced, 'Use existing project conventions', 'Should mention conventions');
  assertIncludes(enhanced, 'Follow YAGNI', 'Should mention YAGNI');
  assertIncludes(enhanced, 'KISS', 'Should mention KISS');
  assertIncludes(enhanced, 'DRY', 'Should mention DRY');
});

// Test 12: Success criteria
runner.test('Should include success criteria', () => {
  const enhanced = PromptEnhancer.enhance('Write tests');

  assertIncludes(enhanced, 'Success Criteria', 'Should have criteria header');
  assertIncludes(enhanced, 'Task completed', 'Should mention completion');
  assertIncludes(enhanced, 'No breaking changes', 'Should mention no breaking changes');
});

// Test 13: File list formatting
runner.test('Should format file list correctly', () => {
  const enhanced = PromptEnhancer.enhance('Update files', {
    files: ['file1.js', 'file2.js', 'file3.js']
  });

  assertIncludes(enhanced, 'file1.js', 'Should list first file');
  assertIncludes(enhanced, 'file2.js', 'Should list second file');
  assertIncludes(enhanced, 'file3.js', 'Should list third file');
});

// Test 14: CWD path formatting
runner.test('Should format CWD path correctly', () => {
  const enhanced = PromptEnhancer.enhance('Task', {
    cwd: '/absolute/path/to/project'
  });

  assertIncludes(enhanced, '`/absolute/path/to/project`', 'Should use code formatting for path');
});

// Run all tests
runner.run();
