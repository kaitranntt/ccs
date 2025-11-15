# Phase 6: Testing & Validation

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: All previous phases complete
- **Related**: Complete system integration

## Overview

**Date**: 2025-11-15
**Description**: Comprehensive testing across platforms, edge cases, delegation scenarios
**Priority**: P0 (Critical - ensures quality)
**Implementation Status**: ⏳ Not Started (blocked by Phase 5)
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Must test all three platforms (Node.js, Bash, PowerShell)
- Delegation scenarios require real API keys (use test accounts)
- Edge cases critical (missing config, bad API keys, network failures)
- Regression testing ensures no breaking changes

## Requirements

### Functional

1. **Unit Tests**
   - Test all new modules (validator, enhancer, executor, etc.)
   - Test delegation-rules.json parsing
   - Test CWD resolver logic
   - Test result formatter output

2. **Integration Tests**
   - Test full delegation flow (slash command → subagent → headless → result)
   - Test GLM delegation end-to-end
   - Test Kimi delegation end-to-end
   - Test custom model creation and use

3. **Platform Tests**
   - Node.js on macOS, Linux, Windows
   - Bash on macOS, Linux
   - PowerShell on Windows
   - Git Bash on Windows

4. **Edge Case Tests**
   - Missing GLM profile
   - Default API key (should fail validation)
   - Invalid settings.json
   - Network timeout
   - CWD doesn't exist
   - Monorepo path resolution
   - Special characters in prompts

5. **Regression Tests**
   - Existing ccs commands still work
   - Account switching unchanged
   - Profile isolation maintained
   - Settings-based profiles work

### Non-Functional

- Tests run in CI/CD
- <5 minutes total test time
- Clear test output (pass/fail)
- No flaky tests

## Architecture

```
tests/
├── unit/
│   ├── delegation-validator.test.js
│   ├── prompt-enhancer.test.js
│   ├── cwd-resolver.test.js
│   ├── result-formatter.test.js
│   └── delegation-engine.test.js
├── integration/
│   ├── slash-commands.test.js
│   ├── delegation-flow.test.js
│   └── custom-models.test.js
├── platform/
│   ├── node-macos.test.js
│   ├── node-linux.test.js
│   ├── node-windows.test.js
│   ├── bash-unix.test.sh
│   └── powershell-windows.test.ps1
├── edge-cases/
│   ├── missing-profile.test.js
│   ├── invalid-api-key.test.js
│   ├── network-timeout.test.js
│   └── monorepo-cwd.test.js
└── regression/
    ├── existing-commands.test.js
    └── profile-isolation.test.js
```

## Implementation Steps

### 1. Unit Tests

**Create tests/unit/delegation-validator.test.js**:
```javascript
const DelegationValidator = require('../../bin/utils/delegation-validator');

describe('DelegationValidator', () => {
  test('rejects missing profile', () => {
    expect(() => DelegationValidator.validate('nonexistent'))
      .toThrow('Profile not found');
  });

  test('rejects default API key', () => {
    // Create test profile with default key
    expect(() => DelegationValidator.validate('test-default'))
      .toThrow('Invalid API key');
  });

  test('accepts valid profile', () => {
    expect(DelegationValidator.validate('test-valid')).toBe(true);
  });
});
```

**Create similar tests for**:
- prompt-enhancer (test output format)
- cwd-resolver (test path resolution)
- result-formatter (test ASCII formatting)
- delegation-engine (test rule matching)

### 2. Integration Tests

**Create tests/integration/delegation-flow.test.js**:
```javascript
describe('Full Delegation Flow', () => {
  test('/ccs:glm executes successfully', async () => {
    // Mock Claude CLI
    // Invoke slash command
    // Verify subagent launched
    // Verify headless execution
    // Verify result formatted
  });

  test('prompt enhancement preserves intent', async () => {
    const prompt = 'add tests to utils.js';
    // Execute delegation
    // Verify GLM received enhanced prompt
    // Verify result mentions utils.js
  });
});
```

### 3. Platform Tests

**Test each platform combination**:
- macOS + Node.js
- macOS + Bash
- Linux + Node.js
- Linux + Bash
- Windows + Node.js
- Windows + PowerShell
- Windows + Git Bash

**Verify**:
- --help shows delegation section
- --version shows delegation status
- /ccs:glm works
- /ccs:create works

### 4. Edge Case Tests

**Missing Profile**:
```javascript
test('handles missing GLM profile gracefully', () => {
  // Delete GLM profile
  // Invoke /ccs:glm
  // Expect clear error message
  // Expect setup instructions
});
```

