'use strict';

/**
 * Simple Progress Indicator (no external dependencies)
 *
 * Features:
 * - ASCII-only spinner frames (cross-platform compatible)
 * - TTY detection (no spinners in pipes/logs)
 * - Elapsed time display
 * - CI environment detection
 */

class ProgressIndicator {
  /**
   * Create a progress indicator
   * @param {string} message - Message to display
   * @param {Object} options - Options
   * @param {string[]} options.frames - Spinner frames (default: ASCII)
   * @param {number} options.interval - Frame interval in ms (default: 80)
   */
  constructor(message, options = {}) {
    this.message = message;
    // ASCII-only frames for cross-platform compatibility
    this.frames = options.frames || ['|', '/', '-', '\\'];
    this.frameIndex = 0;
    this.interval = null;
    this.startTime = Date.now();

    // TTY detection: only animate if stderr is TTY and not in CI
    this.isTTY = process.stderr.isTTY === true && !process.env.CI && !process.env.NO_COLOR;
  }

  /**
   * Start the spinner
   */
  start() {
    if (!this.isTTY) {
      // Non-TTY: just print message once
      process.stderr.write(`[i] ${this.message}...\n`);
      return;
    }

    // TTY: animate spinner
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      process.stderr.write(`\r[${frame}] ${this.message}... (${elapsed}s)`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80); // 12.5fps for smooth animation
  }

  /**
   * Stop spinner with success message
   * @param {string} message - Optional success message (defaults to original message)
   */
  succeed(message) {
    this.stop();
    const finalMessage = message || this.message;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    if (this.isTTY) {
      // Clear spinner line and show success
      process.stderr.write(`\r[OK] ${finalMessage} (${elapsed}s)\n`);
    } else {
      // Non-TTY: just show completion
      process.stderr.write(`[OK] ${finalMessage}\n`);
    }
  }

  /**
   * Stop spinner with failure message
   * @param {string} message - Optional failure message (defaults to original message)
   */
  fail(message) {
    this.stop();
    const finalMessage = message || this.message;

    if (this.isTTY) {
      // Clear spinner line and show failure
      process.stderr.write(`\r[X] ${finalMessage}\n`);
    } else {
      // Non-TTY: just show failure
      process.stderr.write(`[X] ${finalMessage}\n`);
    }
  }

  /**
   * Update spinner message (while running)
   * @param {string} newMessage - New message to display
   */
  update(newMessage) {
    this.message = newMessage;
  }

  /**
   * Stop the spinner without showing success/failure
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;

      if (this.isTTY) {
        // Clear the spinner line
        process.stderr.write('\r\x1b[K');
      }
    }
  }
}

module.exports = { ProgressIndicator };
