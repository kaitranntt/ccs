/**
 * Tokens Command
 *
 * Manage CLIProxyAPI auth tokens (API key and management secret).
 *
 * Usage:
 *   ccs tokens                       Show current tokens (masked)
 *   ccs tokens --show                Show tokens unmasked
 *   ccs tokens --api-key <key>       Set global API key
 *   ccs tokens --secret <key>        Set management secret
 *   ccs tokens --regenerate-secret   Auto-generate new management secret
 *   ccs tokens --reset               Reset to defaults
 *   ccs tokens --variant <name> --api-key <key>  Set per-variant API key
 */

import { initUI, ok, info, fail, warn, color, dim, header, subheader } from '../utils/ui';
import {
  generateSecureToken,
  maskToken,
  setGlobalApiKey,
  setGlobalManagementSecret,
  setVariantApiKey,
  resetAuthToDefaults,
  getAuthSummary,
} from '../cliproxy';
import { regenerateConfig } from '../cliproxy/config/config-generator';

/**
 * Display current auth status
 */
async function showAuthStatus(showUnmasked: boolean): Promise<void> {
  await initUI();

  const summary = getAuthSummary();

  console.log(header('CLIProxy Auth Tokens'));
  console.log('');

  // API Key
  const apiKeyDisplay = showUnmasked ? summary.apiKey.value : maskToken(summary.apiKey.value);
  const apiKeyStatus = summary.apiKey.isCustom ? color('(custom)', 'warning') : dim('(default)');
  console.log(`  API Key:           ${apiKeyDisplay} ${apiKeyStatus}`);

  // Management Secret
  const secretDisplay = showUnmasked
    ? summary.managementSecret.value
    : maskToken(summary.managementSecret.value);
  const secretStatus = summary.managementSecret.isCustom
    ? color('(custom)', 'warning')
    : dim('(default)');
  console.log(`  Management Secret: ${secretDisplay} ${secretStatus}`);

  console.log('');

  if (showUnmasked) {
    console.log(warn('Tokens shown in plain text. Do not share!'));
    console.log('');
  }

  console.log(subheader('Usage'));
  console.log(`  ${dim('Set API key:')}       ccs tokens --api-key <key>`);
  console.log(`  ${dim('Set secret:')}        ccs tokens --secret <key>`);
  console.log(`  ${dim('Generate secret:')}   ccs tokens --regenerate-secret`);
  console.log(`  ${dim('Reset to defaults:')} ccs tokens --reset`);
  console.log('');
}

/**
 * Handle tokens command
 */
export async function handleTokensCommand(args: string[]): Promise<number> {
  await initUI();

  const showFlag = args.includes('--show');
  const resetFlag = args.includes('--reset');
  const regenerateSecretFlag = args.includes('--regenerate-secret');
  const helpFlag = args.includes('--help') || args.includes('-h');
  const apiKeyIndex = args.indexOf('--api-key');
  const hasApiKeyFlag = apiKeyIndex !== -1;
  const apiKeyValue = apiKeyIndex !== -1 ? args[apiKeyIndex + 1] : undefined;
  const secretIndex = args.indexOf('--secret');
  const hasSecretFlag = secretIndex !== -1;
  const secretValue = secretIndex !== -1 ? args[secretIndex + 1] : undefined;
  const variantIndex = args.indexOf('--variant');
  const variantValue = variantIndex !== -1 ? args[variantIndex + 1] : undefined;

  if (helpFlag) {
    console.log(header('CCS Tokens Management'));
    console.log('');
    console.log(subheader('Usage'));
    console.log(`  ${color('ccs tokens', 'command')} [options]`);
    console.log('');
    console.log(subheader('Options'));
    console.log(`  ${color('(no args)', 'command')}              Show masked tokens`);
    console.log(`  ${color('--show', 'command')}                 Show tokens unmasked`);
    console.log(`  ${color('--api-key <key>', 'command')}        Set global API key`);
    console.log(`  ${color('--secret <key>', 'command')}         Set management secret`);
    console.log(`  ${color('--regenerate-secret', 'command')}    Generate new management secret`);
    console.log(
      `  ${color('--variant <name>', 'command')}       Target specific variant (with --api-key)`
    );
    console.log(`  ${color('--reset', 'command')}                Reset all to defaults`);
    console.log(`  ${color('--help, -h', 'command')}             Show this help`);
    console.log('');
    console.log(subheader('Examples'));
    console.log(`  ${dim('# View current tokens')}`);
    console.log(`  ccs tokens`);
    console.log('');
    console.log(`  ${dim('# Set custom API key')}`);
    console.log(`  ccs tokens --api-key my-custom-key-123`);
    console.log('');
    console.log(`  ${dim('# Generate secure management secret')}`);
    console.log(`  ccs tokens --regenerate-secret`);
    console.log('');
    console.log(`  ${dim('# Set per-variant API key')}`);
    console.log(`  ccs tokens --variant my-gemini --api-key variant-key-456`);
    console.log('');
    return 0;
  }

  if (resetFlag) {
    resetAuthToDefaults();
    regenerateConfig();
    console.log(ok('Auth tokens reset to defaults'));
    console.log(info('CLIProxy config regenerated'));
    return 0;
  }

  if (regenerateSecretFlag && hasSecretFlag) {
    console.error(fail('Cannot combine --secret with --regenerate-secret'));
    return 1;
  }

  if (hasApiKeyFlag && (!apiKeyValue || apiKeyValue.startsWith('-'))) {
    console.error(fail('Missing value for --api-key'));
    return 1;
  }

  if (hasSecretFlag && (!secretValue || secretValue.startsWith('-'))) {
    console.error(fail('Missing value for --secret'));
    return 1;
  }

  // --variant without --api-key is a misuse — it has no effect without a key to assign.
  if (variantValue !== undefined && !hasApiKeyFlag) {
    console.error(fail('--variant requires --api-key'));
    console.error(info('Usage: ccs tokens --variant <name> --api-key <key>'));
    return 1;
  }

  let updated = false;

  if (regenerateSecretFlag) {
    const newSecret = generateSecureToken(32);
    setGlobalManagementSecret(newSecret);
    console.log(ok('New management secret generated'));
    console.log(`  Secret: ${maskToken(newSecret)}`);
    updated = true;
  }

  if (hasApiKeyFlag) {
    const resolvedApiKey = apiKeyValue;

    if (variantValue) {
      try {
        setVariantApiKey(variantValue, resolvedApiKey);
        console.log(ok(`API key set for variant '${variantValue}'`));
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        console.error(fail(error));
        return 1;
      }
    } else {
      setGlobalApiKey(resolvedApiKey);
      console.log(ok('Global API key updated'));
    }
    updated = true;
  }

  if (hasSecretFlag) {
    setGlobalManagementSecret(secretValue);
    console.log(ok('Management secret updated'));
    updated = true;
  }

  if (updated) {
    regenerateConfig();
    console.log(info('CLIProxy config regenerated'));
    console.log(warn('Restart CLIProxy to apply: ccs cliproxy restart'));
    return 0;
  }

  await showAuthStatus(showFlag);
  return 0;
}