**Default API Key**:
```javascript
test('rejects delegation with default API key', () => {
  // Set API key to 'YOUR_GLM_API_KEY_HERE'
  // Invoke /ccs:glm
  // Expect validation error
  // Expect configuration hint
});
```

**Network Timeout**:
```javascript
test('handles network timeout gracefully', async () => {
  // Mock network delay > 120s
  // Invoke delegation
  // Expect timeout error
  // Expect retry suggestion
});
```

**Monorepo CWD**:
```javascript
test('resolves CWD in monorepo correctly', () => {
  // Create monorepo structure
  // Set CWD to packages/app/
  // Invoke delegation with relative path
  // Verify absolute path resolved correctly
});
```

### 5. Regression Tests

**Existing Commands**:
```javascript
test('ccs glm still works (non-delegation)', () => {
  // Run: ccs glm "prompt"
  // Verify switches to GLM session (old behavior)
  // Verify NOT delegation (different from /ccs:glm)
});

test('ccs auth commands unchanged', () => {
  // Test auth create, list, show, remove
  // Verify no regressions
});
```

**Profile Isolation**:
```javascript
test('account profiles remain isolated', () => {
  // Create two profiles
  // Use both concurrently
  // Verify sessions don't cross-contaminate
});
```

## Related Code Files

**New Test Files** (20+ files):
- tests/unit/* (5 files)
- tests/integration/* (3 files)
- tests/platform/* (5 files)
- tests/edge-cases/* (4 files)
- tests/regression/* (2 files)

**Test Infrastructure**:
- Update package.json scripts
- Add test fixtures
- Add mock utilities

## Implementation Steps

1. **Set up test infrastructure**
   - Install test framework (Jest)
   - Create test fixtures
   - Create mock utilities

2. **Write unit tests**
   - Test each module independently
   - Achieve >80% code coverage
   - Fix any bugs found

3. **Write integration tests**
   - Test end-to-end flows
   - Use test API keys
   - Verify full delegation cycle

4. **Platform testing**
   - Test on macOS (Node.js + Bash)
   - Test on Linux (Docker container)
   - Test on Windows (GitHub Actions)

5. **Edge case testing**
   - Test all error paths
   - Test boundary conditions
   - Test unusual inputs

6. **Regression testing**
   - Run existing test suite
   - Verify no breakages
   - Add new regression tests

7. **CI/CD integration**
   - Add tests to GitHub Actions
   - Run on all PRs
   - Block merge on failure

## Todo List

- [ ] Install Jest test framework
- [ ] Create test fixtures (profiles, settings.json)
- [ ] Write unit tests (all 5 modules)
- [ ] Write integration tests (3 scenarios)
- [ ] Set up platform test environments
- [ ] Run platform tests (all combinations)
- [ ] Write edge case tests (4 scenarios)
- [ ] Write regression tests (2 suites)
- [ ] Achieve >80% code coverage
- [ ] Fix all bugs found in testing
- [ ] Document test procedures
- [ ] Add tests to CI/CD pipeline
- [ ] Run full test suite on all platforms
- [ ] Get user sign-off on test results

## Success Criteria

- ✓ All unit tests pass (>80% coverage)
- ✓ All integration tests pass
- ✓ All platform tests pass (Node.js/Bash/PowerShell)
- ✓ All edge cases handled gracefully
- ✓ Zero regressions in existing functionality
- ✓ Tests run in <5 minutes
- ✓ CI/CD integration working
- ✓ Test documentation complete

## Risk Assessment

**MEDIUM RISK**: Platform-specific test failures

**Mitigation**:
- Test on real platforms, not just emulators
- Use GitHub Actions for multi-platform CI
- Document platform-specific quirks

**LOW RISK**: Unit test coverage (isolated modules)

## Security Considerations

1. **Test API Keys**
   - Use dedicated test accounts
   - Never commit real API keys
   - Rotate test keys regularly

2. **Test Data**
   - Don't use real user data
   - Generate synthetic test data
   - Clean up test artifacts

3. **CI/CD Secrets**
   - Store test keys in GitHub Secrets
   - Don't log sensitive data
   - Audit test runs for leaks

## Next Steps

1. User approves test plan
2. Set up test infrastructure
3. Write all tests in parallel
4. Run full test suite
5. Fix any bugs found
6. Get final user sign-off
7. **READY FOR RELEASE** 🎉
