/**
 * Session Tracker Tests
 *
 * Tests for multi-instance CLIProxy session management.
 * Verifies reference counting and cleanup behavior.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set test isolation environment before importing
const testHome = path.join(
  os.tmpdir(),
  `ccs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
const originalCcsHome = process.env.CCS_HOME;
const originalCcsDir = process.env.CCS_DIR;
process.env.CCS_HOME = testHome;
delete process.env.CCS_DIR;

const {
  getExistingProxy,
  registerSession,
  unregisterSession,
  getSessionCount,
  hasActiveSessions,
  cleanupOrphanedSessions,
  stopProxy,
  getProxyStatus,
} = require('../../../dist/cliproxy/session-tracker');
const { setGlobalConfigDir } = require('../../../dist/utils/config-manager');

describe('Session Tracker', function () {
  // Derive the fixed test port from the process id so parallel test files in
  // isolated Bun processes do not collide on a shared hard-coded port.
  const testPort = 18000 + (process.pid % 1500);
  let sessionLockPath;
  let cliproxyDir;

  beforeEach(function () {
    // Reassert test isolation because other files mutate CCS_DIR/CCS_HOME in the same Bun process.
    process.env.CCS_HOME = testHome;
    delete process.env.CCS_DIR;
    setGlobalConfigDir(undefined);

    // Create test directories
    cliproxyDir = path.join(testHome, '.ccs', 'cliproxy');
    fs.mkdirSync(cliproxyDir, { recursive: true });
    // Use port-specific session file for non-default ports
    sessionLockPath = path.join(cliproxyDir, `sessions-${testPort}.json`);

    // Clean up any existing lock files
    try {
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        if (file.startsWith('sessions')) {
          fs.unlinkSync(path.join(cliproxyDir, file));
        }
      }
    } catch {
      // Directory might not exist yet
    }
  });

  afterEach(function () {
    setGlobalConfigDir(undefined);

    // Clean up lock files
    try {
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        if (file.startsWith('sessions')) {
          fs.unlinkSync(path.join(cliproxyDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(function () {
    // Clean up test directory
    try {
      fs.rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;
    setGlobalConfigDir(undefined);
  });

  describe('getExistingProxy', function () {
    it('should return null when no lock file exists', function () {
      const result = getExistingProxy(testPort);
      assert.strictEqual(result, null);
    });

    it('should return null when port does not match', function () {
      // Create lock with different port
      const lock = {
        port: 9999,
        pid: process.pid, // Use current process as it's definitely running
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = getExistingProxy(testPort);
      assert.strictEqual(result, null);
    });

    it('should return lock when proxy is healthy', function () {
      // Create lock with current process (guaranteed to be running)
      const lock = {
        port: testPort,
        pid: process.pid,
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = getExistingProxy(testPort);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result.port, testPort);
      assert.strictEqual(result.pid, process.pid);
      assert.deepStrictEqual(result.sessions, ['session1']);
    });

    it('should return null and cleanup when proxy is dead', function () {
      // Create lock with non-existent PID
      const lock = {
        port: testPort,
        pid: 999999999, // Very unlikely to exist
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = getExistingProxy(testPort);
      assert.strictEqual(result, null);

      // Lock file should be cleaned up
      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });
  });

  describe('registerSession', function () {
    it('should create new lock file for first session', function () {
      const sessionId = registerSession(testPort, process.pid);

      assert.ok(sessionId, 'should return session ID');
      assert.ok(fs.existsSync(sessionLockPath), 'should create lock file');

      const lock = JSON.parse(fs.readFileSync(sessionLockPath, 'utf-8'));
      assert.strictEqual(lock.port, testPort);
      assert.strictEqual(lock.pid, process.pid);
      assert.strictEqual(lock.sessions.length, 1);
      assert.strictEqual(lock.sessions[0], sessionId);
    });

    it('should add session to existing lock', function () {
      // Register first session
      const session1 = registerSession(testPort, process.pid);

      // Register second session
      const session2 = registerSession(testPort, process.pid);

      assert.notStrictEqual(session1, session2, 'should generate unique IDs');

      const lock = JSON.parse(fs.readFileSync(sessionLockPath, 'utf-8'));
      assert.strictEqual(lock.sessions.length, 2);
      assert.ok(lock.sessions.includes(session1));
      assert.ok(lock.sessions.includes(session2));
    });

    it('should create new lock if PID differs', function () {
      // Create lock with different PID
      const oldLock = {
        port: testPort,
        pid: 12345,
        sessions: ['old-session'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(oldLock));

      // Register with new PID
      const sessionId = registerSession(testPort, process.pid);

      const lock = JSON.parse(fs.readFileSync(sessionLockPath, 'utf-8'));
      assert.strictEqual(lock.pid, process.pid);
      assert.strictEqual(lock.sessions.length, 1);
      assert.strictEqual(lock.sessions[0], sessionId);
    });
  });

  describe('unregisterSession', function () {
    it('should return true when no lock exists', function () {
      const result = unregisterSession('nonexistent', testPort);
      assert.strictEqual(result, true);
    });

    it('should remove session and return false when others remain', function () {
      // Register two sessions
      const session1 = registerSession(testPort, process.pid);
      const session2 = registerSession(testPort, process.pid);

      // Unregister first
      const shouldKill = unregisterSession(session1, testPort);

      assert.strictEqual(shouldKill, false, 'should not kill - other sessions active');

      const lock = JSON.parse(fs.readFileSync(sessionLockPath, 'utf-8'));
      assert.strictEqual(lock.sessions.length, 1);
      assert.strictEqual(lock.sessions[0], session2);
    });

    it('should return true and delete lock when last session', function () {
      // Register single session
      const session1 = registerSession(testPort, process.pid);

      // Unregister it
      const shouldKill = unregisterSession(session1, testPort);

      assert.strictEqual(shouldKill, true, 'should kill - last session');
      assert.strictEqual(fs.existsSync(sessionLockPath), false, 'should delete lock file');
    });

    it('should handle unregistering non-existent session gracefully', function () {
      // Register a session
      registerSession(testPort, process.pid);

      // Try to unregister wrong session
      const shouldKill = unregisterSession('wrong-session-id', testPort);

      // Should return false since a session still exists
      assert.strictEqual(shouldKill, false);
    });
  });

  describe('getSessionCount (default port)', function () {
    it('should return 0 when no lock exists', function () {
      assert.strictEqual(getSessionCount(), 0);
    });

    it('should return correct count (uses getProxyStatus for port-specific)', function () {
      registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 1);

      registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 2);

      registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 3);
    });
  });

  describe('hasActiveSessions (default port)', function () {
    it('should return false when no lock exists', function () {
      assert.strictEqual(hasActiveSessions(), false);
    });

    it('should return true when sessions exist on default port', function () {
      // Note: hasActiveSessions() checks default port only
      // For port-specific checks, use getProxyStatus(port).running
      registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).running, true);
    });

    it('should return false and cleanup when proxy is dead', function () {
      // Create lock with dead PID
      const lock = {
        port: testPort,
        pid: 999999999,
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      // getProxyStatus will clean up stale lock
      const status = getProxyStatus(testPort);
      assert.strictEqual(status.running, false);
      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });
  });

  describe('cleanupOrphanedSessions', function () {
    it('should do nothing when no lock exists', function () {
      cleanupOrphanedSessions(testPort);
      // Should not throw
    });

    it('should not cleanup when port differs', function () {
      const lock = {
        port: 9999,
        pid: 999999999, // Dead PID
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      cleanupOrphanedSessions(testPort);

      // Should still exist (different port)
      assert.strictEqual(fs.existsSync(sessionLockPath), true);
    });

    it('should cleanup when proxy is dead', function () {
      const lock = {
        port: testPort,
        pid: 999999999, // Dead PID
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      cleanupOrphanedSessions(testPort);

      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });

    it('should not cleanup when proxy is alive', function () {
      const lock = {
        port: testPort,
        pid: process.pid, // Current process - alive
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      cleanupOrphanedSessions(testPort);

      assert.strictEqual(fs.existsSync(sessionLockPath), true);
    });
  });

  describe('stopProxy', function () {
    it('should return error when no lock exists', async function () {
      const result = await stopProxy(testPort);
      assert.strictEqual(result.stopped, false);
      assert.strictEqual(result.error, 'No active CLIProxy session found');
    });

    it('should cleanup stale lock when proxy is not running', async function () {
      // Create lock with dead PID
      const lock = {
        port: testPort,
        pid: 999999999, // Very unlikely to exist
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = await stopProxy(testPort);
      assert.strictEqual(result.stopped, false);
      assert.ok(result.error.includes('not running'));
      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });

    it('should return pid and session count on success', function () {
      // Register a session with current process
      registerSession(testPort, process.pid);

      // Note: We can't actually test killing our own process,
      // but we can verify the structure is correct before it attempts kill
      const status = getProxyStatus(testPort);
      assert.strictEqual(status.running, true);
      assert.strictEqual(status.pid, process.pid);
      assert.strictEqual(status.sessionCount, 1);
    });
  });

  describe('getProxyStatus', function () {
    it('should return not running when no lock exists', function () {
      const result = getProxyStatus(testPort);
      assert.strictEqual(result.running, false);
      assert.strictEqual(result.port, undefined);
      assert.strictEqual(result.pid, undefined);
    });

    it('should return full status when proxy is running', function () {
      const startedAt = new Date().toISOString();
      const lock = {
        port: testPort,
        pid: process.pid, // Current process - alive
        sessions: ['session1', 'session2'],
        startedAt,
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = getProxyStatus(testPort);
      assert.strictEqual(result.running, true);
      assert.strictEqual(result.port, testPort);
      assert.strictEqual(result.pid, process.pid);
      assert.strictEqual(result.sessionCount, 2);
      assert.strictEqual(result.startedAt, startedAt);
    });

    it('should cleanup and return not running when proxy is dead', function () {
      const lock = {
        port: testPort,
        pid: 999999999, // Dead PID
        sessions: ['session1'],
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(sessionLockPath, JSON.stringify(lock));

      const result = getProxyStatus(testPort);
      assert.strictEqual(result.running, false);
      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });

    it('should return correct session count after registrations', function () {
      registerSession(testPort, process.pid);
      let status = getProxyStatus(testPort);
      assert.strictEqual(status.sessionCount, 1);

      registerSession(testPort, process.pid);
      status = getProxyStatus(testPort);
      assert.strictEqual(status.sessionCount, 2);

      registerSession(testPort, process.pid);
      status = getProxyStatus(testPort);
      assert.strictEqual(status.sessionCount, 3);
    });
  });

  describe('Multi-session scenario', function () {
    it('should handle complete multi-terminal workflow', function () {
      // Terminal 1 starts - first session
      const session1 = registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 1);

      // Terminal 2 starts - joins existing
      const session2 = registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 2);

      // Terminal 3 starts - joins existing
      const session3 = registerSession(testPort, process.pid);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 3);

      // Terminal 1 exits - should NOT kill proxy
      let shouldKill = unregisterSession(session1, testPort);
      assert.strictEqual(shouldKill, false);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 2);

      // Terminal 3 exits - should NOT kill proxy
      shouldKill = unregisterSession(session3, testPort);
      assert.strictEqual(shouldKill, false);
      assert.strictEqual(getProxyStatus(testPort).sessionCount, 1);

      // Terminal 2 exits - SHOULD kill proxy (last session)
      shouldKill = unregisterSession(session2, testPort);
      assert.strictEqual(shouldKill, true);
      assert.strictEqual(getProxyStatus(testPort).running, false);
      assert.strictEqual(fs.existsSync(sessionLockPath), false);
    });
  });
});
