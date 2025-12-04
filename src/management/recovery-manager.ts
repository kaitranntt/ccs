/**
 * Auto-recovery for missing or corrupted configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Recovery Manager Class
 */
class RecoveryManager {
  private readonly homedir: string;
  private readonly ccsDir: string;
  private readonly claudeDir: string;
  private recovered: string[];

  constructor() {
    this.homedir = os.homedir();
    this.ccsDir = path.join(this.homedir, '.ccs');
    this.claudeDir = path.join(this.homedir, '.claude');
    this.recovered = [];
  }

  /**
   * Ensure ~/.ccs/ directory exists
   */
  ensureCcsDirectory(): boolean {
    if (!fs.existsSync(this.ccsDir)) {
      fs.mkdirSync(this.ccsDir, { recursive: true, mode: 0o755 });
      this.recovered.push('Created ~/.ccs/ directory');
      return true;
    }
    return false;
  }

  /**
   * Ensure ~/.ccs/config.json exists with defaults
   */
  ensureConfigJson(): boolean {
    const configPath = path.join(this.ccsDir, 'config.json');

    // Check if exists and valid
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        JSON.parse(content); // Validate JSON
        return false; // No recovery needed
      } catch (_e) {
        // Corrupted - backup and recreate
        const backupPath = `${configPath}.backup.${Date.now()}`;
        fs.renameSync(configPath, backupPath);
        this.recovered.push(`Backed up corrupted config.json to ${path.basename(backupPath)}`);
      }
    }

    // Create default config
    const defaultConfig = {
      profiles: {
        glm: '~/.ccs/glm.settings.json',
        glmt: '~/.ccs/glmt.settings.json',
        kimi: '~/.ccs/kimi.settings.json',
        default: '~/.claude/settings.json',
      },
    };

    const tmpPath = `${configPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, configPath);

    this.recovered.push('Created ~/.ccs/config.json');
    return true;
  }

  /**
   * Ensure ~/.claude/settings.json exists
   */
  ensureClaudeSettings(): boolean {
    const claudeSettingsPath = path.join(this.claudeDir, 'settings.json');

    // Create ~/.claude/ if missing
    if (!fs.existsSync(this.claudeDir)) {
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o755 });
      this.recovered.push('Created ~/.claude/ directory');
    }

    // Create settings.json if missing
    if (!fs.existsSync(claudeSettingsPath)) {
      const tmpPath = `${claudeSettingsPath}.tmp`;
      fs.writeFileSync(tmpPath, '{}\n', 'utf8');
      fs.renameSync(tmpPath, claudeSettingsPath);

      this.recovered.push('Created ~/.claude/settings.json');
      return true;
    }

    return false;
  }

  /**
   * Run all recovery operations
   */
  recoverAll(): boolean {
    this.recovered = [];

    this.ensureCcsDirectory();
    this.ensureConfigJson();
    this.ensureClaudeSettings();

    return this.recovered.length > 0;
  }

  /**
   * Get recovery summary
   */
  getRecoverySummary(): string[] {
    return this.recovered;
  }

  /**
   * Show recovery hints
   */
  showRecoveryHints(): void {
    if (this.recovered.length === 0) return;

    console.log('');
    console.log('[i] Auto-recovery completed:');
    this.recovered.forEach((msg) => console.log(`    - ${msg}`));

    // Show login hint if created Claude settings
    if (this.recovered.some((msg) => msg.includes('settings.json'))) {
      console.log('');
      console.log('[i] Next step: Login to Claude CLI');
      console.log('    Run: claude /login');
    }

    console.log('');
  }
}

export default RecoveryManager;
