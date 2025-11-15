#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { RulesSchema } = require('./rules-schema');

/**
 * Rule-based delegation decision engine
 * Determines whether tasks should be delegated based on configured rules
 */
class DelegationEngine {
  constructor() {
    this.rules = null;
    this.rulesPath = path.join(os.homedir(), '.ccs', 'delegation-rules.json');
  }

  /**
   * Load delegation rules from file system
   * Creates default if missing
   * @returns {boolean} True if rules loaded successfully
   */
  loadRules() {
    // Check if rules file exists
    if (!fs.existsSync(this.rulesPath)) {
      // Create default rules
      this.createDefaultRules();
    }

    try {
      const rulesContent = fs.readFileSync(this.rulesPath, 'utf8');
      this.rules = JSON.parse(rulesContent);

      // Validate rules
      const validation = RulesSchema.validate(this.rules);
      if (!validation.valid) {
        console.error('[!] Invalid delegation rules:');
        validation.errors.forEach(err => console.error(`  - ${err}`));
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[X] Failed to load delegation rules: ${error.message}`);
      return false;
    }
  }

  /**
   * Create default delegation rules file
   */
  createDefaultRules() {
    const defaultRules = RulesSchema.getDefaults();
    const ccsDir = path.dirname(this.rulesPath);

    // Ensure .ccs directory exists
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }

    // Write default rules
    fs.writeFileSync(
      this.rulesPath,
      JSON.stringify(defaultRules, null, 2),
      { mode: 0o600 }
    );

    this.rules = defaultRules;
    console.log(`[i] Created default delegation rules: ${this.rulesPath}`);
  }

  /**
   * Decide if a task should be delegated
   * @param {Object} task - Task information
   * @param {string} task.prompt - User's prompt
   * @param {Array<string>} task.files - Files involved
   * @param {string} task.type - Task type (optional)
   * @returns {Object} { shouldDelegate: boolean, reason: string, model?: string }
   */
  shouldDelegate(task) {
    // Ensure rules are loaded
    if (!this.rules) {
      this.loadRules();
    }

    // Check if delegation is enabled
    if (!this.rules.delegation.enabled) {
      return {
        shouldDelegate: false,
        reason: 'Delegation is disabled in configuration'
      };
    }

    // Manual mode: never auto-delegate
    if (this.rules.delegation.mode === 'manual') {
      return {
        shouldDelegate: false,
        reason: 'Delegation mode is manual (user must invoke explicitly)'
      };
    }

    const { prompt, files = [] } = task;
    const promptLower = prompt.toLowerCase();

    // Check never_delegate keywords first (highest priority)
    const neverKeywords = this.rules.delegation.rules.keywords.never_delegate;
    for (const keyword of neverKeywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        return {
          shouldDelegate: false,
          reason: `Never delegate: matched keyword "${keyword}"`
        };
      }
    }

    // Check never_delegate file patterns
    const neverPatterns = this.rules.delegation.rules.file_patterns.never_delegate;
    for (const file of files) {
      for (const pattern of neverPatterns) {
        if (this._matchPattern(file, pattern)) {
          return {
            shouldDelegate: false,
            reason: `Never delegate: file matches pattern "${pattern}"`
          };
        }
      }
    }

    // Check always_delegate keywords
    const alwaysKeywords = this.rules.delegation.rules.keywords.always_delegate;
    for (const keyword of alwaysKeywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        return {
          shouldDelegate: true,
          reason: `Always delegate: matched keyword "${keyword}"`,
          model: this.rules.delegation.default_model
        };
      }
    }

    // Check always_delegate file patterns
    const alwaysPatterns = this.rules.delegation.rules.file_patterns.always_delegate;
    for (const file of files) {
      for (const pattern of alwaysPatterns) {
        if (this._matchPattern(file, pattern)) {
          return {
            shouldDelegate: true,
            reason: `Always delegate: file matches pattern "${pattern}"`,
            model: this.rules.delegation.default_model
          };
        }
      }
    }

    // Check prefer_delegate keywords (lower priority)
    const preferKeywords = this.rules.delegation.rules.keywords.prefer_delegate;
    for (const keyword of preferKeywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        // For auto mode, suggest delegation
        if (this.rules.delegation.mode === 'auto') {
          return {
            shouldDelegate: true,
            reason: `Prefer delegate: matched keyword "${keyword}"`,
            model: this.rules.delegation.default_model
          };
        }
      }
    }

    // Default: don't delegate
    return {
      shouldDelegate: false,
      reason: 'No matching delegation rules'
    };
  }

  /**
   * Match file path against glob-like pattern
   * @param {string} filePath - File path to match
   * @param {string} pattern - Glob pattern
   * @returns {boolean} True if matches
   * @private
   */
  _matchPattern(filePath, pattern) {
    // Simple glob matching (basic implementation)
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Get recommended model for a task
   * @param {string} taskType - Type of task
   * @returns {string} Recommended model name
   */
  getRecommendedModel(taskType) {
    const models = this.rules.delegation.models;

    // Find enabled models that support this task type
    const candidates = Object.entries(models)
      .filter(([_, config]) => config.enabled && config.use_cases.includes(taskType))
      .sort((a, b) => a[1].priority - b[1].priority);

    if (candidates.length > 0) {
      return candidates[0][0];
    }

    // Default to configured default model
    return this.rules.delegation.default_model;
  }

  /**
   * Get current delegation mode
   * @returns {string} Current mode (manual | auto | smart)
   */
  getMode() {
    if (!this.rules) {
      this.loadRules();
    }
    return this.rules.delegation.mode;
  }

  /**
   * Check if delegation is enabled
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    if (!this.rules) {
      this.loadRules();
    }
    return this.rules.delegation.enabled;
  }
}

module.exports = { DelegationEngine };
