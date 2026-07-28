/**
 * Version Command Handler
 *
 * Handle --version command for CCS.
 */

import * as path from 'path';
import * as fs from 'fs';
import { initUI, header, subheader, color, warn } from '../utils/ui';
import { getActiveConfigPath } from '../utils/config-manager';
import { getVersion } from '../utils/version';
import { getProfileLookupCandidates } from '../utils/profile-compat';
import { getCcsDir } from '../config/config-loader-facade';

/**
 * Handle version command
 */
export async function handleVersionCommand(): Promise<void> {
  await initUI();
  console.log(header(`CCS (Claude Codex Switch) v${getVersion()}`));
  console.log('');

  console.log(subheader('Installation:'));
  const installLocation = process.argv[1] || '(not found)';
  console.log(`  ${color('Location:'.padEnd(17), 'info')} ${installLocation}`);

  const ccsDir = getCcsDir();
  console.log(`  ${color('CCS Directory:'.padEnd(17), 'info')} ${ccsDir}`);

  const configPath = getActiveConfigPath();
  console.log(`  ${color('Config:'.padEnd(17), 'info')} ${configPath}`);

  const profilesJson = path.join(ccsDir, 'profiles.json');
  console.log(`  ${color('Profiles:'.padEnd(17), 'info')} ${profilesJson}`);

  // Delegation status
  const delegationSessionsPath = path.join(ccsDir, 'delegation-sessions.json');
  const delegationConfigured = fs.existsSync(delegationSessionsPath);

  const readyProfiles: string[] = [];

  // Check for profiles with valid API keys
  for (const profile of ['glm', 'km']) {
    const settingsPath = getProfileLookupCandidates(profile)
      .map((candidate) => path.join(ccsDir, `${candidate}.settings.json`))
      .find((candidatePath) => fs.existsSync(candidatePath));

    if (!settingsPath) {
      continue;
    }

    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN;
      if (apiKey && !apiKey.match(/YOUR_.*_API_KEY_HERE/) && !apiKey.match(/sk-test.*/)) {
        readyProfiles.push(profile);
      }
    } catch (_error) {
      // Invalid JSON, skip
    }
  }

  const hasValidApiKeys = readyProfiles.length > 0;
  const delegationEnabled = delegationConfigured || hasValidApiKeys;

  if (delegationEnabled) {
    console.log(`  ${color('Delegation:'.padEnd(17), 'info')} Enabled`);
  } else {
    console.log(`  ${color('Delegation:'.padEnd(17), 'info')} Not configured`);
  }

  console.log('');

  if (readyProfiles.length > 0) {
    console.log(subheader('Delegation Ready:'));
    console.log(
      `  ${color('[OK]', 'warning')} ${readyProfiles.join(', ')} profiles are ready for delegation`
    );
    console.log('');
  } else if (delegationEnabled) {
    console.log(subheader('Delegation Ready:'));
    console.log(warn('Delegation configured but no valid API keys found'));
    console.log('');
  }

  console.log(`${subheader('Documentation:')} ${color('https://docs.ccs.kaitran.ca', 'path')}`);
  console.log(`${subheader('License:')} MIT`);
  console.log('');
  console.log(color("Run 'ccs --help' for usage information", 'command'));

  process.exit(0);
}
