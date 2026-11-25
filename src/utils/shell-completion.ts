import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigError, ValidationError } from '../errors/error-types';
import { getCcsDir } from './config-manager';
// import { execSync } from 'child_process'; // Currently unused

type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell' | null;

interface InstallResult {
  success: boolean;
  alreadyInstalled?: boolean;
  message?: string;
  reload?: string;
}

/**
 * Shell Completion Installer
 * Auto-configures shell completion for bash, zsh, fish, PowerShell
 */
export class ShellCompletionInstaller {
  private homeDir: string;
  private ccsDir: string;
  private completionDir: string;
  private scriptsDir: string;

  constructor() {
    this.homeDir = os.homedir();
    this.ccsDir = getCcsDir();
    this.completionDir = path.join(this.ccsDir, 'completions');
    this.scriptsDir = path.join(__dirname, '../../scripts/completion');
  }

  /**
   * Detect current shell
   */
  detectShell(): ShellType {
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
  ensureCompletionFiles(): void {
    if (!fs.existsSync(this.completionDir)) {
      fs.mkdirSync(this.completionDir, { recursive: true });
    }

    // Copy completion scripts
    const files = ['ccs.bash', 'ccs.zsh', 'ccs.fish', 'ccs.ps1'];
    files.forEach((file) => {
      const src = path.join(this.scriptsDir, file);
      const dest = path.join(this.completionDir, file);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });
  }

  /**
   * Safely create directory, checking for file conflicts
   */
  private ensureDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        throw new ConfigError(
          `Cannot create directory: ${dirPath} exists but is a file.\n` +
            `Please remove or rename this file and try again.`,
          dirPath
        );
      }
      // Directory exists, nothing to do
      return;
    }

    // Check parent directories recursively
    const parentDir = path.dirname(dirPath);
    if (parentDir !== dirPath) {
      this.ensureDirectory(parentDir);
    }

    // Create the directory
    fs.mkdirSync(dirPath);
  }

  /**
   * Install bash completion
   */
  private installBash(force = false): InstallResult {
    const rcFile = path.join(this.homeDir, '.bashrc');
    const completionPath = path.join(this.completionDir, 'ccs.bash');

    if (!fs.existsSync(completionPath)) {
      throw new ConfigError('Completion file not found. Please reinstall CCS.');
    }

    const marker = '# CCS shell completion';
    const sourceCmd = `source "${completionPath}"`;
    const block = `\n${marker}\n${sourceCmd}\n`;

    // Check if already installed
    if (fs.existsSync(rcFile)) {
      const content = fs.readFileSync(rcFile, 'utf8');
      if (content.includes(marker)) {
        if (!force) {
          return { success: true, alreadyInstalled: true };
        }
        // Force: completion files already updated by ensureCompletionFiles()
        return {
          success: true,
          message: `Updated completion files in ${this.completionDir}`,
          reload: 'source ~/.bashrc',
        };
      }
    }

    // Append to .bashrc
    fs.appendFileSync(rcFile, block);

    return {
      success: true,
      message: `Added to ${rcFile}`,
      reload: 'source ~/.bashrc',
    };
  }

  /**
   * Install zsh completion
   */
  private installZsh(force = false): InstallResult {
    const rcFile = path.join(this.homeDir, '.zshrc');
    const completionPath = path.join(this.completionDir, 'ccs.zsh');
    const zshCompDir = path.join(this.homeDir, '.zsh', 'completion');

    if (!fs.existsSync(completionPath)) {
      throw new ConfigError('Completion file not found. Please reinstall CCS.');
    }

    // Create zsh completion directory (with file conflict checking)
    this.ensureDirectory(zshCompDir);

    // Copy to zsh completion directory (always update for force)
    const destFile = path.join(zshCompDir, '_ccs');
    fs.copyFileSync(completionPath, destFile);

    const marker = '# CCS shell completion';
    const setupCmds = ['fpath=(~/.zsh/completion $fpath)', 'autoload -Uz compinit && compinit'];
    const block = `\n${marker}\n${setupCmds.join('\n')}\n`;

    // Check if already installed
    if (fs.existsSync(rcFile)) {
      const content = fs.readFileSync(rcFile, 'utf8');
      if (content.includes(marker)) {
        if (!force) {
          return { success: true, alreadyInstalled: true };
        }
        // Force: files already updated above
        return {
          success: true,
          message: `Updated ${destFile}`,
          reload: 'source ~/.zshrc',
        };
      }
    }

    // Append to .zshrc
    fs.appendFileSync(rcFile, block);

    return {
      success: true,
      message: `Added to ${rcFile}`,
      reload: 'source ~/.zshrc',
    };
  }

  /**
   * Install fish completion
   */
  private installFish(force = false): InstallResult {
    const completionPath = path.join(this.completionDir, 'ccs.fish');
    const fishCompDir = path.join(this.homeDir, '.config', 'fish', 'completions');

    if (!fs.existsSync(completionPath)) {
      throw new ConfigError('Completion file not found. Please reinstall CCS.');
    }

    // Create fish completion directory (with file conflict checking)
    this.ensureDirectory(fishCompDir);

    // Copy to fish completion directory (fish auto-loads from here)
    const destFile = path.join(fishCompDir, 'ccs.fish');

    // Check if already installed
    if (fs.existsSync(destFile) && !force) {
      return { success: true, alreadyInstalled: true };
    }

    fs.copyFileSync(completionPath, destFile);

    return {
      success: true,
      message: `Installed to ${destFile}`,
      reload: 'Fish auto-loads completions (no reload needed)',
    };
  }

  /**
   * Install PowerShell completion
   */
  private installPowerShell(force = false): InstallResult {
    const profilePath =
      process.env.PROFILE ||
      path.join(this.homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
    const completionPath = path.join(this.completionDir, 'ccs.ps1');

    if (!fs.existsSync(completionPath)) {
      throw new ConfigError('Completion file not found. Please reinstall CCS.');
    }

    const marker = '# CCS shell completion';
    const sourceCmd = `. "${completionPath.replace(/\\/g, '\\\\')}"`;
    const block = `\n${marker}\n${sourceCmd}\n`;

    // Create profile directory if needed (with file conflict checking)
    const profileDir = path.dirname(profilePath);
    this.ensureDirectory(profileDir);

    // Check if already installed
    if (fs.existsSync(profilePath)) {
      const content = fs.readFileSync(profilePath, 'utf8');
      if (content.includes(marker)) {
        if (!force) {
          return { success: true, alreadyInstalled: true };
        }
        // Force: completion files already updated by ensureCompletionFiles()
        return {
          success: true,
          message: `Updated completion files in ${this.completionDir}`,
          reload: '. $PROFILE',
        };
      }
    }

    // Append to PowerShell profile
    fs.appendFileSync(profilePath, block);

    return {
      success: true,
      message: `Added to ${profilePath}`,
      reload: '. $PROFILE',
    };
  }

  /**
   * Install for detected or specified shell
   */
  install(shell: ShellType = null, options: { force?: boolean } = {}): InstallResult {
    const targetShell = shell || this.detectShell();
    const { force = false } = options;

    if (!targetShell) {
      throw new ValidationError(
        'Could not detect shell. Please specify: --bash, --zsh, --fish, or --powershell',
        'shell'
      );
    }

    // Ensure completion files exist (always copy latest)
    this.ensureCompletionFiles();

    // Install for target shell
    switch (targetShell) {
      case 'bash':
        return this.installBash(force);
      case 'zsh':
        return this.installZsh(force);
      case 'fish':
        return this.installFish(force);
      case 'powershell':
        return this.installPowerShell(force);
      default:
        throw new ValidationError(`Unsupported shell: ${targetShell}`, 'shell');
    }
  }
}
