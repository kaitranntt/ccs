#!/usr/bin/env node
'use strict';

const path = require('path');

/**
 * Formats delegation execution results for display
 * Creates ASCII box output with file change tracking
 */
class ResultFormatter {
  /**
   * Format execution result with complete source-of-truth
   * @param {Object} result - Execution result from HeadlessExecutor
   * @param {string} result.profile - Profile used (glm, kimi, etc.)
   * @param {string} result.cwd - Working directory
   * @param {number} result.exitCode - Exit code
   * @param {string} result.stdout - Standard output
   * @param {string} result.stderr - Standard error
   * @param {number} result.duration - Duration in milliseconds
   * @param {boolean} result.success - Success flag
   * @param {string} result.content - Parsed content (from JSON or stdout)
   * @param {string} result.sessionId - Session ID (from JSON)
   * @param {number} result.totalCost - Total cost USD (from JSON)
   * @param {number} result.numTurns - Number of turns (from JSON)
   * @returns {string} Formatted result
   */
  static format(result) {
    const { profile, cwd, exitCode, stdout, stderr, duration, success, content, sessionId, totalCost, numTurns, subtype, permissionDenials, errors, json, timedOut } = result;

    // Handle timeout (graceful termination)
    if (timedOut) {
      return this._formatTimeoutError(result);
    }

    // Handle legacy max_turns error (Claude CLI might still return this)
    if (subtype === 'error_max_turns') {
      return this._formatTimeoutError(result);
    }

    // Use content field for output (JSON result or fallback stdout)
    const displayOutput = content || stdout;

    // Build formatted output
    let output = '';

    // Header
    output += this._formatHeader(profile, success);

    // Info box (file detection handled by delegated session itself)
    output += this._formatInfoBox(cwd, profile, duration, exitCode, sessionId, totalCost, numTurns);

    // Task output
    output += '\n';
    output += this._formatOutput(displayOutput);

    // Permission denials if present
    if (permissionDenials && permissionDenials.length > 0) {
      output += '\n';
      output += this._formatPermissionDenials(permissionDenials);
    }

    // Errors if present
    if (errors && errors.length > 0) {
      output += '\n';
      output += this._formatErrors(errors);
    }

    // Stderr if present
    if (stderr && stderr.trim()) {
      output += '\n';
      output += this._formatStderr(stderr);
    }

    // Footer
    output += '\n';
    output += this._formatFooter(success, duration);

    return output;
  }

  /**
   * Extract file changes from output
   * @param {string} output - Command output
   * @param {string} cwd - Working directory for filesystem scanning fallback
   * @returns {Object} { created: Array<string>, modified: Array<string> }
   */
  static extractFileChanges(output, cwd) {
    const created = [];
    const modified = [];

    // Patterns to match file operations (case-insensitive)
    const createdPatterns = [
      /created:\s*([^\n\r]+)/gi,
      /create:\s*([^\n\r]+)/gi,
      /wrote:\s*([^\n\r]+)/gi,
      /write:\s*([^\n\r]+)/gi,
      /new file:\s*([^\n\r]+)/gi,
      /generated:\s*([^\n\r]+)/gi,
      /added:\s*([^\n\r]+)/gi
    ];

    const modifiedPatterns = [
      /modified:\s*([^\n\r]+)/gi,
      /update:\s*([^\n\r]+)/gi,
      /updated:\s*([^\n\r]+)/gi,
      /edit:\s*([^\n\r]+)/gi,
      /edited:\s*([^\n\r]+)/gi,
      /changed:\s*([^\n\r]+)/gi
    ];

    // Helper to check if file is infrastructure (should be ignored)
    const isInfrastructure = (filePath) => {
      return filePath.includes('/.claude/') || filePath.startsWith('.claude/');
    };

    // Extract created files
    for (const pattern of createdPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const filePath = match[1].trim();
        if (filePath && !created.includes(filePath) && !isInfrastructure(filePath)) {
          created.push(filePath);
        }
      }
    }

