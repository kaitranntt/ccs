'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { findSimilarStrings } = require('../utils/helpers');

/**
 * Profile Detector
 *
 * Determines profile type (settings-based vs account-based) for routing.
 * Priority: settings-based profiles (glm/kimi) checked FIRST for backward compatibility.
 */
class ProfileDetector {
  constructor() {
    this.configPath = path.join(os.homedir(), '.ccs', 'config.json');
    this.profilesPath = path.join(os.homedir(), '.ccs', 'profiles.json');
  }

  /**
   * Read settings-based config (config.json)
   * @returns {Object} Config data
   */
  _readConfig() {
    if (!fs.existsSync(this.configPath)) {
      return { profiles: {} };
    }

    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`[!] Warning: Could not read config.json: ${error.message}`);
      return { profiles: {} };
    }
  }

  /**
   * Read account-based profiles (profiles.json)
   * @returns {Object} Profiles data
   */
  _readProfiles() {
    if (!fs.existsSync(this.profilesPath)) {
      return { profiles: {}, default: null };
    }

    try {
      const data = fs.readFileSync(this.profilesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`[!] Warning: Could not read profiles.json: ${error.message}`);
      return { profiles: {}, default: null };
    }
  }

  /**
   * Detect profile type and return routing information
   * @param {string} profileName - Profile name to detect
   * @returns {Object} {type: 'settings'|'account'|'default', ...info}
   */
  detectProfileType(profileName) {
    // Special case: 'default' means use default profile
    if (profileName === 'default' || profileName === null || profileName === undefined) {
      return this._resolveDefaultProfile();
    }

    // Priority 1: Check settings-based profiles (glm, kimi) - BACKWARD COMPATIBILITY
    const config = this._readConfig();

    if (config.profiles && config.profiles[profileName]) {
      return {
        type: 'settings',
        name: profileName,
        settingsPath: config.profiles[profileName]
      };
    }

    // Priority 2: Check account-based profiles (work, personal)
    const profiles = this._readProfiles();

    if (profiles.profiles && profiles.profiles[profileName]) {
      return {
        type: 'account',
        name: profileName,
        profile: profiles.profiles[profileName]
      };
    }

    // Not found - generate suggestions
    const allProfiles = this.getAllProfiles();
    const allProfileNames = [...allProfiles.settings, ...allProfiles.accounts];
    const suggestions = findSimilarStrings(profileName, allProfileNames);

    const error = new Error(`Profile not found: ${profileName}`);
    error.profileName = profileName;
    error.suggestions = suggestions;
    error.availableProfiles = this._listAvailableProfiles();
    throw error;
  }

  /**
   * Resolve default profile
   * @returns {Object} Default profile info
   */
  _resolveDefaultProfile() {
    // Check if account-based default exists
    const profiles = this._readProfiles();

    if (profiles.default && profiles.profiles[profiles.default]) {
      return {
        type: 'account',
        name: profiles.default,
        profile: profiles.profiles[profiles.default]
      };
    }

    // Check if settings-based default exists
    const config = this._readConfig();

    if (config.profiles && config.profiles['default']) {
      return {
        type: 'settings',
        name: 'default',
        settingsPath: config.profiles['default']
      };
    }

    // No default profile configured, use Claude's own defaults
    return {
      type: 'default',
      name: 'default',
      message: 'No profile configured. Using Claude CLI defaults from ~/.claude/'
    };
  }

  /**
   * List available profiles (for error messages)
   * @returns {string} Formatted list
   */
  _listAvailableProfiles() {
    const lines = [];

    // Settings-based profiles
    const config = this._readConfig();
    const settingsProfiles = Object.keys(config.profiles || {});

    if (settingsProfiles.length > 0) {
      lines.push('Settings-based profiles (GLM, Kimi, etc.):');
      settingsProfiles.forEach(name => {
        lines.push(`  - ${name}`);
      });
    }

    // Account-based profiles
    const profiles = this._readProfiles();
    const accountProfiles = Object.keys(profiles.profiles || {});

    if (accountProfiles.length > 0) {
      lines.push('Account-based profiles:');
      accountProfiles.forEach(name => {
        const isDefault = name === profiles.default;
        lines.push(`  - ${name}${isDefault ? ' [DEFAULT]' : ''}`);
      });
    }

    if (lines.length === 0) {
      return '  (no profiles configured)\n' +
        '  Run "ccs auth save <profile>" to create your first account profile.';
    }

    return lines.join('\n');
  }

  /**
   * Check if profile exists (any type)
   * @param {string} profileName - Profile name
   * @returns {boolean} True if exists
   */
  hasProfile(profileName) {
    try {
      this.detectProfileType(profileName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all available profile names
   * @returns {Object} {settings: [...], accounts: [...]}
   */
  getAllProfiles() {
    const config = this._readConfig();
    const profiles = this._readProfiles();

    return {
      settings: Object.keys(config.profiles || {}),
      accounts: Object.keys(profiles.profiles || {}),
      default: profiles.default
    };
  }
}

module.exports = ProfileDetector;
