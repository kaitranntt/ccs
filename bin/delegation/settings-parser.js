#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parses Claude Code settings for tool restrictions
 */
class SettingsParser {
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

    // Merge permissions arrays (local + shared, local has priority)
    return {
      permissions: {
        allow: [
          ...(shared.permissions?.allow || []),
          ...(local.permissions?.allow || [])
        ],
        deny: [
          ...(shared.permissions?.deny || []),
          ...(local.permissions?.deny || [])
        ]
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
