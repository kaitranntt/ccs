'use strict';

const { colored } = require('./helpers');
const { ERROR_CODES, getErrorDocUrl } = require('./error-codes');

/**
 * Error types with structured messages (Legacy - kept for compatibility)
 */
const ErrorTypes = {
  NO_CLAUDE_CLI: 'NO_CLAUDE_CLI',
  MISSING_SETTINGS: 'MISSING_SETTINGS',
  INVALID_CONFIG: 'INVALID_CONFIG',
  UNKNOWN_PROFILE: 'UNKNOWN_PROFILE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  GENERIC: 'GENERIC'
};

/**
 * Enhanced error manager with context-aware messages
 */
class ErrorManager {
  /**
   * Show error code and documentation URL
   * @param {string} errorCode - Error code (e.g., E301)
   */
  static showErrorCode(errorCode) {
    console.error(colored(`Error: ${errorCode}`, 'yellow'));
    console.error(colored(getErrorDocUrl(errorCode), 'yellow'));
    console.error('');
  }

  /**
   * Show Claude CLI not found error
   */
  static showClaudeNotFound() {
    console.error('');
    console.error(colored('[X] Claude CLI not found', 'red'));
    console.error('');
    console.error('CCS requires Claude CLI to be installed and available in PATH.');
    console.error('');
    console.error(colored('Solutions:', 'yellow'));
    console.error('  1. Install Claude CLI:');
    console.error('     https://docs.claude.com/en/docs/claude-code/installation');
    console.error('');
    console.error('  2. Verify installation:');
    console.error('     command -v claude   (Unix)');
    console.error('     Get-Command claude  (Windows)');
    console.error('');
    console.error('  3. Custom path (if installed elsewhere):');
    console.error('     export CCS_CLAUDE_PATH="/path/to/claude"');
    console.error('');
    this.showErrorCode(ERROR_CODES.CLAUDE_NOT_FOUND);
  }

  /**
   * Show settings file not found error
   * @param {string} settingsPath - Path to missing settings file
   */
  static showSettingsNotFound(settingsPath) {
    const isClaudeSettings = settingsPath.includes('.claude') && settingsPath.endsWith('settings.json');

    console.error('');
    console.error(colored('[X] Settings file not found', 'red'));
    console.error('');
    console.error(`File: ${settingsPath}`);
    console.error('');

    if (isClaudeSettings) {
      console.error('This file is auto-created when you login to Claude CLI.');
      console.error('');
      console.error(colored('Solutions:', 'yellow'));
      console.error(`  echo '{}' > ${settingsPath}`);
      console.error('  claude /login');
      console.error('');
      console.error('Why: Newer Claude CLI versions require explicit login.');
    } else {
      console.error(colored('Solutions:', 'yellow'));
      console.error('  npm install -g @kaitranntt/ccs --force');
      console.error('');
      console.error('This will recreate missing profile settings.');
    }

    console.error('');
    this.showErrorCode(ERROR_CODES.CONFIG_INVALID_PROFILE);
  }

  /**
   * Show invalid configuration error
   * @param {string} configPath - Path to invalid config
   * @param {string} errorDetail - JSON parse error detail
   */
  static showInvalidConfig(configPath, errorDetail) {
    console.error('');
    console.error(colored('[X] Configuration invalid', 'red'));
    console.error('');
    console.error(`File: ${configPath}`);
    console.error(`Issue: ${errorDetail}`);
    console.error('');
    console.error(colored('Solutions:', 'yellow'));
    console.error('  # Backup corrupted file');
    console.error(`  mv ${configPath} ${configPath}.backup`);
    console.error('');
    console.error('  # Reinstall CCS');
    console.error('  npm install -g @kaitranntt/ccs --force');
    console.error('');
    console.error('Your profile settings will be preserved.');
    console.error('');
    this.showErrorCode(ERROR_CODES.CONFIG_INVALID_JSON);
  }

  /**
   * Show profile not found error
   * @param {string} profileName - Requested profile name
   * @param {string[]} availableProfiles - List of available profiles
   * @param {string[]} suggestions - Suggested profile names (fuzzy match)
   */
  static showProfileNotFound(profileName, availableProfiles, suggestions = []) {
    console.error('');
    console.error(colored(`[X] Profile '${profileName}' not found`, 'red'));
    console.error('');

    if (suggestions && suggestions.length > 0) {
      console.error(colored('Did you mean:', 'yellow'));
      suggestions.forEach(s => console.error(`  ${s}`));
      console.error('');
    }

    console.error(colored('Available profiles:', 'cyan'));
    availableProfiles.forEach(line => console.error(`  ${line}`));
    console.error('');
    console.error(colored('Solutions:', 'yellow'));
    console.error('  # Use existing profile');
    console.error('  ccs <profile> "your prompt"');
    console.error('');
    console.error('  # Create new account profile');
    console.error('  ccs auth create <name>');
    console.error('');
    this.showErrorCode(ERROR_CODES.PROFILE_NOT_FOUND);
  }

  /**
   * Show permission denied error
   * @param {string} path - Path with permission issue
   */
  static showPermissionDenied(path) {
    console.error('');
    console.error(colored('[X] Permission denied', 'red'));
    console.error('');
    console.error(`Cannot write to: ${path}`);
    console.error('');
    console.error(colored('Solutions:', 'yellow'));
    console.error('  # Fix ownership');
    console.error('  sudo chown -R $USER ~/.ccs ~/.claude');
    console.error('');
    console.error('  # Fix permissions');
    console.error('  chmod 755 ~/.ccs ~/.claude');
    console.error('');
    console.error('  # Retry installation');
    console.error('  npm install -g @kaitranntt/ccs --force');
    console.error('');
    this.showErrorCode(ERROR_CODES.FS_CANNOT_WRITE_FILE);
  }
}

module.exports = { ErrorManager, ErrorTypes };