#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { error, colored } = require('./utils/helpers');
const { detectClaudeCli, showClaudeNotFoundError } = require('./utils/claude-detector');
const { getSettingsPath, getConfigPath } = require('./utils/config-manager');
const { ErrorManager } = require('./utils/error-manager');
const RecoveryManager = require('./management/recovery-manager');

// Version (sync with package.json)
const CCS_VERSION = require('../package.json').version;

// Helper: Escape arguments for shell execution
function escapeShellArg(arg) {
  // Windows: escape double quotes and wrap in double quotes
  return '"' + String(arg).replace(/"/g, '""') + '"';
}

// Execute Claude CLI with unified spawn logic
function execClaude(claudeCli, args, envVars = null) {
  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);

  // Prepare environment (merge with process.env if envVars provided)
  const env = envVars ? { ...process.env, ...envVars } : process.env;

  let child;
  if (needsShell) {
    // When shell needed: concatenate into string to avoid DEP0190 warning
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    child = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env
    });
  } else {
    // When no shell needed: use array form (faster, no shell overhead)
    child = spawn(claudeCli, args, {
      stdio: 'inherit',
      windowsHide: true,
      env
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code || 0);
  });
  child.on('error', () => {
    showClaudeNotFoundError();
    process.exit(1);
  });
}

// Special command handlers
function handleVersionCommand() {
  // Title
  console.log(colored(`CCS (Claude Code Switch) v${CCS_VERSION}`, 'bold'));
  console.log('');

  // Installation section with table-like formatting
  console.log(colored('Installation:', 'cyan'));

  // Location
  const installLocation = process.argv[1] || '(not found)';
  console.log(`  ${colored('Location:'.padEnd(17), 'cyan')} ${installLocation}`);

  // .ccs/ directory location
  const ccsDir = path.join(os.homedir(), '.ccs');
  console.log(`  ${colored('CCS Directory:'.padEnd(17), 'cyan')} ${ccsDir}`);

  // Config path
  const configPath = getConfigPath();
  console.log(`  ${colored('Config:'.padEnd(17), 'cyan')} ${configPath}`);

  // Profiles.json location
  const profilesJson = path.join(os.homedir(), '.ccs', 'profiles.json');
  console.log(`  ${colored('Profiles:'.padEnd(17), 'cyan')} ${profilesJson}`);

  // Delegation status - check multiple indicators
  const delegationSessionsPath = path.join(os.homedir(), '.ccs', 'delegation-sessions.json');
  const delegationConfigured = fs.existsSync(delegationSessionsPath);

  let readyProfiles = [];

  // Check for profiles with valid API keys
  for (const profile of ['glm', 'kimi']) {
    const settingsPath = path.join(os.homedir(), '.ccs', `${profile}.settings.json`);
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN;
        if (apiKey && !apiKey.match(/YOUR_.*_API_KEY_HERE/) && !apiKey.match(/sk-test.*/)) {
          readyProfiles.push(profile);
        }
      } catch (error) {
        // Invalid JSON, skip
      }
    }
  }

  const hasValidApiKeys = readyProfiles.length > 0;
  const delegationEnabled = delegationConfigured || hasValidApiKeys;

  if (delegationEnabled) {
    console.log(`  ${colored('Delegation:'.padEnd(17), 'cyan')} Enabled`);
  } else {
    console.log(`  ${colored('Delegation:'.padEnd(17), 'cyan')} Not configured`);
  }

  console.log('');

  // Ready Profiles section - make it more prominent
  if (readyProfiles.length > 0) {
    console.log(colored('Delegation Ready:', 'cyan'));
    console.log(`  ${colored('✓', 'yellow')} ${readyProfiles.join(', ')} profiles are ready for delegation`);
    console.log('');
  } else if (delegationEnabled) {
    console.log(colored('Delegation Ready:', 'cyan'));
    console.log(`  ${colored('!', 'yellow')} Delegation configured but no valid API keys found`);
    console.log('');
  }

  // Documentation
  console.log(`${colored('Documentation:', 'cyan')} https://github.com/kaitranntt/ccs`);
  console.log(`${colored('License:', 'cyan')} MIT`);
  console.log('');

  // Help hint
  console.log(colored('Run \'ccs --help\' for usage information', 'yellow'));

  process.exit(0);
}

