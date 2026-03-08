/**
 * Sync Command Handler
 *
 * Handle sync command for CCS.
 */

import { initUI, header, ok, info } from '../utils/ui';

/**
 * Handle sync command
 */
export async function handleSyncCommand(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Syncing CCS Components...'));
  console.log('');

  // First, copy .claude/ directory from package to ~/.ccs/.claude/
  const { ClaudeDirInstaller } = await import('../utils/claude-dir-installer');
  const installer = new ClaudeDirInstaller();
  installer.install();

  console.log('');

  const cleanupResult = installer.cleanupDeprecated();
  if (cleanupResult.success && cleanupResult.cleanedFiles.length > 0) {
    console.log('');
  }

  // Then, create symlinks from ~/.ccs/.claude/ to ~/.claude/
  const { ClaudeSymlinkManager } = await import('../utils/claude-symlink-manager');
  const manager = new ClaudeSymlinkManager();
  manager.install(false);

  console.log('');

  // Repair shared symlinks (~/.ccs/shared/ → ~/.claude/)
  // This fixes symlinks broken by Claude CLI's atomic writes (e.g., toggle thinking)
  const SharedManager = (await import('../management/shared-manager')).default;
  const sharedManager = new SharedManager();
  sharedManager.ensureSharedDirectories();
  console.log(ok('Shared symlinks verified'));

  // Sync MCP servers from global ~/.claude.json to all non-bare instances
  const { InstanceManager } = await import('../management/instance-manager');
  const instanceMgr = new InstanceManager();
  const ProfileRegistry = (await import('../auth/profile-registry')).default;
  const registry = new ProfileRegistry();
  const allProfiles = registry.getAllProfilesMerged();
  let mcpSynced = 0;

  for (const [name, profile] of Object.entries(allProfiles)) {
    if (profile.bare) {
      continue; // Skip bare profiles
    }

    if (!instanceMgr.hasInstance(name)) {
      continue;
    }

    const instancePath = instanceMgr.getInstancePath(name);
    if (instanceMgr.syncMcpServers(instancePath)) {
      mcpSynced++;
    }
  }

  if (mcpSynced > 0) {
    console.log(ok(`MCP servers synced to ${mcpSynced} instance(s)`));
  } else {
    console.log(info('No instances to sync MCP servers'));
  }

  // Sync skills for isolated-skills profiles
  const { resolveAccountContextPolicy } = await import('../auth/account-context');
  const { loadOrCreateUnifiedConfig } = await import('../config/unified-config-loader');
  const config = loadOrCreateUnifiedConfig();
  let skillsSynced = 0;

  for (const [name, account] of Object.entries(config.accounts)) {
    if (account.skills_mode !== 'isolated') {
      continue;
    }

    if (!instanceMgr.hasInstance(name)) {
      continue;
    }

    const policy = resolveAccountContextPolicy(account);
    const instancePath = instanceMgr.getInstancePath(name);
    await sharedManager.syncSkills(instancePath, policy);
    skillsSynced++;
  }

  if (skillsSynced > 0) {
    console.log(ok(`Skills synced for ${skillsSynced} isolated profile(s)`));
  }

  console.log('');
  console.log(ok('Sync complete!'));
  console.log('');

  process.exit(0);
}
