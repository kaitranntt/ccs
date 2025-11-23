#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * CCS Postinstall Script
 * Automatically creates config files in ~/.ccs/ after npm install
 *
 * Runs when: npm install -g @kaitranntt/ccs
 * Idempotent: Safe to run multiple times (won't overwrite existing configs)
 * Cross-platform: Works on Unix, macOS, Windows
 */

/**
 * Validate created configuration files
 * @returns {object} { success: boolean, errors: string[], warnings: string[] }
 */
function validateConfiguration() {
  const homedir = os.homedir();
  const errors = [];
  const warnings = [];

  // Check ~/.ccs/ directory
  const ccsDir = path.join(homedir, '.ccs');
  if (!fs.existsSync(ccsDir)) {
    errors.push('~/.ccs/ directory not found');
  }

  // Check required files
  const requiredFiles = [
    { path: path.join(ccsDir, 'config.json'), name: 'config.json' },
    { path: path.join(ccsDir, 'glm.settings.json'), name: 'glm.settings.json' },
    { path: path.join(ccsDir, 'glmt.settings.json'), name: 'glmt.settings.json' },
    { path: path.join(ccsDir, 'kimi.settings.json'), name: 'kimi.settings.json' }
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file.path)) {
      errors.push(`${file.name} not found`);
      continue;
    }

    // Validate JSON syntax
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      JSON.parse(content);
    } catch (e) {
      errors.push(`${file.name} has invalid JSON: ${e.message}`);
    }
  }

  // Check ~/.claude/settings.json (warning only, not critical)
  const claudeSettings = path.join(homedir, '.claude', 'settings.json');
  if (!fs.existsSync(claudeSettings)) {
    warnings.push('~/.claude/settings.json not found - run "claude /login"');
  }

  return { success: errors.length === 0, errors, warnings };
}