function handleHelpCommand() {
  // Title
  console.log(colored('CCS (Claude Code Switch) - Instant profile switching for Claude CLI', 'bold'));
  console.log('');

  // Usage
  console.log(colored('Usage:', 'cyan'));
  console.log(`  ${colored('ccs', 'yellow')} [profile] [claude-args...]`);
  console.log(`  ${colored('ccs', 'yellow')} [flags]`);
  console.log('');

  // Description
  console.log(colored('Description:', 'cyan'));
  console.log('  Switch between multiple Claude accounts and alternative models');
  console.log('  (GLM, Kimi) instantly. Run different Claude CLI sessions concurrently');
  console.log('  with auto-recovery. Zero downtime.');
  console.log('');

  // Model Switching
  console.log(colored('Model Switching:', 'cyan'));
  console.log(`  ${colored('ccs', 'yellow')}                         Use default Claude account`);
  console.log(`  ${colored('ccs glm', 'yellow')}                     Switch to GLM 4.6 model`);
  console.log(`  ${colored('ccs glmt', 'yellow')}                    Switch to GLM with thinking mode`);
  console.log(`  ${colored('ccs glmt --verbose', 'yellow')}          Enable debug logging`);
  console.log(`  ${colored('ccs kimi', 'yellow')}                    Switch to Kimi for Coding`);
  console.log(`  ${colored('ccs glm', 'yellow')} "debug this code"   Use GLM and run command`);
  console.log('');

  // Account Management
  console.log(colored('Account Management:', 'cyan'));
  console.log(`  ${colored('ccs auth --help', 'yellow')}             Run multiple Claude accounts concurrently`);
  console.log('');

  // Delegation (inside Claude Code CLI)
  console.log(colored('Delegation (inside Claude Code CLI):', 'cyan'));
  console.log(`  ${colored('/ccs "task"', 'yellow')}                Delegate task (auto-selects best profile)`);
  console.log(`  ${colored('/ccs --glm "task"', 'yellow')}           Force GLM-4.6 for simple tasks`);
  console.log(`  ${colored('/ccs --kimi "task"', 'yellow')}          Force Kimi for long context`);
  console.log(`  ${colored('/ccs:continue "follow-up"', 'yellow')}    Continue last delegation session`);
  console.log('  Save tokens by delegating simple tasks to cost-optimized models');
  console.log('');

  // Diagnostics
  console.log(colored('Diagnostics:', 'cyan'));
  console.log(`  ${colored('ccs doctor', 'yellow')}                  Run health check and diagnostics`);
  console.log(`  ${colored('ccs sync', 'yellow')}                    Sync delegation commands and skills`);
  console.log(`  ${colored('ccs update', 'yellow')}                  Update CCS to latest version`);
  console.log('');

  // Flags
  console.log(colored('Flags:', 'cyan'));
  console.log(`  ${colored('-h, --help', 'yellow')}                  Show this help message`);
  console.log(`  ${colored('-v, --version', 'yellow')}               Show version and installation info`);
  console.log(`  ${colored('-sc, --shell-completion', 'yellow')}     Install shell auto-completion`);
  console.log('');

  // Configuration
  console.log(colored('Configuration:', 'cyan'));
  console.log('  Config File: ~/.ccs/config.json');
  console.log('  Profiles:    ~/.ccs/profiles.json');
  console.log('  Instances:   ~/.ccs/instances/');
  console.log('  Settings:    ~/.ccs/*.settings.json');
  console.log('  Environment: CCS_CONFIG (override config path)');
  console.log('');

  // Shared Data
  console.log(colored('Shared Data:', 'cyan'));
  console.log('  Commands:    ~/.ccs/shared/commands/');
  console.log('  Skills:      ~/.ccs/shared/skills/');
  console.log('  Agents:      ~/.ccs/shared/agents/');
  console.log('  Plugins:     ~/.ccs/shared/plugins/');
  console.log('  Note: Commands, skills, agents, and plugins are symlinked across all profiles');
  console.log('');

  // Examples
  console.log(colored('Examples:', 'cyan'));
  console.log(`  ${colored('$ ccs', 'yellow')}                        # Use default account`);
  console.log(`  ${colored('$ ccs glm "implement API"', 'yellow')}    # Cost-optimized model`);
  console.log('');
  console.log(`  For more: ${colored('https://github.com/kaitranntt/ccs/blob/main/README.md', 'cyan')}`);
  console.log('');

  // Uninstall
  console.log(colored('Uninstall:', 'yellow'));
  console.log('  npm:          npm uninstall -g @kaitranntt/ccs');
  console.log('  macOS/Linux:  curl -fsSL ccs.kaitran.ca/uninstall | bash');
  console.log('  Windows:      irm ccs.kaitran.ca/uninstall | iex');
  console.log('');

  // Documentation
  console.log(colored('Documentation:', 'cyan'));
  console.log(`  GitHub:  ${colored('https://github.com/kaitranntt/ccs', 'cyan')}`);
  console.log('  Docs:    https://github.com/kaitranntt/ccs/blob/main/README.md');
  console.log('  Issues:  https://github.com/kaitranntt/ccs/issues');
  console.log('');

  // License
  console.log(`${colored('License:', 'cyan')} MIT`);

  process.exit(0);
}

