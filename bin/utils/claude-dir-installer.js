#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ora = require('ora');
const { colored } = require('./helpers');

/**
 * ClaudeDirInstaller - Manages copying .claude/ directory from package to ~/.ccs/.claude/
 * v4.1.1: Fix for npm install not copying .claude/ directory
 */
class ClaudeDirInstaller {
  constructor() {
    this.homeDir = os.homedir();
    this.ccsClaudeDir = path.join(this.homeDir, '.ccs', '.claude');
  }

  /**
   * Copy .claude/ directory from package to ~/.ccs/.claude/
   * @param {string} packageDir - Package installation directory (default: auto-detect)
   * @param {boolean} silent - Suppress spinner output
   */
  install(packageDir, silent = false) {
    const spinner = silent ? null : ora('Copying .claude/ items to ~/.ccs/.claude/').start();

    try {
      // Auto-detect package directory if not provided
      if (!packageDir) {
        // Try to find package root by going up from this file
        packageDir = path.join(__dirname, '..', '..');
      }

      const packageClaudeDir = path.join(packageDir, '.claude');

      if (!fs.existsSync(packageClaudeDir)) {
        const msg = 'Package .claude/ directory not found';
        if (spinner) {
          spinner.warn(`[!] ${msg}`);
          console.log(`    Searched in: ${packageClaudeDir}`);
          console.log('    This may be a development installation');
        } else {
          console.log(`[!] ${msg}`);
          console.log(`    Searched in: ${packageClaudeDir}`);
          console.log('    This may be a development installation');
        }
        return false;
      }

      // Remove old version before copying new one
      if (fs.existsSync(this.ccsClaudeDir)) {
        if (spinner) spinner.text = 'Removing old .claude/ items...';
        fs.rmSync(this.ccsClaudeDir, { recursive: true, force: true });
      }

      // Use fs.cpSync for recursive copy (Node.js 16.7.0+)
      // Fallback to manual copy for older Node.js versions
      if (spinner) spinner.text = 'Copying .claude/ items...';

      if (fs.cpSync) {
        fs.cpSync(packageClaudeDir, this.ccsClaudeDir, { recursive: true });
      } else {
        // Fallback for Node.js < 16.7.0
        this._copyDirRecursive(packageClaudeDir, this.ccsClaudeDir);
      }

      // Count files and directories
      const itemCount = this._countItems(this.ccsClaudeDir);
      const msg = `Copied .claude/ items (${itemCount.files} files, ${itemCount.dirs} directories)`;

      if (spinner) {
        spinner.succeed(colored('[OK]', 'green') + ` ${msg}`);
      } else {
        console.log(`[OK] ${msg}`);
      }
      return true;
    } catch (err) {
      const msg = `Failed to copy .claude/ directory: ${err.message}`;
      if (spinner) {
        spinner.fail(colored('[!]', 'yellow') + ` ${msg}`);
        console.warn('    CCS items may not be available');
      } else {
        console.warn(`[!] ${msg}`);
        console.warn('    CCS items may not be available');
      }
      return false;
    }
  }

  /**
   * Recursively copy directory (fallback for Node.js < 16.7.0)
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   * @private
   */
  _copyDirRecursive(src, dest) {
    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Read source directory
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        this._copyDirRecursive(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Count files and directories in a path
   * @param {string} dirPath - Directory to count
   * @returns {Object} { files: number, dirs: number }
   * @private
   */
  _countItems(dirPath) {
    let files = 0;
    let dirs = 0;

    const countRecursive = (p) => {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs++;
          countRecursive(path.join(p, entry.name));
        } else {
          files++;
        }
      }
    };

    try {
      countRecursive(dirPath);
    } catch (e) {
      // Ignore errors
    }

    return { files, dirs };
  }

  /**
   * Check if ~/.ccs/.claude/ exists and is valid
   * @returns {boolean} True if directory exists
   */
  isInstalled() {
    return fs.existsSync(this.ccsClaudeDir);
  }
}

module.exports = ClaudeDirInstaller;
