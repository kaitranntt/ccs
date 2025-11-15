#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Headless executor for Claude CLI delegation
 * Spawns claude with -p flag for single-turn execution
 */
class HeadlessExecutor {
  /**
   * Execute task via headless Claude CLI
   * @param {string} profile - Profile name (glm, kimi, custom)
   * @param {string} enhancedPrompt - Enhanced prompt with context
   * @param {Object} options - Execution options
   * @param {string} options.cwd - Working directory (absolute path)
   * @param {number} options.timeout - Timeout in milliseconds (default: 120000)
   * @returns {Promise<Object>} Execution result
   */
  static async execute(profile, enhancedPrompt, options = {}) {
    const { cwd = process.cwd(), timeout = 120000 } = options;

    // Detect Claude CLI path
    const claudeCli = this._detectClaudeCli();
    if (!claudeCli) {
      throw new Error('Claude CLI not found in PATH. Install from: https://docs.claude.com/en/docs/claude-code/installation');
    }

    // Get settings path for profile
    const settingsPath = path.join(os.homedir(), '.ccs', 'profiles', profile, 'settings.json');

    // Validate settings file exists
    if (!fs.existsSync(settingsPath)) {
      throw new Error(`Settings file not found: ${settingsPath}\nProfile "${profile}" may not be configured.`);
    }

    // Prepare arguments
    const args = ['-p', enhancedPrompt, '--settings', settingsPath];

    // Execute with spawn
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const proc = spawn(claudeCli, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';

      // Capture stdout
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      proc.on('close', (exitCode) => {
        const duration = Date.now() - startTime;

        resolve({
          exitCode,
          stdout,
          stderr,
          cwd,
          profile,
          duration,
          success: exitCode === 0
        });
      });

      // Handle errors
      proc.on('error', (error) => {
        reject(new Error(`Failed to execute Claude CLI: ${error.message}`));
      });

      // Handle timeout with graceful SIGTERM then forceful SIGKILL
      if (timeout > 0) {
        const timeoutHandle = setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGTERM');

            // If process doesn't terminate within 5s, force kill
            setTimeout(() => {
              if (!proc.killed) {
                proc.kill('SIGKILL');
              }
            }, 5000);

            reject(new Error(`Execution timeout after ${timeout}ms`));
          }
        }, timeout);

        // Clear timeout on successful completion
        proc.on('close', () => clearTimeout(timeoutHandle));
      }
    });
  }

  /**
   * Detect Claude CLI executable
   * @returns {string|null} Path to claude CLI or null if not found
   * @private
   */
  static _detectClaudeCli() {
    // Check environment variable override
    if (process.env.CCS_CLAUDE_PATH) {
      return process.env.CCS_CLAUDE_PATH;
    }

    // Try to find in PATH
    const { execSync } = require('child_process');
    try {
      const result = execSync('command -v claude', { encoding: 'utf8' });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Execute with retry logic
   * @param {string} profile - Profile name
   * @param {string} enhancedPrompt - Enhanced prompt
   * @param {Object} options - Execution options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 2)
   * @returns {Promise<Object>} Execution result
   */
  static async executeWithRetry(profile, enhancedPrompt, options = {}) {
    const { maxRetries = 2, ...execOptions } = options;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(profile, enhancedPrompt, execOptions);

        // If successful, return immediately
        if (result.success) {
          return result;
        }

        // If not last attempt, retry
        if (attempt < maxRetries) {
          console.error(`[!] Attempt ${attempt + 1} failed, retrying...`);
          await this._sleep(1000 * (attempt + 1)); // Exponential backoff
          continue;
        }

        // Last attempt failed, return result anyway
        return result;
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          console.error(`[!] Attempt ${attempt + 1} errored: ${error.message}, retrying...`);
          await this._sleep(1000 * (attempt + 1));
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error('Execution failed after all retry attempts');
  }

  /**
   * Sleep utility for retry backoff
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  static _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test if profile is executable (quick health check)
   * @param {string} profile - Profile name
   * @returns {Promise<boolean>} True if profile can execute
   */
  static async testProfile(profile) {
    try {
      const result = await this.execute(profile, 'Say "test successful"', {
        timeout: 10000
      });
      return result.success;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { HeadlessExecutor };