function createConfigFiles() {
  try {
    // Get user home directory (cross-platform)
    const homedir = os.homedir();
    const ccsDir = path.join(homedir, '.ccs');

    // Create ~/.ccs/ directory if missing
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o755 });
      console.log('[OK] Created directory: ~/.ccs/');
    }

    // Create ~/.ccs/shared/ directory structure (Phase 1)
    const sharedDir = path.join(ccsDir, 'shared');
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true, mode: 0o755 });
      console.log('[OK] Created directory: ~/.ccs/shared/');
    }

    // Create shared subdirectories
    const sharedSubdirs = ['commands', 'skills', 'agents', 'plugins'];
    for (const subdir of sharedSubdirs) {
      const subdirPath = path.join(sharedDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true, mode: 0o755 });
        console.log(`[OK] Created directory: ~/.ccs/shared/${subdir}/`);
      }
    }

    // Migrate from v3.1.1 to v3.2.0 (symlink architecture)
    console.log('');
    try {
      const SharedManager = require('../bin/management/shared-manager');
      const sharedManager = new SharedManager();
      sharedManager.migrateFromV311();
      sharedManager.ensureSharedDirectories();
    } catch (err) {
      console.warn('[!] Migration warning:', err.message);
      console.warn('    Migration will retry on next run');
    }
    console.log('');

    // Copy .claude/ directory from package to ~/.ccs/.claude/ (v4.1.1)
    try {
      const ClaudeDirInstaller = require('../bin/utils/claude-dir-installer');
      const installer = new ClaudeDirInstaller();
      const packageDir = path.join(__dirname, '..');
      installer.install(packageDir);

      // Clean up deprecated files (v4.3.2)
      installer.cleanupDeprecated();
    } catch (err) {
      console.warn('[!] Failed to install .claude/ directory:', err.message);
      console.warn('    CCS items may not be available');
    }

    // Install CCS items to ~/.claude/ (v4.1.0)
    try {
      const ClaudeSymlinkManager = require('../bin/utils/claude-symlink-manager');
      const claudeSymlinkManager = new ClaudeSymlinkManager();
      claudeSymlinkManager.install();
    } catch (err) {
      console.warn('[!] CCS item installation warning:', err.message);
      console.warn('    Run "ccs sync" to retry');
    }
    console.log('');

    // Create config.json if missing
    const configPath = path.join(ccsDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      const config = {
        profiles: {
          glm: '~/.ccs/glm.settings.json',
          glmt: '~/.ccs/glmt.settings.json',
          kimi: '~/.ccs/kimi.settings.json',
          default: '~/.claude/settings.json'
        }
      };

      // Atomic write: temp file → rename
      const tmpPath = `${configPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, configPath);

      console.log('[OK] Created config: ~/.ccs/config.json');
    } else {
      // Update existing config with glmt if missing (migration for v3.x users)
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Ensure profiles object exists
      if (!config.profiles) {
        config.profiles = {};
      }
      if (!config.profiles.glmt) {
        config.profiles.glmt = '~/.ccs/glmt.settings.json';
        const tmpPath = `${configPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
        fs.renameSync(tmpPath, configPath);
        console.log('[OK] Updated config with GLMT profile');
      } else {
        console.log('[OK] Config exists: ~/.ccs/config.json (preserved)');
      }
    }

    // Create glm.settings.json if missing
    const glmSettingsPath = path.join(ccsDir, 'glm.settings.json');
    if (!fs.existsSync(glmSettingsPath)) {
      const glmSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
          ANTHROPIC_AUTH_TOKEN: 'YOUR_GLM_API_KEY_HERE',
          ANTHROPIC_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.6'
        }
      };

      // Atomic write
      const tmpPath = `${glmSettingsPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(glmSettings, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, glmSettingsPath);

      console.log('[OK] Created GLM profile: ~/.ccs/glm.settings.json');
      console.log('');
      console.log('  [!] Configure GLM API key:');
      console.log('      1. Get key from: https://api.z.ai');
      console.log('      2. Edit: ~/.ccs/glm.settings.json');
      console.log('      3. Replace: YOUR_GLM_API_KEY_HERE');
    } else {
      console.log('[OK] GLM profile exists: ~/.ccs/glm.settings.json (preserved)');
    }

    // Create glmt.settings.json if missing
    const glmtSettingsPath = path.join(ccsDir, 'glmt.settings.json');
    if (!fs.existsSync(glmtSettingsPath)) {
      const glmtSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
          ANTHROPIC_AUTH_TOKEN: 'YOUR_GLM_API_KEY_HERE',
          ANTHROPIC_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.6',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.6',
          ANTHROPIC_TEMPERATURE: '0.2',
          ANTHROPIC_MAX_TOKENS: '65536',
          MAX_THINKING_TOKENS: '32768',
          ENABLE_STREAMING: 'true',
          ANTHROPIC_SAFE_MODE: 'false',
          API_TIMEOUT_MS: '3000000'
        },
        alwaysThinkingEnabled: true
      };

      // Atomic write
      const tmpPath = `${glmtSettingsPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(glmtSettings, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, glmtSettingsPath);

      console.log('[OK] Created GLMT profile: ~/.ccs/glmt.settings.json');
      console.log('');
      console.log('  [!] Configure GLMT API key:');
      console.log('      1. Get key from: https://api.z.ai');
      console.log('      2. Edit: ~/.ccs/glmt.settings.json');
      console.log('      3. Replace: YOUR_GLM_API_KEY_HERE');
      console.log('      Note: GLMT enables GLM thinking mode (reasoning)');
      console.log('      Defaults: Temperature 0.2, thinking enabled, 50min timeout');
    } else {
      console.log('[OK] GLMT profile exists: ~/.ccs/glmt.settings.json (preserved)');
    }

    // Migrate existing GLMT configs to include new defaults (v3.3.0)
    if (fs.existsSync(glmtSettingsPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(glmtSettingsPath, 'utf8'));
        let updated = false;

        // Ensure env object exists
        if (!existing.env) {
          existing.env = {};
          updated = true;
        }

        // Add missing env vars (preserve existing values)
        const envDefaults = {
          ANTHROPIC_TEMPERATURE: '0.2',
          ANTHROPIC_MAX_TOKENS: '65536',
          MAX_THINKING_TOKENS: '32768',
          ENABLE_STREAMING: 'true',
          ANTHROPIC_SAFE_MODE: 'false',
          API_TIMEOUT_MS: '3000000'
        };

        for (const [key, value] of Object.entries(envDefaults)) {
          if (existing.env[key] === undefined) {
            existing.env[key] = value;
            updated = true;
          }
        }

        // Add alwaysThinkingEnabled if missing
        if (existing.alwaysThinkingEnabled === undefined) {
          existing.alwaysThinkingEnabled = true;
          updated = true;
        }

        // Write back if updated
        if (updated) {
          const tmpPath = `${glmtSettingsPath}.tmp`;
          fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
          fs.renameSync(tmpPath, glmtSettingsPath);
          console.log('[OK] Migrated GLMT config with new defaults (v3.3.0)');
          console.log('     Added: temperature, max_tokens, thinking settings, alwaysThinkingEnabled');
        }
      } catch (err) {
        console.warn('[!] GLMT config migration failed:', err.message);
        console.warn('    Existing config preserved, may be missing new defaults');
        console.warn('    You can manually add fields or delete file to regenerate');
      }
    }

    // Create kimi.settings.json if missing
    const kimiSettingsPath = path.join(ccsDir, 'kimi.settings.json');
    if (!fs.existsSync(kimiSettingsPath)) {
      const kimiSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding/',
          ANTHROPIC_AUTH_TOKEN: 'YOUR_KIMI_API_KEY_HERE'
        },
        alwaysThinkingEnabled: true
      };

      // Atomic write
      const tmpPath = `${kimiSettingsPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(kimiSettings, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, kimiSettingsPath);

      console.log('[OK] Created Kimi profile: ~/.ccs/kimi.settings.json');
      console.log('');
      console.log('  [!] Configure Kimi API key:');
      console.log('      1. Get key from: https://www.kimi.com/coding (membership page)');
      console.log('      2. Edit: ~/.ccs/kimi.settings.json');
      console.log('      3. Replace: YOUR_KIMI_API_KEY_HERE');
    } else {
      console.log('[OK] Kimi profile exists: ~/.ccs/kimi.settings.json (preserved)');
    }

    // Migrate existing Kimi configs to remove deprecated model fields (v4.1.2)
    // Kimi API changed - model fields now cause 401 errors
    if (fs.existsSync(kimiSettingsPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(kimiSettingsPath, 'utf8'));
        let updated = false;

        // Ensure env object exists
        if (!existing.env) {
          existing.env = {};
          updated = true;
        }

        // Remove deprecated model fields that cause 401 errors
        const deprecatedFields = [
          'ANTHROPIC_MODEL',
          'ANTHROPIC_SMALL_FAST_MODEL',
          'ANTHROPIC_DEFAULT_OPUS_MODEL',
          'ANTHROPIC_DEFAULT_SONNET_MODEL',
          'ANTHROPIC_DEFAULT_HAIKU_MODEL'
        ];

        for (const field of deprecatedFields) {
          if (existing.env[field] !== undefined) {
            delete existing.env[field];
            updated = true;
          }
        }

        // Ensure required fields exist
        if (!existing.env.ANTHROPIC_BASE_URL) {
          existing.env.ANTHROPIC_BASE_URL = 'https://api.kimi.com/coding/';
          updated = true;
        }

        // Add alwaysThinkingEnabled if missing
        if (existing.alwaysThinkingEnabled === undefined) {
          existing.alwaysThinkingEnabled = true;
          updated = true;
        }

        // Write back if updated
        if (updated) {
          const tmpPath = `${kimiSettingsPath}.tmp`;
          fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
          fs.renameSync(tmpPath, kimiSettingsPath);
          console.log('[OK] Migrated Kimi config (v4.1.2): removed deprecated model fields');
          console.log('     Kimi API no longer requires model fields (they cause 401 errors)');
        }
      } catch (err) {
        console.warn('[!] Kimi config migration failed:', err.message);
        console.warn('    Existing config preserved, but may cause 401 errors');
        console.warn('    Manually remove ANTHROPIC_MODEL fields from ~/.ccs/kimi.settings.json');
      }
    }

    // Copy shell completion files to ~/.ccs/completions/
    const completionsDir = path.join(ccsDir, 'completions');
    const scriptsCompletionDir = path.join(__dirname, '../scripts/completion');

    if (!fs.existsSync(completionsDir)) {
      fs.mkdirSync(completionsDir, { recursive: true, mode: 0o755 });
    }

    const completionFiles = ['ccs.bash', 'ccs.zsh', 'ccs.fish', 'ccs.ps1'];
    completionFiles.forEach(file => {
      const src = path.join(scriptsCompletionDir, file);
      const dest = path.join(completionsDir, file);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });

    console.log('[OK] Installed shell completions: ~/.ccs/completions/');
    console.log('');
    console.log('  [i] Enable auto-completion:');
    console.log('      Run: ccs --shell-completion');
    console.log('');

    // Create ~/.claude/settings.json if missing (NEW)
    const claudeDir = path.join(homedir, '.claude');
    const claudeSettingsPath = path.join(claudeDir, 'settings.json');

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true, mode: 0o755 });
      console.log('[OK] Created directory: ~/.claude/');
    }

    if (!fs.existsSync(claudeSettingsPath)) {
      // Create empty settings (matches Claude CLI behavior)
      const tmpPath = `${claudeSettingsPath}.tmp`;
      fs.writeFileSync(tmpPath, '{}\n', 'utf8');
      fs.renameSync(tmpPath, claudeSettingsPath);

      console.log('[OK] Created default settings: ~/.claude/settings.json');
      console.log('');
      console.log('  [i] Configure Claude CLI:');
      console.log('      Run: claude /login');
      console.log('');
    } else {
      console.log('[OK] Claude settings exist: ~/.claude/settings.json (preserved)');
    }

    // Validate configuration
    console.log('');
    console.log('[i] Validating configuration...');
    const validation = validateConfiguration();

    if (!validation.success) {
      console.error('');
      console.error('[X] Configuration validation failed:');
      validation.errors.forEach(err => console.error(`    - ${err}`));
      console.error('');
      throw new Error('Configuration incomplete');
    }

    // Show warnings (non-critical)
    if (validation.warnings.length > 0) {
      console.warn('');
      console.warn('[!] Warnings:');
      validation.warnings.forEach(warn => console.warn(`    - ${warn}`));
    }

    console.log('');
    console.log('[OK] CCS configuration ready!');
    console.log('  Run: ccs --version');

  } catch (err) {
    // Show error details
    console.error('');
    console.error('[X] CCS configuration failed');
    console.error(`    Error: ${err.message}`);
    console.error('');
    console.error('Recovery steps:');
    console.error('  1. Create directory manually:');
    console.error('     mkdir -p ~/.ccs ~/.claude');
    console.error('');
    console.error('  2. Create empty settings:');
    console.error('     echo "{}" > ~/.claude/settings.json');
    console.error('');
    console.error('  3. Retry installation:');
    console.error('     npm install -g @kaitranntt/ccs --force');
    console.error('');
    console.error('  4. If issue persists, report at:');
    console.error('     https://github.com/kaitranntt/ccs/issues');
    console.error('');

    // Exit with error code (npm will show warning)
    process.exit(1);
  }
}

// Run postinstall
createConfigFiles();