    // Extract modified files
    for (const pattern of modifiedPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const filePath = match[1].trim();
        // Don't include if already in created list or is infrastructure
        if (filePath && !modified.includes(filePath) && !created.includes(filePath) && !isInfrastructure(filePath)) {
          modified.push(filePath);
        }
      }
    }

    // Fallback: Scan filesystem for recently modified files (last 5 minutes)
    if (created.length === 0 && modified.length === 0 && cwd) {
      try {
        const fs = require('fs');
        const childProcess = require('child_process');

        // Use find command to get recently modified files (excluding infrastructure)
        const findCmd = `find . -type f -mmin -5 -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.claude/*" 2>/dev/null | head -20`;
        const result = childProcess.execSync(findCmd, { cwd, encoding: 'utf8', timeout: 5000 });

        const files = result.split('\n').filter(f => f.trim());
        files.forEach(file => {
          const fullPath = path.join(cwd, file);

          // Double-check not infrastructure
          if (isInfrastructure(fullPath)) {
            return;
          }

          try {
            const stats = fs.statSync(fullPath);
            const now = Date.now();
            const mtime = stats.mtimeMs;
            const ctime = stats.ctimeMs;

            // If both mtime and ctime are very recent (within 10 minutes), likely created
            // ctime = inode change time, for new files this is close to creation time
            const isVeryRecent = (now - mtime) < 600000 && (now - ctime) < 600000;
            const timeDiff = Math.abs(mtime - ctime);

            // If mtime and ctime are very close (< 1 second apart) and both recent, it's created
            if (isVeryRecent && timeDiff < 1000) {
              if (!created.includes(fullPath)) {
                created.push(fullPath);
              }
            } else {
              // Otherwise, it's modified
              if (!modified.includes(fullPath)) {
                modified.push(fullPath);
              }
            }
          } catch (statError) {
            // If stat fails, default to created (since we're in fallback mode)
            if (!created.includes(fullPath) && !modified.includes(fullPath)) {
              created.push(fullPath);
            }
          }
        });
      } catch (scanError) {
        // Silently fail if filesystem scan doesn't work
        if (process.env.CCS_DEBUG) {
          console.error(`[!] Filesystem scan failed: ${scanError.message}`);
        }
      }
    }

    return { created, modified };
  }

  /**
   * Format header with delegation indicator
   * @param {string} profile - Profile name
   * @param {boolean} success - Success flag
   * @returns {string} Formatted header
   * @private
   */
  static _formatHeader(profile, success) {
    const modelName = this._getModelDisplayName(profile);
    const icon = success ? '[i]' : '[X]';
    return `${icon} Delegated to ${modelName} (ccs:${profile})\n`;
  }

  /**
   * Format info box with delegation details
   * @param {string} cwd - Working directory
   * @param {string} profile - Profile name
   * @param {number} duration - Duration in ms
   * @param {number} exitCode - Exit code
   * @param {string} sessionId - Session ID (from JSON)
   * @param {number} totalCost - Total cost USD (from JSON)
   * @param {number} numTurns - Number of turns (from JSON)
   * @returns {string} Formatted info box
   * @private
   */
  static _formatInfoBox(cwd, profile, duration, exitCode, sessionId, totalCost, numTurns) {
    const modelName = this._getModelDisplayName(profile);
    const durationSec = (duration / 1000).toFixed(1);

    // Calculate box width (fit longest line + padding)
    const maxWidth = 70;
    const cwdLine = `Working Directory: ${cwd}`;
    const boxWidth = Math.min(Math.max(cwdLine.length + 4, 50), maxWidth);

    const lines = [
      `Working Directory: ${this._truncate(cwd, boxWidth - 22)}`,
      `Model: ${modelName}`,
      `Duration: ${durationSec}s`,
      `Exit Code: ${exitCode}`
    ];

    // Add JSON-specific fields if available
    if (sessionId) {
      // Abbreviate session ID (Git-style first 8 chars) to prevent wrapping
      const shortId = sessionId.length > 8 ? sessionId.substring(0, 8) : sessionId;
      lines.push(`Session ID: ${shortId}`);
    }
    if (totalCost !== undefined && totalCost !== null) {
      lines.push(`Cost: $${totalCost.toFixed(4)}`);
    }
    if (numTurns) {
      lines.push(`Turns: ${numTurns}`);
    }

    let box = '';
    box += '╔' + '═'.repeat(boxWidth - 2) + '╗\n';

    for (const line of lines) {
      const padding = boxWidth - line.length - 4;
      box += '║ ' + line + ' '.repeat(Math.max(0, padding)) + ' ║\n';
    }

    box += '╚' + '═'.repeat(boxWidth - 2) + '╝';

    return box;
  }

  /**
   * Format task output
   * @param {string} output - Standard output
   * @returns {string} Formatted output
   * @private
   */
  static _formatOutput(output) {
    if (!output || !output.trim()) {
      return '[i] No output from delegated task\n';
    }

    return output.trim() + '\n';
  }

  /**
   * Format stderr output
   * @param {string} stderr - Standard error
   * @returns {string} Formatted stderr
   * @private
   */
  static _formatStderr(stderr) {
    return `[!] Stderr:\n${stderr.trim()}\n\n`;
  }

  /**
   * Format file list (created or modified)
   * @param {string} label - Label (Created/Modified)
   * @param {Array<string>} files - File paths
   * @returns {string} Formatted file list
   * @private
   */
  static _formatFileList(label, files) {
    let output = `[i] ${label} Files:\n`;

    for (const file of files) {
      output += `  - ${file}\n`;
    }

    return output;
  }

  /**
   * Format footer with completion status
   * @param {boolean} success - Success flag
   * @param {number} duration - Duration in ms
   * @returns {string} Formatted footer
   * @private
   */
  static _formatFooter(success, duration) {
    const icon = success ? '[OK]' : '[X]';
    const status = success ? 'Delegation completed' : 'Delegation failed';
    return `${icon} ${status}\n`;
  }

  /**
   * Get display name for model profile
   * @param {string} profile - Profile name
   * @returns {string} Display name
   * @private
   */
  static _getModelDisplayName(profile) {
    const displayNames = {
      'glm': 'GLM-4.6',
      'glmt': 'GLM-4.6 (Thinking)',
      'kimi': 'Kimi',
      'default': 'Claude'
    };

    return displayNames[profile] || profile.toUpperCase();
  }

  /**
   * Truncate string to max length
   * @param {string} str - String to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated string
   * @private
   */
  static _truncate(str, maxLength) {
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format minimal result (for quick tasks)
   * @param {Object} result - Execution result
   * @returns {string} Minimal formatted result
   */
  static formatMinimal(result) {
    const { profile, success, duration } = result;
    const modelName = this._getModelDisplayName(profile);
    const icon = success ? '[OK]' : '[X]';
    const durationSec = (duration / 1000).toFixed(1);

    return `${icon} ${modelName} delegation ${success ? 'completed' : 'failed'} (${durationSec}s)\n`;
  }

  /**
   * Format verbose result (with full details)
   * @param {Object} result - Execution result
   * @returns {string} Verbose formatted result
   */
  static formatVerbose(result) {
    const basic = this.format(result);

    // Add additional debug info
    let verbose = basic;
    verbose += '\n=== Debug Information ===\n';
    verbose += `CWD: ${result.cwd}\n`;
    verbose += `Profile: ${result.profile}\n`;
    verbose += `Exit Code: ${result.exitCode}\n`;
    verbose += `Duration: ${result.duration}ms\n`;
    verbose += `Success: ${result.success}\n`;
    verbose += `Stdout Length: ${result.stdout.length} chars\n`;
    verbose += `Stderr Length: ${result.stderr.length} chars\n`;

    return verbose;
  }

  /**
   * Check if NO_COLOR environment variable is set
   * @returns {boolean} True if colors should be disabled
   * @private
   */
  static _shouldDisableColors() {
    return process.env.NO_COLOR !== undefined;
  }

  /**
   * Format timeout error (session exceeded time limit)
   * @param {Object} result - Execution result
   * @returns {string} Formatted timeout error
   * @private
   */
  static _formatTimeoutError(result) {
    const { profile, cwd, duration, sessionId, totalCost, numTurns, permissionDenials } = result;

    let output = '';

    // Header
    output += this._formatHeader(profile, false);

    // Info box
    output += this._formatInfoBox(cwd, profile, duration, 0, sessionId, totalCost, numTurns);

    // Timeout message
    output += '\n';
    const timeoutMin = (duration / 60000).toFixed(1);
    output += `[!] Execution timed out after ${timeoutMin} minutes\n\n`;
    output += 'The delegated session exceeded its time limit before completing the task.\n';
    output += 'Session was gracefully terminated and saved for continuation.\n';

    // Permission denials if present
    if (permissionDenials && permissionDenials.length > 0) {
      output += '\n';
      output += this._formatPermissionDenials(permissionDenials);
      output += '\n';
      output += 'The task may require permissions that were denied.\n';
      output += 'Consider running with --permission-mode bypassPermissions or execute manually.\n';
    }

    // Suggestions
    output += '\n';
    output += 'Suggestions:\n';
    output += `  - Continue session: ccs ${profile}:continue -p "finish the task"\n`;
    output += `  - Increase timeout: ccs ${profile} -p "task" --timeout ${duration * 2}\n`;
    output += '  - Break task into smaller steps\n';
    output += '  - Run task manually in main Claude session\n';

    output += '\n';
    // Abbreviate session ID (Git-style first 8 chars)
    const shortId = sessionId && sessionId.length > 8 ? sessionId.substring(0, 8) : sessionId;
    output += `[i] Session persisted with ID: ${shortId}\n`;
    output += `[i] Cost: $${totalCost.toFixed(4)}\n`;

    return output;
  }

  /**
   * Format permission denials
   * @param {Array<Object>} denials - Permission denial objects
   * @returns {string} Formatted permission denials
   * @private
   */
  static _formatPermissionDenials(denials) {
    let output = '[!] Permission Denials:\n';

    for (const denial of denials) {
      const tool = denial.tool_name || 'Unknown';
      const input = denial.tool_input || {};
      const command = input.command || input.description || JSON.stringify(input);

      output += `  - ${tool}: ${command}\n`;
    }

    return output;
  }

  /**
   * Format errors array
   * @param {Array<Object>} errors - Error objects
   * @returns {string} Formatted errors
   * @private
   */
  static _formatErrors(errors) {
    let output = '[X] Errors:\n';

    for (const error of errors) {
      const message = error.message || error.error || JSON.stringify(error);
      output += `  - ${message}\n`;
    }

    return output;
  }
}

module.exports = { ResultFormatter };
