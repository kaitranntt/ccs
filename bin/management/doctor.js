'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { colored } = require('../utils/helpers');
const { detectClaudeCli } = require('../utils/claude-detector');

// Make ora optional (might not be available during npm install postinstall)
// ora v9+ is an ES module, need to use .default for CommonJS
let ora = null;
try {
  const oraModule = require('ora');
  ora = oraModule.default || oraModule;
} catch (e) {
  // ora not available, create fallback spinner that uses console.log
  ora = function(text) {
    return {
      start: () => ({
        succeed: (msg) => console.log(msg || `[OK] ${text}`),
        fail: (msg) => console.log(msg || `[X] ${text}`),
        warn: (msg) => console.log(msg || `[!] ${text}`),
        info: (msg) => console.log(msg || `[i] ${text}`),
        text: ''
      })
    };
  };
}

const Table = require('cli-table3');

/**
 * Health check results
 */
class HealthCheck {
  constructor() {
    this.checks = [];
    this.warnings = [];
    this.errors = [];
    this.details = {}; // Store detailed information for summary table
  }

  addCheck(name, status, message = '', fix = null, details = null) {
    this.checks.push({ name, status, message, fix });

    if (status === 'error') this.errors.push({ name, message, fix });
    if (status === 'warning') this.warnings.push({ name, message, fix });

    // Store details for summary table
    if (details) {
      this.details[name] = details;
    }
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

    // Get CCS version
    try {
      this.ccsVersion = require('../../package.json').version;
    } catch (e) {
      this.ccsVersion = 'unknown';
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    console.log(colored('Running CCS Health Check...', 'cyan'));
    console.log('');

    // Store CCS version in details
    this.results.details['CCS Version'] = { status: 'OK', info: `v${this.ccsVersion}` };

    // Group 1: System
    console.log(colored('System:', 'bold'));
    await this.checkClaudeCli();
    this.checkCcsDirectory();
    console.log('');

    // Group 2: Configuration
    console.log(colored('Configuration:', 'bold'));
    this.checkConfigFiles();
    this.checkClaudeSettings();
    console.log('');

    // Group 3: Profiles & Delegation
    console.log(colored('Profiles & Delegation:', 'bold'));
    this.checkProfiles();
    this.checkInstances();
    this.checkDelegation();
    console.log('');

    // Group 4: System Health
    console.log(colored('System Health:', 'bold'));
    this.checkPermissions();
    this.checkCcsSymlinks();
    console.log('');

    this.showReport();
    return this.results;
  }

  /**
   * Check 1: Claude CLI availability
   */
  async checkClaudeCli() {
    const spinner = ora('Checking Claude CLI').start();

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

      // Extract version from output
      const versionMatch = result.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      spinner.succeed(`  ${'Claude CLI'.padEnd(26)}${colored('[OK]', 'green')}  ${claudeCli} (v${version})`);
      this.results.addCheck('Claude CLI', 'success', `Found: ${claudeCli}`, null, {
        status: 'OK',
        info: `v${version} (${claudeCli})`
      });
    } catch (err) {
      spinner.fail(`  ${'Claude CLI'.padEnd(26)}${colored('[X]', 'red')}  Not found or not working`);
      this.results.addCheck(
        'Claude CLI',
        'error',
        'Claude CLI not found or not working',
        'Install from: https://docs.claude.com/en/docs/claude-code/installation',
        { status: 'ERROR', info: 'Not installed' }
      );
    }
  }

  /**
   * Check 2: ~/.ccs/ directory
   */
  checkCcsDirectory() {
    const spinner = ora('Checking ~/.ccs/ directory').start();

    if (fs.existsSync(this.ccsDir)) {
      spinner.succeed(`  ${'CCS Directory'.padEnd(26)}${colored('[OK]', 'green')}  ~/.ccs/`);
      this.results.addCheck('CCS Directory', 'success', null, null, {
        status: 'OK',
        info: '~/.ccs/'
      });
    } else {
      spinner.fail(`  ${'CCS Directory'.padEnd(26)}${colored('[X]', 'red')}  Not found`);
      this.results.addCheck(
        'CCS Directory',
        'error',
        '~/.ccs/ directory not found',
        'Run: npm install -g @kaitranntt/ccs --force',
        { status: 'ERROR', info: 'Not found' }
      );
    }
  }

