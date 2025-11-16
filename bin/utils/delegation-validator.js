#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Validates delegation profiles for CCS delegation system
 * Ensures profiles exist and have valid API keys configured
 */
class DelegationValidator {
  /**
   * Validate a delegation profile
   * @param {string} profileName - Name of profile to validate (e.g., 'glm', 'kimi')
   * @returns {Object} Validation result { valid: boolean, error?: string, settingsPath?: string }
   */
  static validate(profileName) {
    const homeDir = os.homedir();
    const settingsPath = path.join(homeDir, '.ccs', `${profileName}.settings.json`);

    // Check if profile directory exists
    if (!fs.existsSync(settingsPath)) {
      return {
        valid: false,
        error: `Profile not found: ${profileName}`,
        suggestion: `Profile settings missing at: ${settingsPath}\n\n` +
                   `To set up ${profileName} profile:\n` +
                   `  1. Copy base settings: cp config/base-${profileName}.settings.json ~/.ccs/${profileName}.settings.json\n` +
                   `  2. Edit settings: Edit ~/.ccs/${profileName}.settings.json\n` +
                   `  3. Set your API key in ANTHROPIC_AUTH_TOKEN field`
      };
    }

    // Read and parse settings.json
    let settings;
    try {
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(settingsContent);
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse settings.json for ${profileName}`,
        suggestion: `Settings file is corrupted or invalid JSON.\n\n` +
                   `Location: ${settingsPath}\n` +
                   `Parse error: ${error.message}\n\n` +
                   `Fix: Restore from base config:\n` +
                   `  cp config/base-${profileName}.settings.json ~/.ccs/${profileName}.settings.json`
      };
    }

    // Validate API key exists and is not default
    const apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN;

    if (!apiKey) {
      return {
        valid: false,
        error: `API key not configured for ${profileName}`,
        suggestion: `Missing ANTHROPIC_AUTH_TOKEN in settings.\n\n` +
                   `Edit: ${settingsPath}\n` +
                   `Set: env.ANTHROPIC_AUTH_TOKEN to your API key`
      };
    }

    // Check for default placeholder values
    const defaultPlaceholders = [
      'YOUR_GLM_API_KEY_HERE',
      'YOUR_KIMI_API_KEY_HERE',
      'YOUR_API_KEY_HERE',
      'your-api-key-here',
      'PLACEHOLDER'
    ];

    if (defaultPlaceholders.some(placeholder => apiKey.includes(placeholder))) {
      return {
        valid: false,
        error: `Default API key placeholder detected for ${profileName}`,
        suggestion: `API key is still set to default placeholder.\n\n` +
                   `To configure your profile:\n` +
                   `  1. Edit: ${settingsPath}\n` +
                   `  2. Replace ANTHROPIC_AUTH_TOKEN with your actual API key\n\n` +
                   `Get API key:\n` +
                   `  GLM: https://z.ai/manage-apikey/apikey-list\n` +
                   `  Kimi: https://platform.moonshot.cn/console/api-keys`
      };
    }

    // Validation passed
    return {
      valid: true,
      settingsPath,
      apiKey: apiKey.substring(0, 8) + '...' // Show first 8 chars for verification
    };
  }

  /**
   * Format validation error for display
   * @param {Object} result - Validation result from validate()
   * @returns {string} Formatted error message
   */
  static formatError(result) {
    if (result.valid) {
      return '';
    }

    let message = `\n[X] ${result.error}\n\n`;

    if (result.suggestion) {
      message += `${result.suggestion}\n`;
    }

    return message;
  }

  /**
   * Check if profile is delegation-ready (shorthand)
   * @param {string} profileName - Profile to check
   * @returns {boolean} True if ready for delegation
   */
  static isReady(profileName) {
    const result = this.validate(profileName);
    return result.valid;
  }

  /**
   * Get all delegation-ready profiles
   * @returns {Array<string>} List of profile names ready for delegation
   */
  static getReadyProfiles() {
    const homeDir = os.homedir();
    const ccsDir = path.join(homeDir, '.ccs');

    if (!fs.existsSync(ccsDir)) {
      return [];
    }

    const profiles = [];
    const entries = fs.readdirSync(ccsDir, { withFileTypes: true });

    // Look for *.settings.json files
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.settings.json')) {
        const profileName = entry.name.replace('.settings.json', '');
        if (this.isReady(profileName)) {
          profiles.push(profileName);
        }
      }
    }

    return profiles;
  }
}

module.exports = { DelegationValidator };
