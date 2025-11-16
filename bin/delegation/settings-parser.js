#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parses Claude Code settings for tool restrictions
 */
class SettingsParser {
  /**
   * Parse default permission mode from project settings
   * @param {string} projectDir - Project directory (usually cwd)
   * @returns {string} Default permission mode (e.g., 'acceptEdits', 'bypassPermissions', 'plan', 'default')
   */
  static parseDefaultPermissionMode(projectDir) {
    const settings = this._loadSettings(projectDir);
    const permissions = settings.permissions || {};

    // Priority: local > shared > fallback to 'acceptEdits'
    const defaultMode = permissions.defaultMode || 'acceptEdits';

    if (process.env.CCS_DEBUG) {
      console.error(`[i] Permission mode from settings: ${defaultMode}`);
    }

    return defaultMode;
  }

  /**
   * Parse project settings for tool restrictions
   * @param {string} projectDir - Project directory (usually cwd)
   * @returns {Object} { allowedTools: string[], disallowedTools: string[] }
   */
  static parseToolRestrictions(projectDir) {
    const settings = this._loadSettings(projectDir);
    const permissions = settings.permissions || {};

    const allowed = permissions.allow || [];
    const denied = permissions.deny || [];

    if (process.env.CCS_DEBUG) {
      console.error(`[i] Tool restrictions: ${allowed.length} allowed, ${denied.length} denied`);
    }

    return {
      allowedTools: allowed,
      disallowedTools: denied
    };
  }

  /**
   * Load and merge settings files (local overrides shared)
   * @param {string} projectDir - Project directory
   * @returns {Object} Merged settings
   * @private
   */
  static _loadSettings(projectDir) {
    const claudeDir = path.join(projectDir, '.claude');
    const sharedPath = path.join(claudeDir, 'settings.json');
    const localPath = path.join(claudeDir, 'settings.local.json');

    // Load shared settings
    const shared = this._readJsonSafe(sharedPath) || {};

    // Load local settings (overrides shared)
    const local = this._readJsonSafe(localPath) || {};

    // Merge permissions (local overrides shared)
    return {
      permissions: {
        allow: [
          ...(shared.permissions?.allow || []),
          ...(local.permissions?.allow || [])
        ],
        deny: [
          ...(shared.permissions?.deny || []),
          ...(local.permissions?.deny || [])
        ],
        // Local defaultMode takes priority over shared
        defaultMode: local.permissions?.defaultMode || shared.permissions?.defaultMode || null
      }
    };
  }

  /**
   * Read JSON file safely (no throw)
   * @param {string} filePath - Path to JSON file
   * @returns {Object|null} Parsed JSON or null
   * @private
   */
  static _readJsonSafe(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (process.env.CCS_DEBUG) {
        console.warn(`[!] Failed to read settings: ${filePath}: ${error.message}`);
      }
      return null;
    }
  }
}

module.exports = { SettingsParser };
