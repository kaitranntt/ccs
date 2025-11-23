#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Make ora optional (might not be available during npm install postinstall)
// ora v9+ is an ES module, need to use .default for CommonJS
let ora = null;
try {
  const oraModule = require('ora');
  ora = oraModule.default || oraModule;
} catch (e) {
  // ora not available, create fallback spinner that uses console.log
  ora = function(text) {
    return {
      start: () => ({
        succeed: (msg) => console.log(msg || `[OK] ${text}`),
        fail: (msg) => console.log(msg || `[X] ${text}`),
        warn: (msg) => console.log(msg || `[!] ${text}`),
        info: (msg) => console.log(msg || `[i] ${text}`),
        text: ''
      })
    };
  };
}

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
    const spinner = (silent || !ora) ? null : ora('Copying .claude/ items to ~/.ccs/.claude/').start();

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
   * Clean up deprecated files from previous installations
   * Removes ccs-delegator.md that was deprecated in v4.3.2
   * @param {boolean} silent - Suppress console output
   */
  cleanupDeprecated(silent = false) {
    const deprecatedFile = path.join(this.ccsClaudeDir, 'agents', 'ccs-delegator.md');
    const userSymlinkFile = path.join(this.homeDir, '.claude', 'agents', 'ccs-delegator.md');
    const migrationMarker = path.join(this.homeDir, '.ccs', '.migrations', 'v435-delegator-cleanup');

    let cleanedFiles = [];

    try {
      // Check if cleanup already done
      if (fs.existsSync(migrationMarker)) {
        return { success: true, cleanedFiles: [] }; // Already cleaned
      }

      // Clean up user symlink in ~/.claude/agents/ccs-delegator.md FIRST
      // This ensures we can detect broken symlinks before deleting the target
      try {
        const userStats = fs.lstatSync(userSymlinkFile);
        if (userStats.isSymbolicLink()) {
          fs.unlinkSync(userSymlinkFile);
          cleanedFiles.push('user symlink');
        } else {
          // It's not a symlink (user created their own file), backup it
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
          const backupPath = `${userSymlinkFile}.backup-${timestamp}`;
          fs.renameSync(userSymlinkFile, backupPath);
          if (!silent) console.log(`[i] Backed up user file to ${path.basename(backupPath)}`);
          cleanedFiles.push('user file (backed up)');
        }
      } catch (err) {
        // File doesn't exist or other error - that's okay
        if (err.code !== 'ENOENT' && !silent) {
          console.log(`[!] Failed to remove user symlink: ${err.message}`);
        }
      }

      // Clean up package copy in ~/.ccs/.claude/agents/ccs-delegator.md
      if (fs.existsSync(deprecatedFile)) {
        try {
          // Check if file was modified by user (compare with expected content)
          const shouldBackup = this._shouldBackupDeprecatedFile(deprecatedFile);

          if (shouldBackup) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const backupPath = `${deprecatedFile}.backup-${timestamp}`;
            fs.renameSync(deprecatedFile, backupPath);
            if (!silent) console.log(`[i] Backed up modified deprecated file to ${path.basename(backupPath)}`);
          } else {
            fs.rmSync(deprecatedFile, { force: true });
          }
          cleanedFiles.push('package copy');
        } catch (err) {
          if (!silent) console.log(`[!] Failed to remove package copy: ${err.message}`);
        }
      }

      // Create migration marker
      if (cleanedFiles.length > 0) {
        const migrationsDir = path.dirname(migrationMarker);
        if (!fs.existsSync(migrationsDir)) {
          fs.mkdirSync(migrationsDir, { recursive: true, mode: 0o700 });
        }
        fs.writeFileSync(migrationMarker, new Date().toISOString());

        if (!silent) {
          console.log(`[OK] Cleaned up deprecated agent files: ${cleanedFiles.join(', ')}`);
        }
      }

      return { success: true, cleanedFiles };
    } catch (err) {
      if (!silent) console.log(`[!] Cleanup failed: ${err.message}`);
      return { success: false, error: err.message, cleanedFiles };
    }
  }

  /**
   * Check if deprecated file should be backed up (user modified)
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file should be backed up
   * @private
   */
  _shouldBackupDeprecatedFile(filePath) {
    try {
      // Simple heuristic: if file size differs significantly from expected, assume user modified
      // Expected size for ccs-delegator.md was around 2-3KB
      const stats = fs.statSync(filePath);
      const expectedMinSize = 1000; // 1KB minimum
      const expectedMaxSize = 10000; // 10KB maximum

      // If size is outside expected range, likely user modified
      return stats.size < expectedMinSize || stats.size > expectedMaxSize;
    } catch (err) {
      // If we can't determine, err on side of caution and backup
      return true;
    }
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
