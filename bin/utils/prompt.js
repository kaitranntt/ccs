'use strict';

const readline = require('readline');

/**
 * Interactive Prompt Utilities (NO external dependencies)
 *
 * Features:
 * - TTY detection (auto-confirm in non-TTY)
 * - --yes flag support for automation
 * - --no-input flag support for CI
 * - Safe defaults (N for destructive actions)
 * - Input validation with retry
 */

class InteractivePrompt {
  /**
   * Ask for confirmation
   * @param {string} message - Confirmation message
   * @param {Object} options - Options
   * @param {boolean} options.default - Default value (true=Yes, false=No)
   * @returns {Promise<boolean>} User confirmation
   */
  static async confirm(message, options = {}) {
    const { default: defaultValue = false } = options;

    // Check for --yes flag (automation) - always returns true
    if (process.env.CCS_YES === '1' || process.argv.includes('--yes') || process.argv.includes('-y')) {
      return true;
    }

    // Check for --no-input flag (CI)
    if (process.env.CCS_NO_INPUT === '1' || process.argv.includes('--no-input')) {
      throw new Error('Interactive input required but --no-input specified');
    }

    // Non-TTY: use default
    if (!process.stdin.isTTY) {
      return defaultValue;
    }

    // Interactive prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true
    });

    const promptText = defaultValue
      ? `${message} [Y/n]: `
      : `${message} [y/N]: `;

    return new Promise((resolve) => {
      rl.question(promptText, (answer) => {
        rl.close();

        const normalized = answer.trim().toLowerCase();

        // Empty answer: use default
        if (normalized === '') {
          resolve(defaultValue);
          return;
        }

        // Valid answers
        if (normalized === 'y' || normalized === 'yes') {
          resolve(true);
          return;
        }

        if (normalized === 'n' || normalized === 'no') {
          resolve(false);
          return;
        }

        // Invalid input: retry
        console.error('[!] Please answer y or n');
        resolve(InteractivePrompt.confirm(message, options));
      });
    });
  }

  /**
   * Get text input from user
   * @param {string} message - Prompt message
   * @param {Object} options - Options
   * @param {string} options.default - Default value
   * @param {Function} options.validate - Validation function
   * @returns {Promise<string>} User input
   */
  static async input(message, options = {}) {
    const { default: defaultValue = '', validate = null } = options;

    // Non-TTY: use default or error
    if (!process.stdin.isTTY) {
      if (defaultValue) {
        return defaultValue;
      }
      throw new Error('Interactive input required but stdin is not a TTY');
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true
    });

    const promptText = defaultValue
      ? `${message} [${defaultValue}]: `
      : `${message}: `;

    return new Promise((resolve) => {
      rl.question(promptText, (answer) => {
        rl.close();

        const value = answer.trim() || defaultValue;

        // Validate input if validator provided
        if (validate) {
          const error = validate(value);
          if (error) {
            console.error(`[!] ${error}`);
            resolve(InteractivePrompt.input(message, options));
            return;
          }
        }

        resolve(value);
      });
    });
  }
}

module.exports = { InteractivePrompt };
