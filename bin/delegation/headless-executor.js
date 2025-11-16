#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { SessionManager } = require('./session-manager');
const { SettingsParser } = require('./settings-parser');

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
   * @param {number} options.timeout - Timeout in milliseconds (default: 600000 = 10 minutes)
   * @param {string} options.outputFormat - Output format: 'json' or 'text' (default: 'json')
   * @param {string} options.permissionMode - Permission mode: 'default', 'plan', 'acceptEdits', 'bypassPermissions' (default: 'acceptEdits')
   * @param {boolean} options.resumeSession - Resume last session for profile (default: false)
   * @param {string} options.sessionId - Specific session ID to resume
   * @returns {Promise<Object>} Execution result
   */
  static async execute(profile, enhancedPrompt, options = {}) {
    const {
      cwd = process.cwd(),
      timeout = 600000, // 10 minutes default
      outputFormat = 'json',
      permissionMode = 'acceptEdits',
      resumeSession = false,
      sessionId = null
    } = options;

    // Validate permission mode
    this._validatePermissionMode(permissionMode);

    // Initialize session manager
    const sessionMgr = new SessionManager();

    // Detect Claude CLI path
    const claudeCli = this._detectClaudeCli();
    if (!claudeCli) {
      throw new Error('Claude CLI not found in PATH. Install from: https://docs.claude.com/en/docs/claude-code/installation');
    }

    // Get settings path for profile
    const settingsPath = path.join(os.homedir(), '.ccs', `${profile}.settings.json`);

    // Validate settings file exists
    if (!fs.existsSync(settingsPath)) {
      throw new Error(`Settings file not found: ${settingsPath}\nProfile "${profile}" may not be configured.`);
    }

    // Wrap prompt with safety instructions to prevent modifying infrastructure
    const safePrompt = `IMPORTANT: Do not modify any files in the .claude/ directory. This directory contains Claude Code infrastructure and should never be touched by delegated tasks.

${enhancedPrompt}`;

    // Prepare arguments
    const args = ['-p', safePrompt, '--settings', settingsPath];

    // Add JSON output format if requested
    if (outputFormat === 'json') {
      args.push('--output-format', 'json');
    }

    // Add permission mode
    if (permissionMode && permissionMode !== 'default') {
      if (permissionMode === 'bypassPermissions') {
        args.push('--dangerously-skip-permissions');
        // Warn about dangerous mode
        if (process.env.CCS_DEBUG) {
          console.warn('[!] WARNING: Using --dangerously-skip-permissions mode');
          console.warn('[!] This bypasses ALL permission checks. Use only in trusted environments.');
        }
      } else {
        args.push('--permission-mode', permissionMode);
      }
    }

    // Add resume flag for multi-turn sessions
    if (resumeSession) {
      const lastSession = sessionMgr.getLastSession(profile);

      if (lastSession) {
        args.push('--resume', lastSession.sessionId);
        if (process.env.CCS_DEBUG) {
          console.error(`[i] Resuming session: ${lastSession.sessionId} (${lastSession.turns} turns, $${lastSession.totalCost.toFixed(4)})`);
        }
      } else if (sessionId) {
        args.push('--resume', sessionId);
        if (process.env.CCS_DEBUG) {
          console.error(`[i] Resuming specific session: ${sessionId}`);
        }
      } else {
        console.warn('[!] No previous session found, starting new session');
      }
    } else if (sessionId) {
      args.push('--resume', sessionId);
      if (process.env.CCS_DEBUG) {
        console.error(`[i] Resuming specific session: ${sessionId}`);
      }
    }

    // Add tool restrictions from settings
    const toolRestrictions = SettingsParser.parseToolRestrictions(cwd);

    if (toolRestrictions.allowedTools.length > 0) {
      args.push('--allowedTools');
      toolRestrictions.allowedTools.forEach(tool => args.push(tool));
    }

    if (toolRestrictions.disallowedTools.length > 0) {
      args.push('--disallowedTools');
      toolRestrictions.disallowedTools.forEach(tool => args.push(tool));
    }

    // Note: No max-turns limit - using time-based limits instead (default 10min timeout)

    // Debug log args
    if (process.env.CCS_DEBUG) {
      console.error(`[i] Claude CLI args: ${args.join(' ')}`);
    }

    // Execute with spawn
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Only show progress if in a TTY (terminal) and not in quiet mode
      // This prevents messy output when run through Claude Code's Bash tool
      const showProgress = process.stderr.isTTY && !process.env.CCS_QUIET;

      // Show initial progress message
      if (showProgress) {
        const modelName = profile === 'glm' ? 'GLM-4.6' : profile === 'kimi' ? 'Kimi' : profile.toUpperCase();
        console.error(`[i] Delegating to ${modelName}...`);
      }

      const proc = spawn(claudeCli, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';
      let progressInterval;

      // Progress indicator (show elapsed time every 5 seconds)
      if (showProgress) {
        progressInterval = setInterval(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stderr.write(`[i] Still running... ${elapsed}s elapsed\r`);
        }, 5000);
      }

      // Capture stdout (JSON output)
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Stream stderr in real-time (progress messages from Claude CLI)
      proc.stderr.on('data', (data) => {
        const stderrText = data.toString();
        stderr += stderrText;

        // Show stderr in real-time if in TTY
        if (showProgress) {
          // Clear progress line before showing stderr
          if (progressInterval) {
            process.stderr.write('\r\x1b[K'); // Clear line
          }
          process.stderr.write(stderrText);
        }
      });

      // Handle completion
      proc.on('close', (exitCode) => {
        const duration = Date.now() - startTime;

        // Clear progress indicator
        if (progressInterval) {
          clearInterval(progressInterval);
          process.stderr.write('\r\x1b[K'); // Clear line
        }

        // Show completion message
        if (showProgress) {
          const durationSec = (duration / 1000).toFixed(1);
          if (timedOut) {
            console.error(`[i] Execution timed out after ${durationSec}s`);
          } else {
            console.error(`[i] Execution completed in ${durationSec}s`);
          }
          console.error(''); // Blank line before formatted output
        }

        const result = {
          exitCode,
          stdout,
          stderr,
          cwd,
          profile,
          duration,
          timedOut,
          success: exitCode === 0 && !timedOut
        };

        // Parse JSON output if format is JSON
        if (outputFormat === 'json' && stdout.trim()) {
          try {
            const jsonData = JSON.parse(stdout);

            // Add parsed JSON fields
            result.json = jsonData;
            result.sessionId = jsonData.session_id || null;
            result.totalCost = jsonData.total_cost_usd || 0;
            result.numTurns = jsonData.num_turns || 0;
            result.isError = jsonData.is_error || false;
            result.content = jsonData.result || '';
            result.type = jsonData.type || null;
            result.subtype = jsonData.subtype || null;
            result.durationApi = jsonData.duration_api_ms || 0;
            result.permissionDenials = jsonData.permission_denials || [];
            result.errors = jsonData.errors || [];
            result.modelUsage = jsonData.modelUsage || null;
          } catch (parseError) {
            // Fallback to text mode on parse error
            result.jsonParseError = parseError.message;
            result.content = stdout;

            // Log parse error in debug mode
            if (process.env.CCS_DEBUG) {
              console.error(`[!] JSON parse failed: ${parseError.message}`);
              console.error(`[!] Raw stdout: ${stdout.substring(0, 200)}...`);
            }
          }
        } else {
          // Text mode
          result.content = stdout;
        }

        // Store or update session if we have session ID (even on timeout, for :continue support)
        if (result.sessionId && outputFormat === 'json') {
          if (resumeSession || sessionId) {
            // Update existing session
            sessionMgr.updateSession(profile, result.sessionId, {
              totalCost: result.totalCost
            });
          } else {
            // Store new session
            sessionMgr.storeSession(profile, {
              sessionId: result.sessionId,
              totalCost: result.totalCost,
              cwd: result.cwd
            });
          }

          // Cleanup expired sessions periodically
          if (Math.random() < 0.1) { // 10% chance
            sessionMgr.cleanupExpired();
          }
        }

        resolve(result);
      });

      // Handle errors
      proc.on('error', (error) => {
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        reject(new Error(`Failed to execute Claude CLI: ${error.message}`));
      });

      // Handle timeout with graceful SIGTERM then forceful SIGKILL
      let timedOut = false;
      if (timeout > 0) {
        const timeoutHandle = setTimeout(() => {
          if (!proc.killed) {
            timedOut = true;

            if (progressInterval) {
              clearInterval(progressInterval);
              process.stderr.write('\r\x1b[K'); // Clear line
            }

            if (process.env.CCS_DEBUG) {
              console.error(`[!] Timeout reached after ${timeout}ms, sending SIGTERM for graceful shutdown...`);
            }

            // Send SIGTERM for graceful shutdown
            proc.kill('SIGTERM');

            // If process doesn't terminate within 10s, force kill
            setTimeout(() => {
              if (!proc.killed) {
                if (process.env.CCS_DEBUG) {
                  console.error(`[!] Process did not terminate gracefully, sending SIGKILL...`);
                }
                proc.kill('SIGKILL');
              }
            }, 10000); // Give 10s for graceful shutdown instead of 5s
          }
        }, timeout);

        // Clear timeout on successful completion
        proc.on('close', () => clearTimeout(timeoutHandle));
      }
    });
  }

  /**
   * Validate permission mode
   * @param {string} mode - Permission mode
   * @throws {Error} If mode is invalid
   * @private
   */
  static _validatePermissionMode(mode) {
    const VALID_MODES = ['default', 'plan', 'acceptEdits', 'bypassPermissions'];
    if (!VALID_MODES.includes(mode)) {
      throw new Error(
        `Invalid permission mode: "${mode}". Valid modes: ${VALID_MODES.join(', ')}`
      );
    }
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