function handleInstallCommand() {
  console.log('');
  console.log('Feature not available');
  console.log('');
  console.log('The --install flag is currently under development.');
  console.log('.claude/ integration testing is not complete.');
  console.log('');
  console.log('For updates: https://github.com/kaitranntt/ccs/issues');
  console.log('');
  process.exit(0);
}

function handleUninstallCommand() {
  console.log('');
  console.log('Feature not available');
  console.log('');
  console.log('The --uninstall flag is currently under development.');
  console.log('.claude/ integration testing is not complete.');
  console.log('');
  console.log('For updates: https://github.com/kaitranntt/ccs/issues');
  console.log('');
  process.exit(0);
}

async function handleDoctorCommand() {
  const Doctor = require('./management/doctor');
  const doctor = new Doctor();

  await doctor.runAllChecks();

  // Exit with error code if unhealthy
  process.exit(doctor.results.isHealthy() ? 0 : 1);
}

async function handleSyncCommand() {
  const { colored } = require('./utils/helpers');

  console.log('');
  console.log(colored('Syncing CCS Components...', 'cyan'));
  console.log('');

  // First, copy .claude/ directory from package to ~/.ccs/.claude/
  const ClaudeDirInstaller = require('./utils/claude-dir-installer');
  const installer = new ClaudeDirInstaller();
  installer.install();

  console.log('');

  const cleanupResult = installer.cleanupDeprecated();
  if (cleanupResult.success && cleanupResult.cleanedFiles.length > 0) {
    console.log('');
  }

  // Then, create symlinks from ~/.ccs/.claude/ to ~/.claude/
  const ClaudeSymlinkManager = require('./utils/claude-symlink-manager');
  const manager = new ClaudeSymlinkManager();
  manager.install(false);

  console.log('');
  console.log(colored('[OK] Sync complete!', 'green'));
  console.log('');

  process.exit(0);
}

/**
 * Detect installation method
 * @returns {'npm'|'direct'} - Installation method
 */
