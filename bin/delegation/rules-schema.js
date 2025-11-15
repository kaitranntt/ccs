#!/usr/bin/env node
'use strict';

/**
 * Delegation rules schema definition and default configuration
 * Provides structure for delegation-rules.json
 */
class RulesSchema {
  /**
   * Get default delegation rules configuration
   * @returns {Object} Default delegation rules
   */
  static getDefaults() {
    return {
      version: '1.0.0',
      delegation: {
        enabled: true,
        mode: 'manual', // manual | auto | smart
        default_model: 'glm',

        validation: {
          require_api_key: true,
          check_profile_health: false
        },

        limits: {
          max_tokens: 4000,
          timeout_seconds: 120,
          max_files_modified: 10
        },

        rules: {
          keywords: {
            always_delegate: [
              'simple refactor',
              'add unit tests',
              'fix typo',
              'format code',
              'add comments',
              'update documentation',
              'rename variable'
            ],
            never_delegate: [
              'architecture',
              'security',
              'authentication',
              'authorization',
              'database schema',
              'API design',
              'performance critical',
              'production'
            ],
            prefer_delegate: [
              'implement',
              'create tests',
              'add logging',
              'fix bug',
              'update',
              'modify'
            ]
          },

          file_patterns: {
            always_delegate: [
              '*.test.js',
              '*.spec.ts',
              '*.test.tsx',
              '*.spec.jsx',
              '**/__tests__/**',
              '**/*.md',
              '*.txt'
            ],
            never_delegate: [
              '**/auth/**',
              '**/security/**',
              '**/*.key',
              '**/*.pem',
              '**/config/production/**',
              'Dockerfile',
              'docker-compose.yml'
            ]
          },

          task_types: {
            code_generation: {
              max_lines: 200,
              complexity_threshold: 'medium'
            },
            refactoring: {
              allow_architecture_changes: false,
              max_files: 3
            },
            testing: {
              auto_delegate: true,
              coverage_threshold: 80
            },
            documentation: {
              auto_delegate: true,
              types: ['README', 'comments', 'JSDoc', 'API docs']
            },
            bug_fixes: {
              severity_threshold: 'medium',
              require_tests: true
            }
          },

          context_size: {
            minimal: {
              description: 'Task only, no files',
              max_tokens: 500,
              auto_delegate: true
            },
            focused: {
              description: 'Task + relevant files',
              max_tokens: 2000,
              max_files: 5,
              auto_delegate: true
            },
            full: {
              description: 'Task + full conversation',
              max_tokens: 10000,
              auto_delegate: false
            }
          }
        },

        models: {
          glm: {
            enabled: true,
            priority: 1,
            use_cases: ['code_generation', 'testing', 'refactoring', 'documentation']
          },
          glmt: {
            enabled: false,
            priority: 2,
            use_cases: ['reasoning', 'complex_debugging']
          },
          kimi: {
            enabled: false,
            priority: 3,
            use_cases: ['long_context']
          }
        },

        reporting: {
          verbosity: 'standard', // minimal | standard | verbose
          include_metadata: true,
          show_validation_steps: false
        }
      }
    };
  }

  /**
   * Validate delegation rules configuration
   * @param {Object} rules - Rules object to validate
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validate(rules) {
    const errors = [];

    // Check required fields
    if (!rules.version) {
      errors.push('Missing required field: version');
    }

    if (!rules.delegation) {
      errors.push('Missing required field: delegation');
      return { valid: false, errors };
    }

    const d = rules.delegation;

    // Validate mode
    const validModes = ['manual', 'auto', 'smart'];
    if (d.mode && !validModes.includes(d.mode)) {
      errors.push(`Invalid mode: ${d.mode}. Must be one of: ${validModes.join(', ')}`);
    }

    // Validate limits
    if (d.limits) {
      if (typeof d.limits.max_tokens !== 'number' || d.limits.max_tokens < 0) {
        errors.push('limits.max_tokens must be a positive number');
      }
      if (typeof d.limits.timeout_seconds !== 'number' || d.limits.timeout_seconds < 0) {
        errors.push('limits.timeout_seconds must be a positive number');
      }
      if (typeof d.limits.max_files_modified !== 'number' || d.limits.max_files_modified < 0) {
        errors.push('limits.max_files_modified must be a positive number');
      }
    }

    // Validate models
    if (d.models) {
      Object.keys(d.models).forEach(modelName => {
        const model = d.models[modelName];
        if (typeof model.enabled !== 'boolean') {
          errors.push(`models.${modelName}.enabled must be a boolean`);
        }
        if (typeof model.priority !== 'number') {
          errors.push(`models.${modelName}.priority must be a number`);
        }
        if (!Array.isArray(model.use_cases)) {
          errors.push(`models.${modelName}.use_cases must be an array`);
        }
      });
    }

    // Validate reporting
    if (d.reporting) {
      const validVerbosity = ['minimal', 'standard', 'verbose'];
      if (d.reporting.verbosity && !validVerbosity.includes(d.reporting.verbosity)) {
        errors.push(`reporting.verbosity must be one of: ${validVerbosity.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Merge user rules with defaults (deep merge)
   * @param {Object} userRules - User's custom rules
   * @returns {Object} Merged rules
   */
  static merge(userRules) {
    const defaults = this.getDefaults();
    return this._deepMerge(defaults, userRules);
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   * @private
   */
  static _deepMerge(target, source) {
    const output = { ...target };

    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  /**
   * Check if value is a plain object
   * @param {*} item - Item to check
   * @returns {boolean} True if plain object
   * @private
   */
  static _isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

module.exports = { RulesSchema };
