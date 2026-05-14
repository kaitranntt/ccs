const os = require('os');
const path = require('path');
const { CCSXP_CLIPROXY_SHORTCUT_ENV } = require('../targets/codex-cliproxy-provider-config');
const { stripTargetFlag } = require('../targets/target-resolver');
const { expandPath } = require('../utils/helpers');
const { fail } = require('../utils/ui');

process.env.CCS_INTERNAL_ENTRY_TARGET = 'codex';
process.env[CCSXP_CLIPROXY_SHORTCUT_ENV] = '1';
const CCSXP_CLIPROXY_OVERRIDE = 'model_provider="cliproxy"';
const DISALLOWED_CCSXP_CONFIG_KEY_REGEX =
  /^(model_provider|local_provider|profile)\s*=|^model_providers\./i;

function isDisallowedCcsxpConfigOverride(value: unknown) {
  return typeof value === 'string' && DISALLOWED_CCSXP_CONFIG_KEY_REGEX.test(value.trim());
}

function findDisallowedCcsxpFlags(args: string[]) {
  const disallowed = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      break;
    }

    if (arg === '-p' || arg === '--profile' || arg.startsWith('--profile=')) {
      disallowed.add('--profile/-p');
      continue;
    }

    if (arg === '--oss') {
      disallowed.add('--oss');
      continue;
    }

    if (arg === '--local-provider' || arg.startsWith('--local-provider=')) {
      disallowed.add('--local-provider');
      continue;
    }

    if (arg === '-c' || arg === '--config') {
      const value = args[index + 1];
      if (isDisallowedCcsxpConfigOverride(value)) {
        disallowed.add('--config/-c provider override');
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (isDisallowedCcsxpConfigOverride(value)) {
        disallowed.add('--config/-c provider override');
      }
    }
  }

  return [...disallowed];
}

function resolveCcsxpCodexHome() {
  const configuredHome = process.env.CCSXP_CODEX_HOME?.trim();
  if (configuredHome) {
    return path.resolve(expandPath(configuredHome));
  }

  return path.join(os.homedir(), '.codex');
}

process.env.CODEX_HOME = resolveCcsxpCodexHome();

// ccsxp is the Codex + cliproxy shortcut. Keep the native Codex history root,
// strip conflicting target overrides, and prepend the native cliproxy provider
// override so the runtime stays as close to plain Codex as possible.
const forwardedArgs = (() => {
  try {
    const disallowedFlags = findDisallowedCcsxpFlags(process.argv.slice(2));
    if (disallowedFlags.length > 0) {
      throw new Error(
        `ccsxp does not allow ${disallowedFlags.join(', ')} because the native cliproxy shortcut owns provider selection. Remove native Codex provider-selection flags and retry.`
      );
    }
    return stripTargetFlag(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(fail(message));
    process.exit(1);
  }
})();

process.argv.splice(
  2,
  process.argv.length - 2,
  '--config',
  CCSXP_CLIPROXY_OVERRIDE,
  ...forwardedArgs
);

require('../ccs');
