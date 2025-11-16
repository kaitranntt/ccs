#!/usr/bin/env node
'use strict';

const { HeadlessExecutor } = require('./headless-executor');
const { SessionManager } = require('./session-manager');
const { ResultFormatter } = require('./result-formatter');
const { DelegationValidator } = require('../utils/delegation-validator');
const { SettingsParser } = require('./settings-parser');

/**
 * Delegation command handler
 * Routes -p flag commands to HeadlessExecutor with enhanced features
 */
class DelegationHandler {
  /**
   * Route delegation command
   * @param {Array<string>} args - Full args array from ccs.js
   */
  async route(args) {
    try {
      // 1. Parse args into { profile, prompt, options }
      const parsed = this._parseArgs(args);

      // 2. Detect special profiles (glm:continue, kimi:continue)
      if (parsed.profile.includes(':continue')) {
        return await this._handleContinue(parsed);
      }

      // 3. Validate profile
      this._validateProfile(parsed.profile);

      // 4. Execute via HeadlessExecutor
      const result = await HeadlessExecutor.execute(
        parsed.profile,
        parsed.prompt,
        parsed.options
      );

      // 5. Format and display results
      const formatted = ResultFormatter.format(result);
      console.log(formatted);

      // 6. Exit with proper code
      process.exit(result.exitCode || 0);
    } catch (error) {
      console.error(`[X] Delegation error: ${error.message}`);
      if (process.env.CCS_DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Handle continue command (resume last session)
   * @param {Object} parsed - Parsed args
   */
  async _handleContinue(parsed) {
    const baseProfile = parsed.profile.replace(':continue', '');

    // Get last session from SessionManager
    const sessionMgr = new SessionManager();
    const lastSession = sessionMgr.getLastSession(baseProfile);

    if (!lastSession) {
      console.error(`[X] No previous session found for ${baseProfile}`);
      console.error(`    Start a new session first with: ccs ${baseProfile} -p "task"`);
      process.exit(1);
    }

    // Execute with resume flag
    const result = await HeadlessExecutor.execute(
      baseProfile,
      parsed.prompt,
      {
        ...parsed.options,
        resumeSession: true,
        sessionId: lastSession.sessionId
      }
    );

    const formatted = ResultFormatter.format(result);
    console.log(formatted);

    process.exit(result.exitCode || 0);
  }

  /**
   * Parse args into structured format
   * @param {Array<string>} args - Raw args
   * @returns {Object} { profile, prompt, options }
   */
  _parseArgs(args) {
    // Extract profile (first non-flag arg or 'default')
    const profile = this._extractProfile(args);

    // Extract prompt from -p or --prompt
    const prompt = this._extractPrompt(args);

    // Extract options (--timeout, --permission-mode, etc.)
    const options = this._extractOptions(args);

    return { profile, prompt, options };
  }

  /**
   * Extract profile from args (first non-flag arg)
   * @param {Array<string>} args - Args array
   * @returns {string} Profile name
   */
  _extractProfile(args) {
    // Find first arg that doesn't start with '-' and isn't -p value
    let skipNext = false;
    for (let i = 0; i < args.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (args[i] === '-p' || args[i] === '--prompt') {
        skipNext = true;
        continue;
      }

      if (!args[i].startsWith('-')) {
        return args[i];
      }
    }

    // No profile specified, return null (will error in validation)
    return null;
  }

  /**
   * Extract prompt from -p flag
   * @param {Array<string>} args - Args array
   * @returns {string} Prompt text
   */
  _extractPrompt(args) {
    const pIndex = args.indexOf('-p');
    const promptIndex = args.indexOf('--prompt');

    const index = pIndex !== -1 ? pIndex : promptIndex;

    if (index === -1 || index === args.length - 1) {
      console.error('[X] Missing prompt after -p flag');
      console.error('    Usage: ccs glm -p "task description"');
      process.exit(1);
    }

    return args[index + 1];
  }

  /**
   * Extract options from remaining args
   * @param {Array<string>} args - Args array
   * @returns {Object} Options for HeadlessExecutor
   */
  _extractOptions(args) {
    const cwd = process.cwd();

    // Read default permission mode from .claude/settings.local.json
    // Falls back to 'acceptEdits' if file doesn't exist
    const defaultPermissionMode = SettingsParser.parseDefaultPermissionMode(cwd);

    const options = {
      cwd,
      outputFormat: 'stream-json',
      permissionMode: defaultPermissionMode
    };

    // Parse permission-mode (CLI flag overrides settings file)
    const permModeIndex = args.indexOf('--permission-mode');
    if (permModeIndex !== -1 && permModeIndex < args.length - 1) {
      options.permissionMode = args[permModeIndex + 1];
    }

    // Parse timeout
    const timeoutIndex = args.indexOf('--timeout');
    if (timeoutIndex !== -1 && timeoutIndex < args.length - 1) {
      options.timeout = parseInt(args[timeoutIndex + 1], 10);
    }

    return options;
  }

  /**
   * Validate profile exists and is configured
   * @param {string} profile - Profile name
   */
  _validateProfile(profile) {
    if (!profile) {
      console.error('[X] No profile specified');
      console.error('    Usage: ccs <profile> -p "task"');
      console.error('    Examples: ccs glm -p "task", ccs kimi -p "task"');
      process.exit(1);
    }

    // Use DelegationValidator to check profile
    const validation = DelegationValidator.validate(profile);
    if (!validation.valid) {
      console.error(`[X] Profile '${profile}' is not configured for delegation`);
      console.error(`    ${validation.error}`);
      console.error('');
      console.error('    Run: ccs doctor');
      console.error('    Or configure: ~/.ccs/${profile}.settings.json');
      process.exit(1);
    }
  }
}

module.exports = DelegationHandler;