function detectInstallationMethod() {
  const scriptPath = process.argv[1];

  // Method 1: Check if script is inside node_modules
  if (scriptPath.includes('node_modules')) {
    return 'npm';
  }

  // Method 2: Check if script is in npm global bin directory
  // Common patterns for npm global installations
  const npmGlobalBinPatterns = [
    /\.npm\/global\/bin\//,           // ~/.npm/global/bin/ccs
    /\/\.nvm\/versions\/node\/[^\/]+\/bin\//,  // ~/.nvm/versions/node/v22.19.0/bin/ccs
    /\/usr\/local\/bin\//,           // /usr/local/bin/ccs (if npm global prefix is /usr/local)
    /\/usr\/bin\//                   // /usr/bin/ccs (if npm global prefix is /usr)
  ];

  for (const pattern of npmGlobalBinPatterns) {
    if (pattern.test(scriptPath)) {
      // Verify this is actually CCS by checking the linked target
      try {
        const binDir = path.dirname(scriptPath);
        const nodeModulesDir = path.join(binDir, '..', 'lib', 'node_modules', '@kaitranntt', 'ccs');
        const globalModulesDir = path.join(binDir, '..', 'node_modules', '@kaitranntt', 'ccs');

        if (fs.existsSync(nodeModulesDir) || fs.existsSync(globalModulesDir)) {
          return 'npm';
        }
      } catch (err) {
        // Continue checking other patterns
      }
    }
  }

  // Method 3: Check if package.json exists in parent directory (development mode)
  const packageJsonPath = path.join(__dirname, '..', 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      // If package.json has name "@kaitranntt/ccs", it's npm install
      if (pkg.name === '@kaitranntt/ccs') {
        return 'npm';
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  // Method 4: Check if script is a symlink pointing to node_modules
  try {
    const stats = fs.lstatSync(scriptPath);
    if (stats.isSymbolicLink()) {
      const targetPath = fs.readlinkSync(scriptPath);
      if (targetPath.includes('node_modules') || targetPath.includes('@kaitranntt/ccs')) {
        return 'npm';
      }
    }
  } catch (err) {
    // Continue to default
  }

  // Default to direct installation
  return 'direct';
}

/**
 * Detect which package manager was used for installation
 * @returns {'npm'|'yarn'|'pnpm'|'bun'|'unknown'}
 */
function detectPackageManager() {
  const scriptPath = process.argv[1];

  // Check if script path contains package manager indicators
  if (scriptPath.includes('.pnpm')) return 'pnpm';
  if (scriptPath.includes('yarn')) return 'yarn';
  if (scriptPath.includes('bun')) return 'bun';

  // Check parent directories for lock files
  const binDir = path.dirname(scriptPath);
  const fs = require('fs');

  // Check global node_modules parent for lock files
  let checkDir = binDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(checkDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(checkDir, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(checkDir, 'bun.lockb'))) return 'bun';
    checkDir = path.dirname(checkDir);
  }

  // Check if package managers are available on the system
  const { spawnSync } = require('child_process');

  // Try yarn global list to see if CCS is installed via yarn
  try {
    const yarnResult = spawnSync('yarn', ['global', 'list', '--pattern', '@kaitranntt/ccs'], {
      encoding: 'utf8',
      shell: true,
      timeout: 5000
    });
    if (yarnResult.status === 0 && yarnResult.stdout.includes('@kaitranntt/ccs')) {
      return 'yarn';
    }
  } catch (err) {
    // Continue to next check
  }

  // Try pnpm list -g to see if CCS is installed via pnpm
  try {
    const pnpmResult = spawnSync('pnpm', ['list', '-g', '--pattern', '@kaitranntt/ccs'], {
      encoding: 'utf8',
      shell: true,
      timeout: 5000
    });
    if (pnpmResult.status === 0 && pnpmResult.stdout.includes('@kaitranntt/ccs')) {
      return 'pnpm';
    }
  } catch (err) {
    // Continue to next check
  }

  // Try bun pm ls -g to see if CCS is installed via bun
  try {
    const bunResult = spawnSync('bun', ['pm', 'ls', '-g', '--pattern', '@kaitranntt/ccs'], {
      encoding: 'utf8',
      shell: true,
      timeout: 5000
    });
    if (bunResult.status === 0 && bunResult.stdout.includes('@kaitranntt/ccs')) {
      return 'bun';
    }
  } catch (err) {
    // Continue to default
  }

  // Default to npm
  return 'npm';
}

async function handleUpdateCommand() {
  const { checkForUpdates } = require('./utils/update-checker');
  const { spawn } = require('child_process');

  console.log('');
  console.log(colored('Checking for updates...', 'cyan'));
  console.log('');

  // Detect installation method for proper update source
  const installMethod = detectInstallationMethod();
  const isNpmInstall = installMethod === 'npm';

  // Check for updates (force check)
  const updateResult = await checkForUpdates(CCS_VERSION, true, installMethod);

  if (updateResult.status === 'check_failed') {
    console.log(colored(`[X] ${updateResult.message}`, 'red'));
    console.log('');
    console.log(colored('[i] Possible causes:', 'yellow'));
    console.log('  • Network connection issues');
    console.log('  • Firewall blocking requests');
    console.log('  • GitHub/npm API temporarily unavailable');
    console.log('');
    console.log('Try again later or update manually:');
    if (isNpmInstall) {
      const packageManager = detectPackageManager();
      let manualCommand;

      switch (packageManager) {
        case 'npm':
          manualCommand = 'npm install -g @kaitranntt/ccs@latest';
          break;
        case 'yarn':
          manualCommand = 'yarn global add @kaitranntt/ccs@latest';
          break;
        case 'pnpm':
          manualCommand = 'pnpm add -g @kaitranntt/ccs@latest';
          break;
        case 'bun':
          manualCommand = 'bun add -g @kaitranntt/ccs@latest';
          break;
        default:
          manualCommand = 'npm install -g @kaitranntt/ccs@latest';
      }

      console.log(colored(`  ${manualCommand}`, 'yellow'));
    } else {
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        console.log(colored('  irm ccs.kaitran.ca/install | iex', 'yellow'));
      } else {
        console.log(colored('  curl -fsSL ccs.kaitran.ca/install | bash', 'yellow'));
      }
    }
    console.log('');
    process.exit(1);
  }

  if (updateResult.status === 'no_update') {
    let message = `You are already on the latest version (${CCS_VERSION})`;

    // Add context for why no update is shown
    switch (updateResult.reason) {
      case 'dismissed':
        message = `Update dismissed. You are on version ${CCS_VERSION}`;
        console.log(colored(`[i] ${message}`, 'yellow'));
        break;
      case 'cached':
        message = `No updates available (cached result). You are on version ${CCS_VERSION}`;
        console.log(colored(`[i] ${message}`, 'cyan'));
        break;
      default:
        console.log(colored(`[OK] ${message}`, 'green'));
    }
    console.log('');
    process.exit(0);
  }

  // Update available
  console.log(colored(`[i] Update available: ${updateResult.current} → ${updateResult.latest}`, 'yellow'));
  console.log('');

  if (isNpmInstall) {
    // npm installation - detect package manager and update
    const packageManager = detectPackageManager();
    let updateCommand, updateArgs;

    switch (packageManager) {
      case 'npm':
        updateCommand = 'npm';
        updateArgs = ['install', '-g', '@kaitranntt/ccs@latest'];
        break;
      case 'yarn':
        updateCommand = 'yarn';
        updateArgs = ['global', 'add', '@kaitranntt/ccs@latest'];
        break;
      case 'pnpm':
        updateCommand = 'pnpm';
        updateArgs = ['add', '-g', '@kaitranntt/ccs@latest'];
        break;
      case 'bun':
        updateCommand = 'bun';
        updateArgs = ['add', '-g', '@kaitranntt/ccs@latest'];
        break;
      default:
        updateCommand = 'npm';
        updateArgs = ['install', '-g', '@kaitranntt/ccs@latest'];
    }

    console.log(colored(`Updating via ${packageManager}...`, 'cyan'));
    console.log('');

    const child = spawn(updateCommand, updateArgs, {
      stdio: 'inherit'
      // No shell needed for direct commands
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('');
        console.log(colored('[OK] Update successful!', 'green'));
        console.log('');
        console.log(`Run ${colored('ccs --version', 'yellow')} to verify`);
        console.log('');
      } else {
        console.log('');
        console.log(colored('[X] Update failed', 'red'));
        console.log('');
        console.log('Try manually:');
        console.log(colored(`  ${updateCommand} ${updateArgs.join(' ')}`, 'yellow'));
        console.log('');
      }
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      console.log('');
      console.log(colored(`[X] Failed to run ${packageManager} update`, 'red'));
      console.log('');
      console.log('Try manually:');
      console.log(colored(`  ${updateCommand} ${updateArgs.join(' ')}`, 'yellow'));
      console.log('');
      process.exit(1);
    });
  } else {
    // Direct installation - re-run installer
    console.log(colored('Updating via installer...', 'cyan'));
    console.log('');

    const isWindows = process.platform === 'win32';
    let command, args;

    if (isWindows) {
      // PowerShell
      command = 'powershell.exe';
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
              'irm ccs.kaitran.ca/install | iex'];
    } else {
      // Unix (bash with proper shell invocation)
      command = '/bin/bash';
      args = ['-c', 'curl -fsSL ccs.kaitran.ca/install | bash'];
    }

    const child = spawn(command, args, {
      stdio: 'inherit'
      // Do NOT use shell: true
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('');
        console.log(colored('[OK] Update successful!', 'green'));
        console.log('');
        console.log(`Run ${colored('ccs --version', 'yellow')} to verify`);
        console.log('');
      } else {
        console.log('');
        console.log(colored('[X] Update failed', 'red'));
        console.log('');
        console.log('Try manually:');
        if (isWindows) {
          console.log(colored('  irm ccs.kaitran.ca/install | iex', 'yellow'));
        } else {
          console.log(colored('  curl -fsSL ccs.kaitran.ca/install | bash', 'yellow'));
        }
        console.log('');
      }
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      console.log('');
      console.log(colored('[X] Failed to run installer', 'red'));
      console.log('');
      console.log('Try manually:');
      if (isWindows) {
        console.log(colored('  irm ccs.kaitran.ca/install | iex', 'yellow'));
      } else {
        console.log(colored('  curl -fsSL ccs.kaitran.ca/install | bash', 'yellow'));
      }
      console.log('');
      process.exit(1);
    });
  }
}

