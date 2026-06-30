/**
 * Persist Command - Help Text
 *
 * Owns the `ccs persist --help` output. Pure presentation module; no
 * filesystem or profile-resolution side effects.
 */

import { header, subheader, color, dim, initUI } from '../../utils/ui';
import { getClaudeSettingsDisplayPath } from './secure-file';

/** Show help for persist command */
export async function showHelp(): Promise<void> {
  await initUI();
  console.log(header('CCS Persist Command'));
  console.log('');
  console.log(subheader('Usage'));
  console.log(`  ${color('ccs persist', 'command')} <profile> [options]`);
  console.log(`  ${color('ccs persist', 'command')} --list-backups`);
  console.log(`  ${color('ccs persist', 'command')} --restore [timestamp]`);
  console.log('');
  console.log(subheader('Description'));
  console.log("  Writes a profile's Claude setup directly to");
  console.log(`  ${getClaudeSettingsDisplayPath()} for native Claude Code usage.`);
  console.log('');
  console.log('  This is the preferred shared-settings path for Claude Code');
  console.log('  and the Claude IDE extension when you want one profile everywhere.');
  console.log('');
  console.log(subheader('Options'));
  console.log(`  ${color('--yes, -y', 'command')}         Skip confirmation prompts (auto-backup)`);
  console.log(
    `  ${color('--permission-mode <mode>', 'command')}  Set default permission mode in settings.json`
  );
  console.log(
    `  ${color('--dangerously-skip-permissions', 'command')}  Persist auto-approve (bypassPermissions)`
  );
  console.log(`  ${color('--auto-approve', 'command')}  Alias for --dangerously-skip-permissions`);
  console.log(`  ${color('--help, -h', 'command')}        Show this help message`);
  console.log('');
  console.log(subheader('Backup Management'));
  console.log(`  ${color('--list-backups', 'command')}    List available backup files`);
  console.log(`  ${color('--restore', 'command')}         Restore from the most recent backup`);
  console.log(
    `  ${color('--restore <ts>', 'command')}    Restore from specific backup (e.g., 20260110_205324)`
  );
  console.log('');
  console.log(subheader('Supported Profile Types'));
  console.log(`  ${color('API profiles', 'command')}      glm, km, custom API profiles`);
  console.log(`  ${color('CLIProxy', 'command')}          gemini, agy, qwen, kiro, ghcp`);
  console.log(`  ${color('Copilot', 'command')}           copilot (requires copilot-api daemon)`);
  console.log(
    `  ${color('Account profiles', 'command')}  work, personal, client (persists CLAUDE_CONFIG_DIR)`
  );
  console.log(
    `  ${color('default', 'command')}           Clears CCS-managed overrides or inherits mapped continuity`
  );
  console.log('');
  console.log(subheader('Examples'));
  console.log(`  ${dim('# Persist GLM profile')}`);
  console.log(`  ${color('ccs persist glm', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with auto-confirmation')}`);
  console.log(`  ${color('ccs persist gemini --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with default permission mode')}`);
  console.log(`  ${color('ccs persist glm --permission-mode acceptEdits', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist with auto-approve enabled')}`);
  console.log(`  ${color('ccs persist glm --dangerously-skip-permissions', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Persist an account profile for IDE/native Claude use')}`);
  console.log(`  ${color('ccs persist work --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Reset to native Claude defaults (clear CCS-managed overrides)')}`);
  console.log(`  ${color('ccs persist default --yes', 'command')}`);
  console.log('');
  console.log(`  ${dim('# List all backups')}`);
  console.log(`  ${color('ccs persist --list-backups', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Restore latest backup')}`);
  console.log(`  ${color('ccs persist --restore', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Restore specific backup')}`);
  console.log(`  ${color('ccs persist --restore 20260110_205324', 'command')}`);
  console.log('');
  console.log(subheader('Notes'));
  console.log('  [i] CLIProxy profiles require the proxy to be running.');
  console.log(
    '  [i] Codex CLIProxy profiles are native Codex-only: use ccsxp or ccs codex --target codex.'
  );
  console.log('  [i] Copilot profiles require copilot-api daemon.');
  console.log(
    '  [i] Account/default flows remove stale ANTHROPIC_* overrides before applying new setup.'
  );
  console.log(
    '  [i] For IDE-local settings.json snippets, use: ccs env <profile> --format claude-extension'
  );
  console.log(
    `  [i] Backups are saved as ${getClaudeSettingsDisplayPath()}.backup.YYYYMMDD_HHMMSS`
  );
  console.log('');
}
