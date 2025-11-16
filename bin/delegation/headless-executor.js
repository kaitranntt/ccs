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
   * @param {string} options.outputFormat - Output format: 'stream-json' or 'text' (default: 'stream-json')
   * @param {string} options.permissionMode - Permission mode: 'default', 'plan', 'acceptEdits', 'bypassPermissions' (default: 'acceptEdits')
   * @param {boolean} options.resumeSession - Resume last session for profile (default: false)
   * @param {string} options.sessionId - Specific session ID to resume
   * @returns {Promise<Object>} Execution result
   */
  static async execute(profile, enhancedPrompt, options = {}) {
    const {
      cwd = process.cwd(),
      timeout = 600000, // 10 minutes default
      outputFormat = 'stream-json', // Use stream-json for real-time progress
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

    // Smart slash command detection and preservation
    // Detects if prompt contains slash command and restructures for proper execution
    const processedPrompt = this._processSlashCommand(enhancedPrompt);

    // Prepare arguments
    const args = ['-p', processedPrompt, '--settings', settingsPath];

    // Always use stream-json for real-time progress visibility
    // Note: --verbose is required when using --print with stream-json
    args.push('--output-format', 'stream-json', '--verbose');

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

      // Show progress unless explicitly disabled with CCS_QUIET
      const showProgress = !process.env.CCS_QUIET;

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
      const messages = []; // Accumulate stream-json messages
      let partialLine = ''; // Buffer for incomplete JSON lines

      // Handle parent process termination (Ctrl+C or Esc in Claude)
      // When main Claude session is killed, cleanup spawned child process
      const cleanupHandler = () => {
        if (!proc.killed) {
          if (process.env.CCS_DEBUG) {
            console.error('[!] Parent process terminating, killing delegated session...');
          }
          proc.kill('SIGTERM');
          // Force kill if not dead after 2s
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 2000);
        }
      };

      // Register signal handlers for parent process termination
      process.once('SIGINT', cleanupHandler);
      process.once('SIGTERM', cleanupHandler);

      // Cleanup signal handlers when child process exits
      const removeSignalHandlers = () => {
        process.removeListener('SIGINT', cleanupHandler);
        process.removeListener('SIGTERM', cleanupHandler);
      };

      proc.on('close', removeSignalHandlers);
      proc.on('error', removeSignalHandlers);

      // Progress indicator (show elapsed time every 5 seconds)
      if (showProgress) {
        progressInterval = setInterval(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stderr.write(`[i] Still running... ${elapsed}s elapsed\r`);
        }, 5000);
      }

      // Capture stdout (stream-json format - jsonl)
      proc.stdout.on('data', (data) => {
        stdout += data.toString();

        // Parse stream-json messages (jsonl format - one JSON per line)
        const chunk = partialLine + data.toString();
        const lines = chunk.split('\n');
        partialLine = lines.pop() || ''; // Save incomplete line for next chunk

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg = JSON.parse(line);
            messages.push(msg);

            // Show real-time tool use with verbose details
            if (showProgress && msg.type === 'assistant') {
              const toolUses = msg.message?.content?.filter(c => c.type === 'tool_use') || [];

              for (const tool of toolUses) {
                process.stderr.write('\r\x1b[K'); // Clear line

                // Show verbose tool use with description/input if available
                const toolInput = tool.input || {};
                let verboseMsg = `[Tool] ${tool.name}`;

                // Add context based on tool type (all Claude Code tools)
                switch (tool.name) {
                  case 'Bash':
                    if (toolInput.command) {
                      // Truncate long commands
                      const cmd = toolInput.command.length > 80
                        ? toolInput.command.substring(0, 77) + '...'
                        : toolInput.command;
                      verboseMsg += `: ${cmd}`;
                    }
                    break;

                  case 'Edit':
                  case 'Write':
                  case 'Read':
                    if (toolInput.file_path) {
                      verboseMsg += `: ${toolInput.file_path}`;
                    }
                    break;

                  case 'NotebookEdit':
                  case 'NotebookRead':
                    if (toolInput.notebook_path) {
                      verboseMsg += `: ${toolInput.notebook_path}`;
                    }
                    break;

                  case 'Grep':
                    if (toolInput.pattern) {
                      verboseMsg += `: searching for "${toolInput.pattern}"`;
                      if (toolInput.path) {
                        verboseMsg += ` in ${toolInput.path}`;
                      }
                    }
                    break;

                  case 'Glob':
                    if (toolInput.pattern) {
                      verboseMsg += `: ${toolInput.pattern}`;
                    }
                    break;

                  case 'SlashCommand':
                    if (toolInput.command) {
                      verboseMsg += `: ${toolInput.command}`;
                    }
                    break;

                  case 'Task':
                    if (toolInput.description) {
                      verboseMsg += `: ${toolInput.description}`;
                    } else if (toolInput.prompt) {
                      const prompt = toolInput.prompt.length > 60
                        ? toolInput.prompt.substring(0, 57) + '...'
                        : toolInput.prompt;
                      verboseMsg += `: ${prompt}`;
                    }
                    break;

                  case 'TodoWrite':
                    if (toolInput.todos && Array.isArray(toolInput.todos)) {
                      // Show in_progress task instead of just count
                      const inProgressTask = toolInput.todos.find(t => t.status === 'in_progress');
                      if (inProgressTask && inProgressTask.activeForm) {
                        verboseMsg += `: ${inProgressTask.activeForm}`;
                      } else {
                        // Fallback to count if no in_progress task
                        verboseMsg += `: ${toolInput.todos.length} task(s)`;
                      }
                    }
                    break;

                  case 'WebFetch':
                    if (toolInput.url) {
                      verboseMsg += `: ${toolInput.url}`;
                    }
                    break;

                  case 'WebSearch':
                    if (toolInput.query) {
                      verboseMsg += `: "${toolInput.query}"`;
                    }
                    break;

                  default:
                    // For unknown tools, show first meaningful parameter
                    if (Object.keys(toolInput).length > 0) {
                      const firstKey = Object.keys(toolInput)[0];
                      const firstValue = toolInput[firstKey];
                      if (typeof firstValue === 'string' && firstValue.length < 60) {
                        verboseMsg += `: ${firstValue}`;
                      }
                    }
                }

                process.stderr.write(`${verboseMsg}\n`);
              }
            }
          } catch (parseError) {
            // Skip malformed JSON lines (shouldn't happen with stream-json)
            if (process.env.CCS_DEBUG) {
              console.error(`[!] Failed to parse stream-json line: ${parseError.message}`);
            }
          }
        }
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
          success: exitCode === 0 && !timedOut,
          messages // Include all stream-json messages
        };

        // Extract metadata from final 'result' message in stream-json
        const resultMessage = messages.find(m => m.type === 'result');
        if (resultMessage) {
          // Add parsed fields from result message
          result.sessionId = resultMessage.session_id || null;
          result.totalCost = resultMessage.total_cost_usd || 0;
          result.numTurns = resultMessage.num_turns || 0;
          result.isError = resultMessage.is_error || false;
          result.type = resultMessage.type || null;
          result.subtype = resultMessage.subtype || null;
          result.durationApi = resultMessage.duration_api_ms || 0;
          result.permissionDenials = resultMessage.permission_denials || [];
          result.errors = resultMessage.errors || [];

          // Extract content from result message
          result.content = resultMessage.result || '';
        } else {
          // Fallback: no result message found (shouldn't happen)
          result.content = stdout;
          if (process.env.CCS_DEBUG) {
            console.error(`[!] No result message found in stream-json output`);
          }
        }

        // Store or update session if we have session ID (even on timeout, for :continue support)
        if (result.sessionId) {
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
   * Process prompt to detect and preserve slash commands
   * Implements smart enhancement: preserves slash command at start, allows context in rest
   * @param {string} prompt - Original prompt (may contain slash command)
   * @returns {string} Processed prompt with slash command preserved
   * @private
   */
  static _processSlashCommand(prompt) {
    const trimmed = prompt.trim();

    // Case 1: Already starts with slash command - keep as-is
    if (trimmed.match(/^\/[\w:-]+(\s|$)/)) {
      return prompt;
    }

    // Case 2: Find slash command embedded in text
    // Look for /command that's NOT part of a file path
    // File paths: /home/user, /path/to/file (have / before or after)
    // Commands: /cook, /plan (standalone, preceded by space/colon/start)
    // Strategy: Find LAST occurrence that looks like a command, not a path
    const embeddedSlash = trimmed.match(/(?:^|[^\w/])(\/[\w:-]+)(\s+[\s\S]*)?$/);

    if (embeddedSlash) {
      const command = embeddedSlash[1]; // e.g., "/cook"
      const args = (embeddedSlash[2] || '').trim(); // Everything after command

      // Calculate where the command starts (excluding preceding char if any)
      const matchStart = embeddedSlash.index + (embeddedSlash[0][0] === '/' ? 0 : 1);
      const beforeCommand = trimmed.substring(0, matchStart).trim();

      // Restructure: command first, context after
      if (beforeCommand && args) {
        return `${command} ${args}\n\nContext: ${beforeCommand}`;
      } else if (beforeCommand) {
        return `${command}\n\nContext: ${beforeCommand}`;
      }
      return args ? `${command} ${args}` : command;
    }

    // No slash command detected, return as-is
    return prompt;
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
