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
   * @returns {string} Formatted result
   */
  static format(result) {
    const { profile, cwd, exitCode, stdout, stderr, duration, success } = result;

    // Parse file changes from output
    const { created, modified } = this.extractFileChanges(stdout);

    // Build formatted output
    let output = '';

    // Header
    output += this._formatHeader(profile, success);

    // Info box
    output += this._formatInfoBox(cwd, profile, duration, exitCode, created.length, modified.length);

    // Task output
    output += '\n';
    output += this._formatOutput(stdout);

    // Stderr if present
    if (stderr && stderr.trim()) {
      output += '\n';
      output += this._formatStderr(stderr);
    }

    // File lists
    if (created.length > 0) {
      output += '\n';
      output += this._formatFileList('Created', created);
    }

    if (modified.length > 0) {
      output += '\n';
      output += this._formatFileList('Modified', modified);
    }

    // Footer
    output += '\n';
    output += this._formatFooter(success, duration);

    return output;
  }

  /**
   * Extract file changes from output
   * @param {string} output - Command output
   * @returns {Object} { created: Array<string>, modified: Array<string> }
   */
  static extractFileChanges(output) {
    const created = [];
    const modified = [];

    // Patterns to match file operations
    const createdPatterns = [
      /(?:Created|created|CREATE|wrote|Wrote|WRITE):\s*([^\n\r]+)/g,
      /(?:New file|new file|NEW FILE):\s*([^\n\r]+)/g
    ];

    const modifiedPatterns = [
      /(?:Modified|modified|MODIFIED|Updated|updated|UPDATE|Edited|edited|EDIT):\s*([^\n\r]+)/g,
      /(?:Changed|changed|CHANGE):\s*([^\n\r]+)/g
    ];

    // Extract created files
    for (const pattern of createdPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const filePath = match[1].trim();
        if (filePath && !created.includes(filePath)) {
          created.push(filePath);
        }
      }
    }

    // Extract modified files
    for (const pattern of modifiedPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const filePath = match[1].trim();
        // Don't include if already in created list
        if (filePath && !modified.includes(filePath) && !created.includes(filePath)) {
          modified.push(filePath);
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
   * @param {number} createdCount - Number of created files
   * @param {number} modifiedCount - Number of modified files
   * @returns {string} Formatted info box
   * @private
   */
  static _formatInfoBox(cwd, profile, duration, exitCode, createdCount, modifiedCount) {
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
      `Exit Code: ${exitCode}`,
      `Files Created: ${createdCount}`,
      `Files Modified: ${modifiedCount}`
    ];

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
    return `[!] Stderr:\n${stderr.trim()}\n`;
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
}

module.exports = { ResultFormatter };
