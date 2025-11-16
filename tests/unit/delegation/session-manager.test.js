#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SessionManager } = require('../../../bin/delegation/session-manager');

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
    console.log('\n=== Session Manager Tests ===\n');

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

// Cleanup test sessions before/after
const testSessionsPath = path.join(os.homedir(), '.ccs', 'delegation-sessions.json');
function cleanupTestSessions() {
  if (fs.existsSync(testSessionsPath)) {
    fs.unlinkSync(testSessionsPath);
  }
}

/**
 * Test 1: Store and retrieve session
 */
runner.test('Store new session', () => {
  cleanupTestSessions();

  const mgr = new SessionManager();
  mgr.storeSession('glm', {
    sessionId: 'test123',
    totalCost: 0.0025,
    cwd: '/home/test'
  });

  const session = mgr.getLastSession('glm');
  assert(session, 'Session should exist');
  assertEqual(session.sessionId, 'test123', 'Session ID should match');
  assertEqual(session.totalCost, 0.0025, 'Cost should match');
  assertEqual(session.turns, 1, 'Should have 1 turn initially');
});

/**
 * Test 2: Update session
 */
runner.test('Update existing session', () => {
  const mgr = new SessionManager();

  // Store initial
  mgr.storeSession('glm', {
    sessionId: 'test456',
    totalCost: 0.001,
    cwd: '/home/test'
  });

  // Update
  mgr.updateSession('glm', 'test456', {
    totalCost: 0.002
  });

  const session = mgr.getLastSession('glm');
  assertEqual(session.totalCost, 0.003, 'Cost should be aggregated (0.001 + 0.002)');
  assertEqual(session.turns, 2, 'Should have 2 turns');
});

/**
 * Test 3: Multiple profiles
 */
runner.test('Manage multiple profiles', () => {
  const mgr = new SessionManager();

  mgr.storeSession('glm', {
    sessionId: 'glm123',
    totalCost: 0.001,
    cwd: '/home/test'
  });

  mgr.storeSession('kimi', {
    sessionId: 'kimi123',
    totalCost: 0.002,
    cwd: '/home/test'
  });

  const glmSession = mgr.getLastSession('glm');
  const kimiSession = mgr.getLastSession('kimi');

  assertEqual(glmSession.sessionId, 'glm123', 'GLM session should be separate');
  assertEqual(kimiSession.sessionId, 'kimi123', 'Kimi session should be separate');
});

/**
 * Test 4: No session for profile
 */
runner.test('Return null for non-existent profile', () => {
  const mgr = new SessionManager();

  const session = mgr.getLastSession('nonexistent');
  assertEqual(session, null, 'Should return null for unknown profile');
});

/**
 * Test 5: Clear profile
 */
runner.test('Clear profile sessions', () => {
  const mgr = new SessionManager();

  mgr.storeSession('glm', {
    sessionId: 'test789',
    totalCost: 0.001,
    cwd: '/home/test'
  });

  mgr.clearProfile('glm');

  const session = mgr.getLastSession('glm');
  assertEqual(session, null, 'Session should be cleared');
});

/**
 * Test 6: Cleanup expired sessions
 */
runner.test('Cleanup expired sessions', () => {
  const mgr = new SessionManager();

  // Store session with old timestamp (31 days ago)
  const sessions = {};
  const oldTime = Date.now() - (31 * 24 * 60 * 60 * 1000);
  sessions['glm:latest'] = {
    sessionId: 'old123',
    profile: 'glm',
    startTime: oldTime,
    lastTurnTime: oldTime,
    totalCost: 0.001,
    turns: 1,
    cwd: '/home/test'
  };

  // Save manually
  const dir = path.dirname(mgr.sessionsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(mgr.sessionsPath, JSON.stringify(sessions));

  // Cleanup
  mgr.cleanupExpired();

  const session = mgr.getLastSession('glm');
  assertEqual(session, null, 'Expired session should be removed');
});

/**
 * Test 7: Don't cleanup recent sessions
 */
runner.test('Keep recent sessions during cleanup', () => {
  const mgr = new SessionManager();

  mgr.storeSession('glm', {
    sessionId: 'recent123',
    totalCost: 0.001,
    cwd: '/home/test'
  });

  mgr.cleanupExpired();

  const session = mgr.getLastSession('glm');
  assert(session, 'Recent session should not be removed');
  assertEqual(session.sessionId, 'recent123');
});

// Cleanup after all tests
runner.run().finally(() => {
  cleanupTestSessions();
});