  /**
   * Check 3: Config files
   */
  checkConfigFiles() {
    const files = [
      { path: path.join(this.ccsDir, 'config.json'), name: 'config.json', key: 'config.json' },
      { path: path.join(this.ccsDir, 'glm.settings.json'), name: 'glm.settings.json', key: 'GLM Settings', profile: 'glm' },
      { path: path.join(this.ccsDir, 'kimi.settings.json'), name: 'kimi.settings.json', key: 'Kimi Settings', profile: 'kimi' }
    ];

    const { DelegationValidator } = require('../utils/delegation-validator');

    for (const file of files) {
      const spinner = ora(`Checking ${file.name}`).start();

      if (!fs.existsSync(file.path)) {
        spinner.fail(`  ${file.name.padEnd(26)}${colored('[X]', 'red')}  Not found`);
        this.results.addCheck(
          file.name,
          'error',
          `${file.name} not found`,
          'Run: npm install -g @kaitranntt/ccs --force',
          { status: 'ERROR', info: 'Not found' }
        );
        continue;
      }

      // Validate JSON
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        const config = JSON.parse(content);

        // Extract useful info based on file type
        let info = 'Valid';
        let status = 'OK';

        if (file.profile) {
          // For settings files, check if API key is configured
          const validation = DelegationValidator.validate(file.profile);

          if (validation.valid) {
            info = 'Key configured';
            status = 'OK';
          } else if (validation.error && validation.error.includes('placeholder')) {
            info = 'Placeholder key (not configured)';
            status = 'WARN';
          } else {
            info = 'Valid JSON';
            status = 'OK';
          }
        }

        const statusIcon = status === 'OK' ? colored('[OK]', 'green') : colored('[!]', 'yellow');

        if (status === 'WARN') {
          spinner.warn(`  ${file.name.padEnd(26)}${statusIcon}  ${info}`);
        } else {
          spinner.succeed(`  ${file.name.padEnd(26)}${statusIcon}  ${info}`);
        }

        this.results.addCheck(file.name, status === 'OK' ? 'success' : 'warning', null, null, {
          status: status,
          info: info
        });
      } catch (e) {
        spinner.fail(`  ${file.name.padEnd(26)}${colored('[X]', 'red')}  Invalid JSON`);
        this.results.addCheck(
          file.name,
          'error',
          `Invalid JSON: ${e.message}`,
          `Backup and recreate: mv ${file.path} ${file.path}.backup && npm install -g @kaitranntt/ccs --force`,
          { status: 'ERROR', info: 'Invalid JSON' }
        );
      }
    }
  }

  /**
   * Check 4: Claude settings
   */
  checkClaudeSettings() {
    const spinner = ora('Checking ~/.claude/settings.json').start();
    const settingsPath = path.join(this.claudeDir, 'settings.json');

    if (!fs.existsSync(settingsPath)) {
      spinner.warn(`  ${'~/.claude/settings.json'.padEnd(26)}${colored('[!]', 'yellow')}  Not found`);
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
      spinner.succeed(`  ${'~/.claude/settings.json'.padEnd(26)}${colored('[OK]', 'green')}`);
      this.results.addCheck('Claude Settings', 'success');
    } catch (e) {
      spinner.warn(`  ${'~/.claude/settings.json'.padEnd(26)}${colored('[!]', 'yellow')}  Invalid JSON`);
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
    const spinner = ora('Checking profiles').start();
    const configPath = path.join(this.ccsDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      spinner.info(`  ${'Profiles'.padEnd(26)}${colored('[SKIP]', 'cyan')}  config.json not found`);
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (!config.profiles || typeof config.profiles !== 'object') {
        spinner.fail(`  ${'Profiles'.padEnd(26)}${colored('[X]', 'red')}  Missing profiles object`);
        this.results.addCheck(
          'Profiles',
          'error',
          'config.json missing profiles object',
          'Run: npm install -g @kaitranntt/ccs --force',
          { status: 'ERROR', info: 'Missing profiles object' }
        );
        return;
      }

      const profileCount = Object.keys(config.profiles).length;
      const profileNames = Object.keys(config.profiles).join(', ');

      spinner.succeed(`  ${'Profiles'.padEnd(26)}${colored('[OK]', 'green')}  ${profileCount} configured (${profileNames})`);
      this.results.addCheck('Profiles', 'success', `${profileCount} profiles configured`, null, {
        status: 'OK',
        info: `${profileCount} configured (${profileNames.length > 30 ? profileNames.substring(0, 27) + '...' : profileNames})`
      });
    } catch (e) {
      spinner.fail(`  ${'Profiles'.padEnd(26)}${colored('[X]', 'red')}  ${e.message}`);
      this.results.addCheck('Profiles', 'error', e.message, null, {
        status: 'ERROR',
        info: e.message
      });
    }
  }

  /**
   * Check 6: Instance directories (account-based profiles)
   */
  checkInstances() {
    const spinner = ora('Checking instances').start();
    const instancesDir = path.join(this.ccsDir, 'instances');

    if (!fs.existsSync(instancesDir)) {
      spinner.info(`  ${'Instances'.padEnd(26)}${colored('[i]', 'cyan')}  No account profiles`);
      this.results.addCheck('Instances', 'success', 'No account profiles configured');
      return;
    }

    const instances = fs.readdirSync(instancesDir).filter(name => {
      return fs.statSync(path.join(instancesDir, name)).isDirectory();
    });

    if (instances.length === 0) {
      spinner.info(`  ${'Instances'.padEnd(26)}${colored('[i]', 'cyan')}  No account profiles`);
      this.results.addCheck('Instances', 'success', 'No account profiles');
      return;
    }

    spinner.succeed(`  ${'Instances'.padEnd(26)}${colored('[OK]', 'green')}  ${instances.length} account profiles`);
    this.results.addCheck('Instances', 'success', `${instances.length} account profiles`);
  }

  /**
   * Check 7: Delegation system
   */
  checkDelegation() {
    const spinner = ora('Checking delegation').start();

    // Check if delegation commands exist in ~/.ccs/.claude/commands/
    const ccsClaudeCommandsDir = path.join(this.ccsDir, '.claude', 'commands');
    const hasCcsCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs.md'));
    const hasContinueCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs', 'continue.md'));

    if (!hasCcsCommand || !hasContinueCommand) {
      spinner.warn(`  ${'Delegation'.padEnd(26)}${colored('[!]', 'yellow')}  Not installed`);
      this.results.addCheck(
        'Delegation',
        'warning',
        'Delegation commands not found',
        'Install with: npm install -g @kaitranntt/ccs --force',
        { status: 'WARN', info: 'Not installed' }
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
      spinner.warn(`  ${'Delegation'.padEnd(26)}${colored('[!]', 'yellow')}  No profiles ready`);
      this.results.addCheck(
        'Delegation',
        'warning',
        'Delegation installed but no profiles configured',
        'Configure profiles with valid API keys (not placeholders)',
        { status: 'WARN', info: 'No profiles ready' }
      );
      return;
    }

    spinner.succeed(`  ${'Delegation'.padEnd(26)}${colored('[OK]', 'green')}  ${readyProfiles.length} profiles ready (${readyProfiles.join(', ')})`);
    this.results.addCheck(
      'Delegation',
      'success',
      `${readyProfiles.length} profile(s) ready: ${readyProfiles.join(', ')}`,
      null,
      { status: 'OK', info: `${readyProfiles.length} profiles ready` }
    );
  }

  /**
   * Check 8: File permissions
   */
  checkPermissions() {
    const spinner = ora('Checking permissions').start();
    const testFile = path.join(this.ccsDir, '.permission-test');

    try {
      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
      spinner.succeed(`  ${'Permissions'.padEnd(26)}${colored('[OK]', 'green')}  Write access verified`);
      this.results.addCheck('Permissions', 'success', null, null, {
        status: 'OK',
        info: 'Write access verified'
      });
    } catch (e) {
      spinner.fail(`  ${'Permissions'.padEnd(26)}${colored('[X]', 'red')}  Cannot write to ~/.ccs/`);
      this.results.addCheck(
        'Permissions',
        'error',
        'Cannot write to ~/.ccs/',
        'Fix: sudo chown -R $USER ~/.ccs ~/.claude && chmod 755 ~/.ccs ~/.claude',
        { status: 'ERROR', info: 'Cannot write to ~/.ccs/' }
      );
    }
  }

  /**
   * Check 9: CCS symlinks to ~/.claude/
   */
  checkCcsSymlinks() {
    const spinner = ora('Checking CCS symlinks').start();

    try {
      const ClaudeSymlinkManager = require('../utils/claude-symlink-manager');
      const manager = new ClaudeSymlinkManager();
      const health = manager.checkHealth();

      if (health.healthy) {
        const itemCount = manager.ccsItems.length;
        spinner.succeed(`  ${'CCS Symlinks'.padEnd(26)}${colored('[OK]', 'green')}  ${itemCount}/${itemCount} items linked`);
        this.results.addCheck('CCS Symlinks', 'success', 'All CCS items properly symlinked', null, {
          status: 'OK',
          info: `${itemCount}/${itemCount} items synced`
        });
      } else {
        spinner.warn(`  ${'CCS Symlinks'.padEnd(26)}${colored('[!]', 'yellow')}  ${health.issues.length} issues found`);
        this.results.addCheck(
          'CCS Symlinks',
          'warning',
          health.issues.join(', '),
          'Run: ccs sync',
          { status: 'WARN', info: `${health.issues.length} issues` }
        );
      }
    } catch (e) {
      spinner.warn(`  ${'CCS Symlinks'.padEnd(26)}${colored('[!]', 'yellow')}  Could not check`);
      this.results.addCheck(
        'CCS Symlinks',
        'warning',
        'Could not check CCS symlinks: ' + e.message,
        'Run: ccs sync',
        { status: 'WARN', info: 'Could not check' }
      );
    }
  }

  /**
   * Show health check report
   */
  showReport() {
    console.log('');

    // Calculate exact table width to match header bars
    // colWidths: [20, 10, 35] = 65 + borders (4) = 69 total
    const tableWidth = 69;
    const headerBar = '═'.repeat(tableWidth);

    console.log(colored(headerBar, 'cyan'));
    console.log(colored('                     Health Check Summary', 'bold'));
    console.log(colored(headerBar, 'cyan'));

    // Create summary table with detailed information
    const table = new Table({
      head: [colored('Component', 'cyan'), colored('Status', 'cyan'), colored('Details', 'cyan')],
      colWidths: [20, 10, 35],
      wordWrap: true,
      chars: {
        'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
        'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
        'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
        'right': '║', 'right-mid': '╢', 'middle': '│'
      }
    });

    // Populate table with collected details
    for (const [component, detail] of Object.entries(this.results.details)) {
      const statusColor = detail.status === 'OK' ? 'green' : detail.status === 'ERROR' ? 'red' : 'yellow';
      table.push([
        component,
        colored(detail.status, statusColor),
        detail.info || ''
      ]);
    }

    console.log(table.toString());
    console.log('');

    // Show errors and warnings if present
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

    // Final status
    if (this.results.isHealthy() && !this.results.hasWarnings()) {
      console.log(colored('[OK] All checks passed! Your CCS installation is healthy.', 'green'));
    } else if (this.results.hasErrors()) {
      console.log(colored('[X] Status: Installation has errors', 'red'));
      console.log('Run suggested fixes above to resolve issues.');
    } else {
      console.log(colored('[OK] Status: Installation healthy (warnings only)', 'green'));
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