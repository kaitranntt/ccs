#!/usr/bin/env node
'use strict';

/**
 * Test Environment Isolation
 *
 * Provides isolated ~/.ccs/ directory for tests to prevent
 * interference with the user's actual CCS configuration.
 *
 * Usage:
 *   const { createTestEnvironment } = require('../fixtures/test-environment');
 *
 *   describe('my tests', () => {
 *     let testEnv;
 *
 *     before(() => {
 *       testEnv = createTestEnvironment();
 *     });
 *
 *     after(() => {
 *       testEnv.cleanup();
 *     });
 *
 *     it('test something', () => {
 *       // Tests run with CCS_HOME pointing to temp directory
 *       // Your test code here
 *     });
 *   });
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let bootstrappedTestHome;
const originalHomedir = os.homedir;
let homedirPatched = false;
const trackedTestHomes = new Set();
let exitCleanupRegistered = false;
let bunAfterAllRegistered = false;

function cleanupTrackedTestHomes() {
  for (const dir of [...trackedTestHomes]) {
    trackedTestHomes.delete(dir);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors during exit/test-runner teardown.
    }
  }
}

function registerCleanupHandlers() {
  if (!exitCleanupRegistered) {
    exitCleanupRegistered = true;
    process.once('exit', cleanupTrackedTestHomes);
  }

  if (!bunAfterAllRegistered) {
    try {
      const bunTest = require('bun:test');
      if (bunTest && typeof bunTest.afterAll === 'function') {
        bunTest.afterAll(cleanupTrackedTestHomes);
        bunAfterAllRegistered = true;
      }
    } catch {
      // Not running inside the Bun test runner (e.g. Node or standalone Bun script).
    }
  }
}

function getEffectiveTestHome() {
  return process.env.CCS_HOME || process.env.HOME || process.env.USERPROFILE || bootstrappedTestHome || originalHomedir();
}

function patchHomedirForTests() {
  if (homedirPatched) {
    return;
  }

  os.homedir = () => getEffectiveTestHome();
  homedirPatched = true;
}

function createIsolatedTestHome(prefix = 'ccs-test-home-') {
  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(testHome, '.ccs'), { recursive: true });
  fs.mkdirSync(path.join(testHome, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(testHome, '.config'), { recursive: true });
  fs.mkdirSync(path.join(testHome, '.cache'), { recursive: true });
  fs.mkdirSync(path.join(testHome, '.state'), { recursive: true });
  return testHome;
}

function ensureGlobalTestEnvironment() {
  if (bootstrappedTestHome) {
    return bootstrappedTestHome;
  }

  const testHome = createIsolatedTestHome();
  trackedTestHomes.add(testHome);
  registerCleanupHandlers();
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.CCS_HOME = testHome;
  process.env.XDG_CONFIG_HOME = path.join(testHome, '.config');
  process.env.XDG_CACHE_HOME = path.join(testHome, '.cache');
  process.env.XDG_STATE_HOME = path.join(testHome, '.state');
  process.env.CCS_TEST_BOOTSTRAP_HOME = testHome;

  bootstrappedTestHome = testHome;
  patchHomedirForTests();
  return bootstrappedTestHome;
}

/**
 * Create an isolated test environment
 * Sets CCS_HOME to a temporary directory and provides cleanup
 *
 * @returns {object} Test environment with paths and cleanup function
 */
function createTestEnvironment() {
  // Create unique temp directory for this test run
  const testHome = createIsolatedTestHome('ccs-test-');
  trackedTestHomes.add(testHome);
  registerCleanupHandlers();
  const testCcsDir = path.join(testHome, '.ccs');

  // Store original environment
  const originalHome = process.env.HOME;
  const originalCcsHome = process.env.CCS_HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalXdgCacheHome = process.env.XDG_CACHE_HOME;
  const originalXdgStateHome = process.env.XDG_STATE_HOME;

  // Keep HOME-family env vars aligned so code that still consults os.homedir()
  // or XDG defaults stays inside the isolated test sandbox.
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.CCS_HOME = testHome;
  process.env.XDG_CONFIG_HOME = path.join(testHome, '.config');
  process.env.XDG_CACHE_HOME = path.join(testHome, '.cache');
  process.env.XDG_STATE_HOME = path.join(testHome, '.state');
  patchHomedirForTests();

  // Return environment object
  return {
    /** Path to the test home directory (like ~) */
    testHome,

    /** Path to the test .ccs directory (like ~/.ccs) */
    ccsDir: testCcsDir,

    /** Original HOME value for reference */
    originalHome,

    /**
     * Get a path within the test CCS directory
     * @param {...string} parts - Path segments
     * @returns {string} Full path
     */
    getCcsPath(...parts) {
      return path.join(testCcsDir, ...parts);
    },

    /**
     * Create a file in the test CCS directory
     * @param {string} relativePath - Path relative to .ccs/
     * @param {string|object} content - File content (objects are JSON stringified)
     */
    createFile(relativePath, content) {
      const fullPath = path.join(testCcsDir, relativePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
      fs.writeFileSync(fullPath, data);
    },

    /**
     * Read a file from the test CCS directory
     * @param {string} relativePath - Path relative to .ccs/
     * @param {boolean} [asJson=false] - Parse as JSON
     * @returns {string|object} File content
     */
    readFile(relativePath, asJson = false) {
      const fullPath = path.join(testCcsDir, relativePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      return asJson ? JSON.parse(content) : content;
    },

    /**
     * Check if a file exists in the test CCS directory
     * @param {string} relativePath - Path relative to .ccs/
     * @returns {boolean}
     */
    fileExists(relativePath) {
      return fs.existsSync(path.join(testCcsDir, relativePath));
    },

    /**
     * Clean up the test environment and restore original settings
     */
    cleanup() {
      // Restore original environment
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }

      if (originalUserProfile !== undefined) {
        process.env.USERPROFILE = originalUserProfile;
      } else {
        delete process.env.USERPROFILE;
      }

      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }

      if (originalXdgConfigHome !== undefined) {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      } else {
        delete process.env.XDG_CONFIG_HOME;
      }

      if (originalXdgCacheHome !== undefined) {
        process.env.XDG_CACHE_HOME = originalXdgCacheHome;
      } else {
        delete process.env.XDG_CACHE_HOME;
      }

      if (originalXdgStateHome !== undefined) {
        process.env.XDG_STATE_HOME = originalXdgStateHome;
      } else {
        delete process.env.XDG_STATE_HOME;
      }

      // Clean up temp directory
      trackedTestHomes.delete(testHome);
      try {
        fs.rmSync(testHome, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
        console.warn(`[test-environment] Cleanup warning: ${err.message}`);
      }
    }
  };
}

/**
 * Get the CCS home directory (respects CCS_HOME env var)
 * This should be used instead of os.homedir() for CCS paths
 *
 * @returns {string} Home directory path
 */
function getCcsHome() {
  return process.env.CCS_HOME || os.homedir();
}

/**
 * Get the CCS directory path
 *
 * @returns {string} Path to .ccs directory
 */
function getCcsDir() {
  return path.join(getCcsHome(), '.ccs');
}

module.exports = {
  createTestEnvironment,
  ensureGlobalTestEnvironment,
  getCcsHome,
  getCcsDir
};

if (process.env.CCS_TEST_DISABLE_GLOBAL_BOOTSTRAP !== '1') {
  ensureGlobalTestEnvironment();
}
