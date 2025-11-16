'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { colored } = require('../utils/helpers');
const { detectClaudeCli } = require('../utils/claude-detector');

/**
 * Health check results
 */
class HealthCheck {
  constructor() {
    this.checks = [];
    this.warnings = [];
    this.errors = [];
  }

  addCheck(name, status, message = '', fix = null) {
    this.checks.push({ name, status, message, fix });

    if (status === 'error') this.errors.push({ name, message, fix });
    if (status === 'warning') this.warnings.push({ name, message, fix });
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }

  isHealthy() {
    return !this.hasErrors();
  }
}

/**
 * CCS Health Check and Diagnostics
 */
class Doctor {
  constructor() {
    this.homedir = os.homedir();
    this.ccsDir = path.join(this.homedir, '.ccs');
    this.claudeDir = path.join(this.homedir, '.claude');
    this.results = new HealthCheck();
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    console.log(colored('Running CCS Health Check...', 'cyan'));
    console.log('');

    await this.checkClaudeCli();
    this.checkCcsDirectory();
    this.checkConfigFiles();
    this.checkClaudeSettings();
    this.checkProfiles();
    this.checkInstances();
    this.checkDelegation();
    this.checkPermissions();
    this.checkCcsSymlinks();

    this.showReport();
    return this.results;
  }