// Smart profile detection
function detectProfile(args) {
  if (args.length === 0 || args[0].startsWith('-')) {
    // No args or first arg is a flag → use default profile
    return { profile: 'default', remainingArgs: args };
  } else {
    // First arg doesn't start with '-' → treat as profile name
    return { profile: args[0], remainingArgs: args.slice(1) };
  }
}

// Execute Claude CLI with embedded proxy (for GLMT profile)
async function execClaudeWithProxy(claudeCli, profileName, args) {
  const { getSettingsPath } = require('./utils/config-manager');

  // 1. Read settings to get API key
  const settingsPath = getSettingsPath(profileName);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey || apiKey === 'YOUR_GLM_API_KEY_HERE') {
    console.error('[X] GLMT profile requires Z.AI API key');
    console.error('    Edit ~/.ccs/glmt.settings.json and set ANTHROPIC_AUTH_TOKEN');
    process.exit(1);
  }

  // Detect verbose flag
  const verbose = args.includes('--verbose') || args.includes('-v');

  // 2. Spawn embedded proxy with verbose flag
  const proxyPath = path.join(__dirname, 'glmt', 'glmt-proxy.js');
  const proxyArgs = verbose ? ['--verbose'] : [];
  // Use process.execPath for Windows compatibility (CVE-2024-27980)
  const proxy = spawn(process.execPath, [proxyPath, ...proxyArgs], {
    stdio: ['ignore', 'pipe', verbose ? 'pipe' : 'inherit']
  });

  // 3. Wait for proxy ready signal (with timeout)
  const { ProgressIndicator } = require('./utils/progress-indicator');
  const spinner = new ProgressIndicator('Starting GLMT proxy');
  spinner.start();

  let port;
  try {
    port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Proxy startup timeout (5s)'));
      }, 5000);

      proxy.stdout.on('data', (data) => {
        const match = data.toString().match(/PROXY_READY:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1]));
        }
      });

      proxy.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      proxy.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Proxy exited with code ${code}`));
        }
      });
    });

    spinner.succeed(`GLMT proxy ready on port ${port}`);
  } catch (error) {
    spinner.fail('Failed to start GLMT proxy');
    console.error('[X] Error:', error.message);
    console.error('');
    console.error('Possible causes:');
    console.error('  1. Port conflict (unlikely with random port)');
    console.error('  2. Node.js permission issue');
    console.error('  3. Firewall blocking localhost');
    console.error('');
    console.error('Workarounds:');
    console.error('  - Use non-thinking mode: ccs glm "prompt"');
    console.error('  - Enable verbose logging: ccs glmt --verbose "prompt"');
    console.error('  - Check proxy logs in ~/.ccs/logs/ (if debug enabled)');
    console.error('');
    proxy.kill();
    process.exit(1);
  }

  // 4. Spawn Claude CLI with proxy URL
  const envVars = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_MODEL: 'glm-4.6'
  };

  // Use existing execClaude helper for consistent Windows handling
  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);
  const env = { ...process.env, ...envVars };

  let claude;
  if (needsShell) {
    // When shell needed: concatenate into string to avoid DEP0190 warning
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    claude = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env
    });
  } else {
    // When no shell needed: use array form (faster, no shell overhead)
    claude = spawn(claudeCli, args, {
      stdio: 'inherit',
      windowsHide: true,
      env
    });
  }

  // 5. Cleanup: kill proxy when Claude exits
  claude.on('exit', (code, signal) => {
    proxy.kill('SIGTERM');
    if (signal) process.kill(process.pid, signal);
    else process.exit(code || 0);
  });

  claude.on('error', (error) => {
    console.error('[X] Claude CLI error:', error);
    proxy.kill('SIGTERM');
    process.exit(1);
  });

  // Also handle parent process termination (use .once to avoid duplicates)
  process.once('SIGTERM', () => {
    proxy.kill('SIGTERM');
    claude.kill('SIGTERM');
  });

  process.once('SIGINT', () => {
    proxy.kill('SIGTERM');
    claude.kill('SIGTERM');
  });
}

/**
 * Handle shell completion installation
 */
async function handleShellCompletionCommand(args) {
  const { ShellCompletionInstaller } = require('./utils/shell-completion');
  const { colored } = require('./utils/helpers');

  console.log(colored('Shell Completion Installer', 'bold'));
  console.log('');

  // Parse flags
  let targetShell = null;
  if (args.includes('--bash')) targetShell = 'bash';
  else if (args.includes('--zsh')) targetShell = 'zsh';
  else if (args.includes('--fish')) targetShell = 'fish';
  else if (args.includes('--powershell')) targetShell = 'powershell';

  try {
    const installer = new ShellCompletionInstaller();
    const result = installer.install(targetShell);

    if (result.alreadyInstalled) {
      console.log(colored('[OK] Shell completion already installed', 'green'));
      console.log('');
      return;
    }

    console.log(colored('[OK] Shell completion installed successfully!', 'green'));
    console.log('');
    console.log(result.message);
    console.log('');
    console.log(colored('To activate:', 'cyan'));
    console.log(`  ${result.reload}`);
    console.log('');
    console.log(colored('Then test:', 'cyan'));
    console.log('  ccs <TAB>        # See available profiles');
    console.log('  ccs auth <TAB>   # See auth subcommands');
    console.log('');
  } catch (error) {
    console.error(colored('[X] Error:', 'red'), error.message);
    console.error('');
    console.error(colored('Usage:', 'yellow'));
    console.error('  ccs --shell-completion           # Auto-detect shell');
    console.error('  ccs --shell-completion --bash    # Install for bash');
    console.error('  ccs --shell-completion --zsh     # Install for zsh');
    console.error('  ccs --shell-completion --fish    # Install for fish');
    console.error('  ccs --shell-completion --powershell  # Install for PowerShell');
    console.error('');
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Special case: version command (check BEFORE profile detection)
  const firstArg = args[0];
  if (firstArg === 'version' || firstArg === '--version' || firstArg === '-v') {
    handleVersionCommand();
  }

  // Special case: help command
  if (firstArg === '--help' || firstArg === '-h' || firstArg === 'help') {
    handleHelpCommand();
    return;
  }

  // Special case: install command
  if (firstArg === '--install') {
    handleInstallCommand();
    return;
  }

  // Special case: uninstall command
  if (firstArg === '--uninstall') {
    handleUninstallCommand();
    return;
  }

  // Special case: shell completion installer
  if (firstArg === '--shell-completion' || firstArg === '-sc') {
    await handleShellCompletionCommand(args.slice(1));
    return;
  }

  // Special case: doctor command
  if (firstArg === 'doctor' || firstArg === '--doctor') {
    await handleDoctorCommand();
    return;
  }

  // Special case: sync command (sync delegation commands and skills to ~/.claude/)
  if (firstArg === 'sync' || firstArg === '--sync') {
    await handleSyncCommand();
    return;
  }

  // Special case: update command (update CCS to latest version)
  if (firstArg === 'update' || firstArg === '--update') {
    await handleUpdateCommand();
    return;
  }

  // Special case: auth command (multi-account management)
  if (firstArg === 'auth') {
    const AuthCommands = require('./auth/auth-commands');
    const authCommands = new AuthCommands();
    await authCommands.route(args.slice(1));
    return;
  }

  // Special case: headless delegation (-p flag)
  if (args.includes('-p') || args.includes('--prompt')) {
    const DelegationHandler = require('./delegation/delegation-handler');
    const handler = new DelegationHandler();
    await handler.route(args);
    return;
  }

  // Auto-recovery for missing configuration
  const recovery = new RecoveryManager();
  const recovered = recovery.recoverAll();

  if (recovered) {
    recovery.showRecoveryHints();
  }

  // Detect profile
  const { profile, remainingArgs } = detectProfile(args);

  // Detect Claude CLI first (needed for all paths)
  const claudeCli = detectClaudeCli();
  if (!claudeCli) {
    ErrorManager.showClaudeNotFound();
    process.exit(1);
  }

  // Use ProfileDetector to determine profile type
  const ProfileDetector = require('./auth/profile-detector');
  const InstanceManager = require('./management/instance-manager');
  const ProfileRegistry = require('./auth/profile-registry');
  const { getSettingsPath } = require('./utils/config-manager');

  const detector = new ProfileDetector();

  try {
    const profileInfo = detector.detectProfileType(profile);

    if (profileInfo.type === 'settings') {
      // Check if this is GLMT profile (requires proxy)
      if (profileInfo.name === 'glmt') {
        // GLMT FLOW: Settings-based with embedded proxy for thinking support
        await execClaudeWithProxy(claudeCli, profileInfo.name, remainingArgs);
      } else {
        // EXISTING FLOW: Settings-based profile (glm, kimi)
        // Use --settings flag (backward compatible)
        const expandedSettingsPath = getSettingsPath(profileInfo.name);
        execClaude(claudeCli, ['--settings', expandedSettingsPath, ...remainingArgs]);
      }
    } else if (profileInfo.type === 'account') {
      // NEW FLOW: Account-based profile (work, personal)
      // All platforms: Use instance isolation with CLAUDE_CONFIG_DIR
      const registry = new ProfileRegistry();
      const instanceMgr = new InstanceManager();

      // Ensure instance exists (lazy init if needed)
      const instancePath = instanceMgr.ensureInstance(profileInfo.name);

      // Update last_used timestamp
      registry.touchProfile(profileInfo.name);

      // Execute Claude with instance isolation
      const envVars = { CLAUDE_CONFIG_DIR: instancePath };
      execClaude(claudeCli, remainingArgs, envVars);
    } else {
      // DEFAULT: No profile configured, use Claude's own defaults
      execClaude(claudeCli, remainingArgs);
    }
  } catch (error) {
    // Check if this is a profile not found error with suggestions
    if (error.profileName && error.availableProfiles !== undefined) {
      const allProfiles = error.availableProfiles.split('\n');
      ErrorManager.showProfileNotFound(error.profileName, allProfiles, error.suggestions);
    } else {
      console.error(`[X] ${error.message}`);
    }
    process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});