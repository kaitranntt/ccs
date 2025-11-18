'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * ClaudeSymlinkManager - Manages selective symlinks from ~/.ccs/.claude/ to ~/.claude/
 * v4.1.0: Selective symlinking for CCS items
 *
 * Purpose: Ship CCS items (.claude/) with package and symlink them to user's ~/.claude/
 * Architecture:
 *   - ~/.ccs/.claude/* (source, ships with CCS)
 *   - ~/.claude/* (target, gets selective symlinks)
 *   - ~/.ccs/shared/ (UNTOUCHED, existing profile mechanism)
 *
 * Symlink Chain:
 *   profile -> ~/.ccs/shared/ -> ~/.claude/ (which has symlinks to ~/.ccs/.claude/)
 */
class ClaudeSymlinkManager {
  constructor() {
    this.homeDir = os.homedir();
    this.ccsClaudeDir = path.join(this.homeDir, '.ccs', '.claude');
    this.userClaudeDir = path.join(this.homeDir, '.claude');

    // CCS items to symlink (selective, item-level)
    this.ccsItems = [
      { source: 'commands/ccs', target: 'commands/ccs', type: 'directory' },
      { source: 'skills/ccs-delegation', target: 'skills/ccs-delegation', type: 'directory' },
      { source: 'agents/ccs-delegator.md', target: 'agents/ccs-delegator.md', type: 'file' }
    ];
  }

  /**
   * Install CCS items to user's ~/.claude/ via selective symlinks
   * Safe: backs up existing files before creating symlinks
   */
  install() {
    // Ensure ~/.ccs/.claude/ exists (should be shipped with package)
    if (!fs.existsSync(this.ccsClaudeDir)) {
      console.log('[!] CCS .claude/ directory not found, skipping symlink installation');
      return;
    }

    // Create ~/.claude/ if missing
    if (!fs.existsSync(this.userClaudeDir)) {
      console.log('[i] Creating ~/.claude/ directory');
      fs.mkdirSync(this.userClaudeDir, { recursive: true, mode: 0o700 });
    }

    // Install each CCS item
    for (const item of this.ccsItems) {
      this._installItem(item);
    }

    console.log('[OK] Delegation commands and skills installed to ~/.claude/');
  }

  /**
   * Install a single CCS item with conflict handling
   * @param {Object} item - Item descriptor {source, target, type}
   * @private
   */
  _installItem(item) {
    const sourcePath = path.join(this.ccsClaudeDir, item.source);
    const targetPath = path.join(this.userClaudeDir, item.target);
    const targetDir = path.dirname(targetPath);

    // Ensure source exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`[!] Source not found: ${item.source}, skipping`);
      return;
    }

    // Create target parent directory if needed
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    }

    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      // Check if it's already the correct symlink
      if (this._isOurSymlink(targetPath, sourcePath)) {
        return; // Already correct, skip
      }

      // Backup existing file/directory
      this._backupItem(targetPath);
    }

    // Create symlink
    try {
      const symlinkType = item.type === 'directory' ? 'dir' : 'file';
      fs.symlinkSync(sourcePath, targetPath, symlinkType);
      console.log(`[OK] Symlinked ${item.target}`);
    } catch (err) {
      // Windows fallback: stub for now, full implementation in v4.2
      if (process.platform === 'win32') {
        console.log(`[!] Symlink failed for ${item.target} (Windows fallback deferred to v4.2)`);
        console.log(`[i] Enable Developer Mode or wait for next update`);
      } else {
        console.log(`[!] Failed to symlink ${item.target}: ${err.message}`);
      }
    }
  }

  /**
   * Check if target is already the correct symlink pointing to source
   * @param {string} targetPath - Target path to check
   * @param {string} expectedSource - Expected source path
   * @returns {boolean} True if target is correct symlink
   * @private
   */
  _isOurSymlink(targetPath, expectedSource) {
    try {
      const stats = fs.lstatSync(targetPath);

      if (!stats.isSymbolicLink()) {
        return false;
      }

      const actualTarget = fs.readlinkSync(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), actualTarget);

      return resolvedTarget === expectedSource;
    } catch (err) {
      return false;
    }
  }

  /**
   * Backup existing item before replacing with symlink
   * @param {string} itemPath - Path to item to backup
   * @private
   */
  _backupItem(itemPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupPath = `${itemPath}.backup-${timestamp}`;

    try {
      // If backup already exists, use counter
      let finalBackupPath = backupPath;
      let counter = 1;
      while (fs.existsSync(finalBackupPath)) {
        finalBackupPath = `${backupPath}-${counter}`;
        counter++;
      }

      fs.renameSync(itemPath, finalBackupPath);
      console.log(`[i] Backed up existing item to ${path.basename(finalBackupPath)}`);
    } catch (err) {
      console.log(`[!] Failed to backup ${itemPath}: ${err.message}`);
      throw err; // Don't proceed if backup fails
    }
  }

  /**
   * Uninstall CCS items from ~/.claude/ (remove symlinks only)
   * Safe: only removes items that are CCS symlinks
   */
  uninstall() {
    let removed = 0;

    for (const item of this.ccsItems) {
      const targetPath = path.join(this.userClaudeDir, item.target);
      const sourcePath = path.join(this.ccsClaudeDir, item.source);

      // Only remove if it's our symlink
      if (fs.existsSync(targetPath) && this._isOurSymlink(targetPath, sourcePath)) {
        try {
          fs.unlinkSync(targetPath);
          console.log(`[OK] Removed ${item.target}`);
          removed++;
        } catch (err) {
          console.log(`[!] Failed to remove ${item.target}: ${err.message}`);
        }
      }
    }

    if (removed > 0) {
      console.log(`[OK] Removed ${removed} delegation commands and skills from ~/.claude/`);
    } else {
      console.log('[i] No delegation commands or skills to remove');
    }
  }

  /**
   * Check symlink health and report issues
   * Used by 'ccs doctor' command
   * @returns {Object} Health check results {healthy: boolean, issues: string[]}
   */
  checkHealth() {
    const issues = [];
    let healthy = true;

    // Check if ~/.ccs/.claude/ exists
    if (!fs.existsSync(this.ccsClaudeDir)) {
      issues.push('CCS .claude/ directory missing (reinstall CCS)');
      healthy = false;
      return { healthy, issues };
    }

    // Check each item
    for (const item of this.ccsItems) {
      const sourcePath = path.join(this.ccsClaudeDir, item.source);
      const targetPath = path.join(this.userClaudeDir, item.target);

      // Check source exists
      if (!fs.existsSync(sourcePath)) {
        issues.push(`Source missing: ${item.source}`);
        healthy = false;
        continue;
      }

      // Check target
      if (!fs.existsSync(targetPath)) {
        issues.push(`Not installed: ${item.target} (run 'ccs update' to install)`);
        healthy = false;
      } else if (!this._isOurSymlink(targetPath, sourcePath)) {
        issues.push(`Not a CCS symlink: ${item.target} (run 'ccs update' to fix)`);
        healthy = false;
      }
    }

    return { healthy, issues };
  }

  /**
   * Sync delegation commands and skills to ~/.claude/ (used by 'ccs sync' command)
   * Same as install() but with explicit sync message
   */
  sync() {
    console.log('[i] Syncing delegation commands and skills to ~/.claude/...');
    this.install();
  }
}

module.exports = ClaudeSymlinkManager;
