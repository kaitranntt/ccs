'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Shell Completion Installer
 * Auto-configures shell completion for bash, zsh, fish, PowerShell
 */

class ShellCompletionInstaller {
  constructor() {
    this.homeDir = os.homedir();
    this.ccsDir = path.join(this.homeDir, '.ccs');
    this.completionDir = path.join(this.ccsDir, 'completions');
    this.scriptsDir = path.join(__dirname, '../../scripts/completion');
  }

  /**
   * Detect current shell
   */
  detectShell() {
    const shell = process.env.SHELL || '';

    if (shell.includes('bash')) return 'bash';
    if (shell.includes('zsh')) return 'zsh';
    if (shell.includes('fish')) return 'fish';
    if (process.platform === 'win32') return 'powershell';

    return null;
  }

  /**
   * Ensure completion files are in ~/.ccs/completions/
   */
  ensureCompletionFiles() {
    if (!fs.existsSync(this.completionDir)) {
      fs.mkdirSync(this.completionDir, { recursive: true });
    }

    // Copy completion scripts
    const files = ['ccs.bash', 'ccs.zsh', 'ccs.fish', 'ccs.ps1'];
    files.forEach(file => {
      const src = path.join(this.scriptsDir, file);
      const dest = path.join(this.completionDir, file);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });
  }

  /**
   * Install bash completion
   */
  installBash() {
    const rcFile = path.join(this.homeDir, '.bashrc');
    const completionPath = path.join(this.completionDir, 'ccs.bash');

    if (!fs.existsSync(completionPath)) {
      throw new Error('Completion file not found. Please reinstall CCS.');
    }

    const marker = '# CCS shell completion';
    const sourceCmd = `source "${completionPath}"`;
    const block = `\n${marker}\n${sourceCmd}\n`;

    // Check if already installed
    if (fs.existsSync(rcFile)) {
      const content = fs.readFileSync(rcFile, 'utf8');
      if (content.includes(marker)) {
        return { success: true, alreadyInstalled: true };
      }
    }

    // Append to .bashrc
    fs.appendFileSync(rcFile, block);

    return {
      success: true,
      message: `Added to ${rcFile}`,
      reload: 'source ~/.bashrc'
    };
  }

  /**
   * Install zsh completion
   */
  installZsh() {
    const rcFile = path.join(this.homeDir, '.zshrc');
    const completionPath = path.join(this.completionDir, 'ccs.zsh');
    const zshCompDir = path.join(this.homeDir, '.zsh', 'completion');

    if (!fs.existsSync(completionPath)) {
      throw new Error('Completion file not found. Please reinstall CCS.');
    }

    // Create zsh completion directory
    if (!fs.existsSync(zshCompDir)) {
      fs.mkdirSync(zshCompDir, { recursive: true });
    }

    // Copy to zsh completion directory
    const destFile = path.join(zshCompDir, '_ccs');
    fs.copyFileSync(completionPath, destFile);

    const marker = '# CCS shell completion';
    const setupCmds = [
      'fpath=(~/.zsh/completion $fpath)',
      'autoload -Uz compinit && compinit'
    ];
    const block = `\n${marker}\n${setupCmds.join('\n')}\n`;

    // Check if already installed
    if (fs.existsSync(rcFile)) {
      const content = fs.readFileSync(rcFile, 'utf8');
      if (content.includes(marker)) {
        return { success: true, alreadyInstalled: true };
      }
    }

    // Append to .zshrc
    fs.appendFileSync(rcFile, block);

    return {
      success: true,
      message: `Added to ${rcFile}`,
      reload: 'source ~/.zshrc'
    };
  }

  /**
   * Install fish completion
   */
  installFish() {
    const completionPath = path.join(this.completionDir, 'ccs.fish');
    const fishCompDir = path.join(this.homeDir, '.config', 'fish', 'completions');

    if (!fs.existsSync(completionPath)) {
      throw new Error('Completion file not found. Please reinstall CCS.');
    }

    // Create fish completion directory
    if (!fs.existsSync(fishCompDir)) {
      fs.mkdirSync(fishCompDir, { recursive: true });
    }

    // Copy to fish completion directory (fish auto-loads from here)
    const destFile = path.join(fishCompDir, 'ccs.fish');
    fs.copyFileSync(completionPath, destFile);

    return {
      success: true,
      message: `Installed to ${destFile}`,
      reload: 'Fish auto-loads completions (no reload needed)'
    };
  }

  /**
   * Install PowerShell completion
   */
  installPowerShell() {
    const profilePath = process.env.PROFILE || path.join(
      this.homeDir,
      'Documents',
      'PowerShell',
      'Microsoft.PowerShell_profile.ps1'
    );
    const completionPath = path.join(this.completionDir, 'ccs.ps1');

    if (!fs.existsSync(completionPath)) {
      throw new Error('Completion file not found. Please reinstall CCS.');
    }

    const marker = '# CCS shell completion';
    const sourceCmd = `. "${completionPath.replace(/\\/g, '\\\\')}"`;
    const block = `\n${marker}\n${sourceCmd}\n`;

    // Create profile directory if needed
    const profileDir = path.dirname(profilePath);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Check if already installed
    if (fs.existsSync(profilePath)) {
      const content = fs.readFileSync(profilePath, 'utf8');
      if (content.includes(marker)) {
        return { success: true, alreadyInstalled: true };
      }
    }

    // Append to PowerShell profile
    fs.appendFileSync(profilePath, block);

    return {
      success: true,
      message: `Added to ${profilePath}`,
      reload: '. $PROFILE'
    };
  }

  /**
   * Install for detected or specified shell
   */
  install(shell = null) {
    const targetShell = shell || this.detectShell();

    if (!targetShell) {
      throw new Error('Could not detect shell. Please specify: --bash, --zsh, --fish, or --powershell');
    }

    // Ensure completion files exist
    this.ensureCompletionFiles();

    // Install for target shell
    switch (targetShell) {
      case 'bash':
        return this.installBash();
      case 'zsh':
        return this.installZsh();
      case 'fish':
        return this.installFish();
      case 'powershell':
        return this.installPowerShell();
      default:
        throw new Error(`Unsupported shell: ${targetShell}`);
    }
  }
}

module.exports = { ShellCompletionInstaller };
