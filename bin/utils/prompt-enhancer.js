#!/usr/bin/env node
'use strict';

const path = require('path');

/**
 * Enhances user prompts with context for delegation
 * Never passes raw user input directly to delegated models
 */
class PromptEnhancer {
  /**
   * Enhance a raw user prompt with context and requirements
   * @param {string} rawPrompt - User's original prompt
   * @param {Object} options - Enhancement options
   * @param {string} options.cwd - Current working directory (absolute path)
   * @param {Array<string>} options.files - Relevant files for context
   * @param {string} options.scope - Task scope description
   * @param {Object} options.metadata - Additional metadata
   * @returns {string} Enhanced prompt ready for delegation
   */
  static enhance(rawPrompt, options = {}) {
    const { cwd, files, scope, metadata } = options;

    let enhanced = '';

    // Section 1: Task Description
    enhanced += '# Task\n\n';
    enhanced += `${rawPrompt.trim()}\n\n`;

    // Section 2: Working Directory Context
    if (cwd) {
      enhanced += '# Working Directory\n\n';
      enhanced += `You are operating in: \`${cwd}\`\n\n`;

      // Add monorepo context if detected
      if (this._isMonorepo(cwd)) {
        enhanced += `**Note**: This appears to be a monorepo structure. `;
        enhanced += `Ensure all paths are resolved relative to: \`${cwd}\`\n\n`;
      }
    }

    // Section 3: Relevant Files
    if (files && files.length > 0) {
      enhanced += '# Relevant Files\n\n';
      files.forEach(file => {
        // Convert to absolute path if relative
        const absolutePath = path.isAbsolute(file) ? file : path.join(cwd || process.cwd(), file);
        enhanced += `- \`${absolutePath}\`\n`;
      });
      enhanced += '\n';
    }

    // Section 4: Task Scope
    if (scope) {
      enhanced += '# Scope\n\n';
      enhanced += `${scope}\n\n`;
    }

    // Section 5: Explicit Requirements
    enhanced += '# Requirements\n\n';
    enhanced += this._getRequirements(metadata);

    // Section 6: Success Criteria
    enhanced += '# Success Criteria\n\n';
    enhanced += this._getSuccessCriteria();

    return enhanced;
  }

  /**
   * Get standard requirements for delegated tasks
   * @param {Object} metadata - Additional metadata
   * @returns {string} Requirements section
   * @private
   */
  static _getRequirements(metadata = {}) {
    let requirements = '';

    requirements += '- **Use absolute paths** in all file references and outputs\n';
    requirements += '- **Report all changes**: List every file created, modified, or deleted\n';
    requirements += '- **Source of truth**: Clearly indicate:\n';
    requirements += '  - WHERE: Which directory/file was worked on\n';
    requirements += '  - WHAT: What specific changes were made\n';
    requirements += '  - SCOPE: What was the extent of modifications\n';
    requirements += '- **Error handling**: Report any errors encountered with full context\n';
    requirements += '- **Follow project standards**: Read CLAUDE.md and any relevant docs/ files in the project\n';

    // Add custom requirements from metadata
    if (metadata.customRequirements) {
      requirements += '\n**Additional Requirements**:\n';
      metadata.customRequirements.forEach(req => {
        requirements += `- ${req}\n`;
      });
    }

    requirements += '\n';

    return requirements;
  }

  /**
   * Get standard success criteria
   * @returns {string} Success criteria section
   * @private
   */
  static _getSuccessCriteria() {
    let criteria = '';

    criteria += 'Task is complete when:\n\n';
    criteria += '1. All requested changes are implemented\n';
    criteria += '2. Code compiles without errors\n';
    criteria += '3. Complete file list is reported (created/modified)\n';
    criteria += '4. Working directory and scope are clearly documented\n';
    criteria += '5. Any issues or blockers are explicitly stated\n\n';

    return criteria;
  }

  /**
   * Detect if directory is in a monorepo structure
   * @param {string} cwd - Current working directory
   * @returns {boolean} True if monorepo detected
   * @private
   */
  static _isMonorepo(cwd) {
    // Common monorepo indicators
    const monorepoIndicators = [
      'packages/',
      'apps/',
      'libs/',
      'modules/',
      'services/'
    ];

    return monorepoIndicators.some(indicator => cwd.includes(indicator));
  }

  /**
   * Create a minimal enhanced prompt (for simple tasks)
   * @param {string} rawPrompt - User's original prompt
   * @param {string} cwd - Current working directory
   * @returns {string} Minimally enhanced prompt
   */
  static enhanceMinimal(rawPrompt, cwd) {
    return this.enhance(rawPrompt, { cwd });
  }

  /**
   * Create a focused enhanced prompt (task + files)
   * @param {string} rawPrompt - User's original prompt
   * @param {string} cwd - Current working directory
   * @param {Array<string>} files - Relevant files
   * @returns {string} Focused enhanced prompt
   */
  static enhanceFocused(rawPrompt, cwd, files) {
    return this.enhance(rawPrompt, { cwd, files });
  }

  /**
   * Create a comprehensive enhanced prompt (all options)
   * @param {string} rawPrompt - User's original prompt
   * @param {Object} options - All enhancement options
   * @returns {string} Comprehensive enhanced prompt
   */
  static enhanceFull(rawPrompt, options) {
    return this.enhance(rawPrompt, options);
  }
}

module.exports = { PromptEnhancer };
