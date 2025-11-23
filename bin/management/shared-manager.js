'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * SharedManager - Manages symlinked shared directories for CCS
 * v3.2.0: Symlink-based architecture
 *
 * Purpose: Eliminates duplication by symlinking:
 * ~/.claude/ ← ~/.ccs/shared/ ← instance/
 */
class SharedManager {
  constructor() {
    this.homeDir = os.homedir();
    this.sharedDir = path.join(this.homeDir, '.ccs', 'shared');
    this.claudeDir = path.join(this.homeDir, '.claude');
    this.instancesDir = path.join(this.homeDir, '.ccs', 'instances');
    this.sharedDirs = ['commands', 'skills', 'agents', 'plugins'];
  }

  /**
   * Detect circular symlink before creation
   * @param {string} target - Target path to link to
   * @param {string} linkPath - Path where symlink will be created
   * @returns {boolean} True if circular
   * @private
   */
  _detectCircularSymlink(target, linkPath) {
    // Check if target exists and is symlink
    if (!fs.existsSync(target)) {
      return false;
    }

    try {
      const stats = fs.lstatSync(target);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      // Resolve target's link
      const targetLink = fs.readlinkSync(target);
      const resolvedTarget = path.resolve(path.dirname(target), targetLink);

      // Check if target points back to our shared dir or link path
      const sharedDir = path.join(this.homeDir, '.ccs', 'shared');
      if (resolvedTarget.startsWith(sharedDir) || resolvedTarget === linkPath) {
        console.log(`[!] Circular symlink detected: ${target} → ${resolvedTarget}`);
        return true;
      }
    } catch (err) {
      // If can't read, assume not circular
      return false;
    }

    return false;
  }

  /**
   * Ensure shared directories exist as symlinks to ~/.claude/
   * Creates ~/.claude/ structure if missing
   */
  ensureSharedDirectories() {
    // Create ~/.claude/ if missing
    if (!fs.existsSync(this.claudeDir)) {
      console.log('[i] Creating ~/.claude/ directory structure');
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o700 });
    }

    // Create shared directory
    if (!fs.existsSync(this.sharedDir)) {
      fs.mkdirSync(this.sharedDir, { recursive: true, mode: 0o700 });
    }

    // Create symlinks ~/.ccs/shared/* → ~/.claude/*
    for (const dir of this.sharedDirs) {
      const claudePath = path.join(this.claudeDir, dir);
      const sharedPath = path.join(this.sharedDir, dir);

      // Create directory in ~/.claude/ if missing
      if (!fs.existsSync(claudePath)) {
        fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
      }

      // Check for circular symlink
      if (this._detectCircularSymlink(claudePath, sharedPath)) {
        console.log(`[!] Skipping ${dir}: circular symlink detected`);
        continue;
      }

      // If already a symlink pointing to correct target, skip
      if (fs.existsSync(sharedPath)) {
        try {
          const stats = fs.lstatSync(sharedPath);
          if (stats.isSymbolicLink()) {
            const currentTarget = fs.readlinkSync(sharedPath);
            const resolvedTarget = path.resolve(path.dirname(sharedPath), currentTarget);
            if (resolvedTarget === claudePath) {
              continue; // Already correct
            }
          }
        } catch (err) {
          // Continue to recreate
        }

        // Remove existing directory/link
        fs.rmSync(sharedPath, { recursive: true, force: true });
      }

      // Create symlink
      try {
        fs.symlinkSync(claudePath, sharedPath, 'dir');
      } catch (err) {
        // Windows fallback: copy directory
        if (process.platform === 'win32') {
          this._copyDirectoryFallback(claudePath, sharedPath);
          console.log(`[!] Symlink failed for ${dir}, copied instead (enable Developer Mode)`);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Link shared directories to instance
   * @param {string} instancePath - Path to instance directory
   */
  linkSharedDirectories(instancePath) {
    this.ensureSharedDirectories();

    for (const dir of this.sharedDirs) {
      const linkPath = path.join(instancePath, dir);
      const targetPath = path.join(this.sharedDir, dir);

      // Remove existing directory/link
      if (fs.existsSync(linkPath)) {
        fs.rmSync(linkPath, { recursive: true, force: true });
      }

      // Create symlink
      try {
        fs.symlinkSync(targetPath, linkPath, 'dir');
      } catch (err) {
        // Windows fallback
        if (process.platform === 'win32') {
          this._copyDirectoryFallback(targetPath, linkPath);
          console.log(`[!] Symlink failed for ${dir}, copied instead (enable Developer Mode)`);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Migrate from v3.1.1 (copied data in ~/.ccs/shared/) to v3.2.0 (symlinks to ~/.claude/)
   * Runs once on upgrade
   */
  migrateFromV311() {
    // Check if migration already done (shared dirs are symlinks)
    const commandsPath = path.join(this.sharedDir, 'commands');
    if (fs.existsSync(commandsPath)) {
      try {
        if (fs.lstatSync(commandsPath).isSymbolicLink()) {
          return; // Already migrated
        }
      } catch (err) {
        // Continue with migration
      }
    }

    console.log('[i] Migrating from v3.1.1 to v3.2.0...');

    // Ensure ~/.claude/ exists
    if (!fs.existsSync(this.claudeDir)) {
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o700 });
    }

    // Copy user modifications from ~/.ccs/shared/ to ~/.claude/
    for (const dir of this.sharedDirs) {
      const sharedPath = path.join(this.sharedDir, dir);
      const claudePath = path.join(this.claudeDir, dir);

      if (!fs.existsSync(sharedPath)) continue;

      try {
        const stats = fs.lstatSync(sharedPath);
        if (!stats.isDirectory()) continue;
      } catch (err) {
        continue;
      }

      // Create claude dir if missing
      if (!fs.existsSync(claudePath)) {
        fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
      }

      // Copy files from shared to claude (preserve user modifications)
      try {
        const entries = fs.readdirSync(sharedPath, { withFileTypes: true });
        let copied = 0;

        for (const entry of entries) {
          const src = path.join(sharedPath, entry.name);
          const dest = path.join(claudePath, entry.name);

          // Skip if already exists in claude
          if (fs.existsSync(dest)) continue;

          if (entry.isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
          } else {
            fs.copyFileSync(src, dest);
          }
          copied++;
        }

        if (copied > 0) {
          console.log(`[OK] Migrated ${copied} ${dir} to ~/.claude/${dir}`);
        }
      } catch (err) {
        console.log(`[!] Failed to migrate ${dir}: ${err.message}`);
      }
    }

    // Now run ensureSharedDirectories to create symlinks
    this.ensureSharedDirectories();

    // Update all instances to use new symlinks
    if (fs.existsSync(this.instancesDir)) {
      try {
        const instances = fs.readdirSync(this.instancesDir);

        for (const instance of instances) {
          const instancePath = path.join(this.instancesDir, instance);
          try {
            if (fs.statSync(instancePath).isDirectory()) {
              this.linkSharedDirectories(instancePath);
            }
          } catch (err) {
            console.log(`[!] Failed to update instance ${instance}: ${err.message}`);
          }
        }
      } catch (err) {
        // No instances to update
      }
    }

    console.log('[OK] Migration to v3.2.0 complete');
  }

  /**
   * Copy directory as fallback (Windows without Developer Mode)
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   * @private
   */
  _copyDirectoryFallback(src, dest) {
    if (!fs.existsSync(src)) {
      fs.mkdirSync(src, { recursive: true, mode: 0o700 });
      return;
    }

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this._copyDirectoryFallback(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = SharedManager;
