#!/usr/bin/env node
'use strict';

/**
 * CCS Delegation Setup Validator
 *
 * Checks CCS installation, profile configuration, and delegation readiness.
 * Run this script to diagnose delegation issues.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colored(text, color) {
  if (process.env.NO_COLOR) return text;
  return `${colors[color] || ''}${text}${colors.reset}`;
}

class SetupValidator {
  constructor() {
    this.homeDir = os.homedir();
    this.ccsDir = path.join(this.homeDir, '.ccs');
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  async validate() {
    console.log(colored('\n=== CCS Delegation Setup Validator ===\n', 'bold'));

    await this.checkCcsInstallation();
    this.checkDelegationCommands();
    this.checkProfiles();
    this.showReport();

    return this.errors.length === 0;
  }

  async checkCcsInstallation() {
    process.stdout.write('[?] Checking CCS installation... ');

    try {
      const version = await this.runCommand('ccs', ['--version']);
      console.log(colored('[OK]', 'green'));
      this.successes.push(`CCS installed: ${version.trim()}`);
    } catch (err) {
      console.log(colored('[X]', 'red'));
      this.errors.push({
        message: 'CCS not installed or not in PATH',
        fix: 'npm install -g @kaitranntt/ccs'
      });
    }
  }

  checkDelegationCommands() {
    process.stdout.write('[?] Checking delegation commands... ');

    const commandsDir = path.join(this.ccsDir, 'shared', 'commands');
    const requiredCommands = ['ccs-glm.md', 'ccs-kimi.md', 'ccs-create.md'];
    const missing = [];

    for (const cmd of requiredCommands) {
      const cmdPath = path.join(commandsDir, cmd);
      if (!fs.existsSync(cmdPath)) {
        missing.push(cmd);
      }
    }

    if (missing.length === 0) {
      console.log(colored('[OK]', 'green'));
      this.successes.push('All delegation commands present');
    } else {
      console.log(colored('[X]', 'red'));
      this.errors.push({
        message: `Missing delegation commands: ${missing.join(', ')}`,
        fix: 'npm install -g @kaitranntt/ccs --force'
      });
    }
  }

  checkProfiles() {
    const profiles = ['glm', 'kimi'];
    const readyProfiles = [];

    for (const profile of profiles) {
      process.stdout.write(`[?] Checking ${profile} profile... `);

      const profileDir = path.join(this.ccsDir, 'profiles', profile);
      const settingsPath = path.join(profileDir, 'settings.json');

      if (!fs.existsSync(settingsPath)) {
        console.log(colored('[!]', 'yellow'));
        this.warnings.push({
          message: `${profile} profile not found`,
          fix: `Create ${settingsPath} with valid API key`
        });
        continue;
      }

      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const apiKey = settings?.env?.ANTHROPIC_AUTH_TOKEN;

        if (!apiKey) {
          console.log(colored('[X]', 'red'));
          this.errors.push({
            message: `${profile}: Missing ANTHROPIC_AUTH_TOKEN`,
            fix: `Add API key to ${settingsPath}`
          });
          continue;
        }

        const placeholders = [
          'YOUR_GLM_API_KEY_HERE',
          'YOUR_KIMI_API_KEY_HERE',
          'YOUR_API_KEY_HERE',
          'PLACEHOLDER'
        ];

        if (placeholders.some(p => apiKey.includes(p))) {
          console.log(colored('[!]', 'yellow'));
          this.warnings.push({
            message: `${profile}: API key is placeholder`,
            fix: `Replace placeholder in ${settingsPath} with real API key`
          });
          continue;
        }

        console.log(colored('[OK]', 'green'));
        readyProfiles.push(profile);
        this.successes.push(`${profile} profile ready (API key: ${apiKey.substring(0, 8)}...)`);

      } catch (err) {
        console.log(colored('[X]', 'red'));
        this.errors.push({
          message: `${profile}: Invalid JSON in settings.json`,
          fix: `Fix JSON syntax in ${settingsPath}`
        });
      }
    }

    if (readyProfiles.length > 0) {
      console.log('');
      console.log(colored(`✓ Delegation ready with: ${readyProfiles.join(', ')}`, 'green'));
    }
  }

  showReport() {
    console.log('');
    console.log(colored('═══════════════════════════════════════════', 'cyan'));
    console.log(colored('Validation Report', 'bold'));
    console.log(colored('═══════════════════════════════════════════', 'cyan'));
    console.log('');

    if (this.successes.length > 0) {
      console.log(colored('✓ Successes:', 'green'));
      this.successes.forEach(msg => console.log(`  ${msg}`));
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log(colored('⚠ Warnings:', 'yellow'));
      this.warnings.forEach(({ message, fix }) => {
        console.log(`  ${message}`);
        if (fix) console.log(`    Fix: ${fix}`);
      });
      console.log('');
    }

    if (this.errors.length > 0) {
      console.log(colored('✗ Errors:', 'red'));
      this.errors.forEach(({ message, fix }) => {
        console.log(`  ${message}`);
        if (fix) console.log(`    Fix: ${fix}`);
      });
      console.log('');
    }

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(colored('🎉 All checks passed! Delegation is ready to use.', 'green'));
    } else if (this.errors.length === 0) {
      console.log(colored('⚠ Setup functional with warnings. Address warnings for full functionality.', 'yellow'));
    } else {
      console.log(colored('✗ Setup incomplete. Fix errors above to enable delegation.', 'red'));
    }

    console.log('');
  }

  runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'pipe' });
      let output = '';

      child.stdout.on('data', data => output += data);
      child.stderr.on('data', data => output += data);

      child.on('close', code => {
        if (code === 0) resolve(output);
        else reject(new Error(`Exit code ${code}`));
      });

      child.on('error', reject);
    });
  }
}

// Run validation
const validator = new SetupValidator();
validator.validate().then(success => {
  process.exit(success ? 0 : 1);
});