  /**
   * Check 1: Claude CLI availability
   */
  async checkClaudeCli() {
    process.stdout.write('[?] Checking Claude CLI... ');

    const claudeCli = detectClaudeCli();

    // Try to execute claude --version
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(claudeCli, ['--version'], {
          stdio: 'pipe',
          timeout: 5000
        });

        let output = '';
        child.stdout.on('data', data => output += data);
        child.stderr.on('data', data => output += data);

        child.on('close', code => {
          if (code === 0) resolve(output);
          else reject(new Error('Exit code ' + code));
        });

        child.on('error', reject);
      });

      console.log(colored('[OK]', 'green'));
      this.results.addCheck('Claude CLI', 'success', `Found: ${claudeCli}`);
    } catch (err) {
      console.log(colored('[X]', 'red'));
      this.results.addCheck(
        'Claude CLI',
        'error',
        'Claude CLI not found or not working',
        'Install from: https://docs.claude.com/en/docs/claude-code/installation'
      );
    }
  }

  /**
   * Check 2: ~/.ccs/ directory
   */
  checkCcsDirectory() {
    process.stdout.write('[?] Checking ~/.ccs/ directory... ');

    if (fs.existsSync(this.ccsDir)) {
      console.log(colored('[OK]', 'green'));
      this.results.addCheck('CCS Directory', 'success');
    } else {
      console.log(colored('[X]', 'red'));
      this.results.addCheck(
        'CCS Directory',
        'error',
        '~/.ccs/ directory not found',
        'Run: npm install -g @kaitranntt/ccs --force'
      );
    }
  }

  /**
   * Check 3: Config files
   */
  checkConfigFiles() {
    const files = [
      { path: path.join(this.ccsDir, 'config.json'), name: 'config.json' },
      { path: path.join(this.ccsDir, 'glm.settings.json'), name: 'glm.settings.json' },
      { path: path.join(this.ccsDir, 'kimi.settings.json'), name: 'kimi.settings.json' }
    ];

    for (const file of files) {
      process.stdout.write(`[?] Checking ${file.name}... `);

      if (!fs.existsSync(file.path)) {
        console.log(colored('[X]', 'red'));
        this.results.addCheck(
          file.name,
          'error',
          `${file.name} not found`,
          'Run: npm install -g @kaitranntt/ccs --force'
        );
        continue;
      }

      // Validate JSON
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        JSON.parse(content);
        console.log(colored('[OK]', 'green'));
        this.results.addCheck(file.name, 'success');
      } catch (e) {
        console.log(colored('[X]', 'red'));
        this.results.addCheck(
          file.name,
          'error',
          `Invalid JSON: ${e.message}`,
          `Backup and recreate: mv ${file.path} ${file.path}.backup && npm install -g @kaitranntt/ccs --force`
        );
      }
    }
  }

  /**
   * Check 4: Claude settings
   */
  checkClaudeSettings() {
    process.stdout.write('[?] Checking ~/.claude/settings.json... ');

    const settingsPath = path.join(this.claudeDir, 'settings.json');

    if (!fs.existsSync(settingsPath)) {
      console.log(colored('[!]', 'yellow'));
      this.results.addCheck(
        'Claude Settings',
        'warning',
        '~/.claude/settings.json not found',
        'Run: claude /login'
      );
      return;
    }

    // Validate JSON
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      JSON.parse(content);
      console.log(colored('[OK]', 'green'));
      this.results.addCheck('Claude Settings', 'success');
    } catch (e) {
      console.log(colored('[!]', 'yellow'));
      this.results.addCheck(
        'Claude Settings',
        'warning',
        `Invalid JSON: ${e.message}`,
        'Run: claude /login'
      );
    }
  }

  /**
   * Check 5: Profile configurations
   */
  checkProfiles() {
    process.stdout.write('[?] Checking profiles... ');

    const configPath = path.join(this.ccsDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      console.log(colored('[SKIP]', 'yellow'));
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (!config.profiles || typeof config.profiles !== 'object') {
        console.log(colored('[X]', 'red'));
        this.results.addCheck(
          'Profiles',
          'error',
          'config.json missing profiles object',
          'Run: npm install -g @kaitranntt/ccs --force'
        );
        return;
      }

      const profileCount = Object.keys(config.profiles).length;
      console.log(colored('[OK]', 'green'), `(${profileCount} profiles)`);
      this.results.addCheck('Profiles', 'success', `${profileCount} profiles configured`);
    } catch (e) {
      console.log(colored('[X]', 'red'));
      this.results.addCheck('Profiles', 'error', e.message);
    }
  }

  /**
   * Check 6: Instance directories (account-based profiles)
   */
  checkInstances() {
    process.stdout.write('[?] Checking instances... ');

    const instancesDir = path.join(this.ccsDir, 'instances');
    if (!fs.existsSync(instancesDir)) {
      console.log(colored('[i]', 'cyan'), '(no account profiles)');
      this.results.addCheck('Instances', 'success', 'No account profiles configured');
      return;
    }

    const instances = fs.readdirSync(instancesDir).filter(name => {
      return fs.statSync(path.join(instancesDir, name)).isDirectory();
    });

    if (instances.length === 0) {
      console.log(colored('[i]', 'cyan'), '(no account profiles)');
      this.results.addCheck('Instances', 'success', 'No account profiles');
      return;
    }

    console.log(colored('[OK]', 'green'), `(${instances.length} instances)`);
    this.results.addCheck('Instances', 'success', `${instances.length} account profiles`);
  }

  /**
   * Check 7: Delegation system
   */
  checkDelegation() {
    process.stdout.write('[?] Checking delegation... ');

    // Check if delegation-rules.json exists
    const delegationRulesPath = path.join(this.ccsDir, 'delegation-rules.json');
    const hasDelegationRules = fs.existsSync(delegationRulesPath);

    // Check if delegation commands exist
    const sharedCommandsDir = path.join(this.ccsDir, 'shared', 'commands', 'ccs');
    const hasGlmCommand = fs.existsSync(path.join(sharedCommandsDir, 'glm.md'));
    const hasKimiCommand = fs.existsSync(path.join(sharedCommandsDir, 'kimi.md'));
    const hasCreateCommand = fs.existsSync(path.join(sharedCommandsDir, 'create.md'));

    if (!hasGlmCommand || !hasKimiCommand || !hasCreateCommand) {
      console.log(colored('[!]', 'yellow'), '(not installed)');
      this.results.addCheck(
        'Delegation',
        'warning',
        'Delegation commands not found',
        'Install with: npm install -g @kaitranntt/ccs --force'
      );
      return;
    }

    // Check profile validity using DelegationValidator
    const { DelegationValidator } = require('../utils/delegation-validator');
    const readyProfiles = [];

    for (const profile of ['glm', 'kimi']) {
      const validation = DelegationValidator.validate(profile);
      if (validation.valid) {
        readyProfiles.push(profile);
      }
    }

    if (readyProfiles.length === 0) {
      console.log(colored('[!]', 'yellow'), '(no profiles ready)');
      this.results.addCheck(
        'Delegation',
        'warning',
        'Delegation installed but no profiles configured',
        'Configure profiles with valid API keys (not placeholders)'
      );
      return;
    }

    console.log(colored('[OK]', 'green'), `(${readyProfiles.join(', ')} ready)`);
    this.results.addCheck(
      'Delegation',
      'success',
      `${readyProfiles.length} profile(s) ready: ${readyProfiles.join(', ')}`
    );
  }

  /**
   * Check 8: File permissions
   */
  checkPermissions() {
    process.stdout.write('[?] Checking permissions... ');

    const testFile = path.join(this.ccsDir, '.permission-test');

    try {
      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
      console.log(colored('[OK]', 'green'));
      this.results.addCheck('Permissions', 'success');
    } catch (e) {
      console.log(colored('[X]', 'red'));
      this.results.addCheck(
        'Permissions',
        'error',
        'Cannot write to ~/.ccs/',
        'Fix: sudo chown -R $USER ~/.ccs ~/.claude && chmod 755 ~/.ccs ~/.claude'
      );
    }
  }

  /**
   * Check 9: CCS symlinks to ~/.claude/
   */
  checkCcsSymlinks() {
    process.stdout.write('[?] Checking CCS symlinks... ');

    try {
      const ClaudeSymlinkManager = require('../utils/claude-symlink-manager');
      const manager = new ClaudeSymlinkManager();
      const health = manager.checkHealth();

      if (health.healthy) {
        console.log(colored('[OK]', 'green'));
        this.results.addCheck('CCS Symlinks', 'success', 'All CCS items properly symlinked');
      } else {
        console.log(colored('[!]', 'yellow'));
        this.results.addCheck(
          'CCS Symlinks',
          'warning',
          health.issues.join(', '),
          'Run: ccs update'
        );
      }
    } catch (e) {
      console.log(colored('[!]', 'yellow'));
      this.results.addCheck(
        'CCS Symlinks',
        'warning',
        'Could not check CCS symlinks: ' + e.message,
        'Run: ccs update'
      );
    }
  }

  /**
   * Show health check report
   */
  showReport() {
    console.log('');
    console.log(colored('═══════════════════════════════════════════', 'cyan'));
    console.log(colored('Health Check Report', 'bold'));
    console.log(colored('═══════════════════════════════════════════', 'cyan'));
    console.log('');

    if (this.results.isHealthy() && !this.results.hasWarnings()) {
      console.log(colored('✓ All checks passed!', 'green'));
      console.log('');
      console.log('Your CCS installation is healthy.');
      console.log('');
      return;
    }

    // Show errors
    if (this.results.hasErrors()) {
      console.log(colored('Errors:', 'red'));
      this.results.errors.forEach(err => {
        console.log(`  [X] ${err.name}: ${err.message}`);
        if (err.fix) {
          console.log(`      Fix: ${err.fix}`);
        }
      });
      console.log('');
    }

    // Show warnings
    if (this.results.hasWarnings()) {
      console.log(colored('Warnings:', 'yellow'));
      this.results.warnings.forEach(warn => {
        console.log(`  [!] ${warn.name}: ${warn.message}`);
        if (warn.fix) {
          console.log(`      Fix: ${warn.fix}`);
        }
      });
      console.log('');
    }

    // Summary
    if (this.results.hasErrors()) {
      console.log(colored('Status: Installation has errors', 'red'));
      console.log('Run suggested fixes above to resolve issues.');
    } else {
      console.log(colored('Status: Installation healthy (warnings only)', 'green'));
    }

    console.log('');
  }

  /**
   * Generate JSON report
   */
  generateJsonReport() {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      ccsVersion: require('../package.json').version,
      checks: this.results.checks,
      errors: this.results.errors,
      warnings: this.results.warnings,
      healthy: this.results.isHealthy()
    }, null, 2);
  }
}

module.exports = Doctor;