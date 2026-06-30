/**
 * CLIProxy Pool Routing Subcommand
 *
 * Handles:
 *   ccs cliproxy pool --enable   Enable pool routing (fill-first + affinity + cooling ON)
 *   ccs cliproxy pool --disable  Disable pool routing and restore non-pool config
 *   ccs cliproxy pool            Show current pool routing state
 */

import { initUI, header, ok, warn, info } from '../../utils/ui';
import {
  enablePoolRouting,
  disablePoolRouting,
  POOL_MAX_RETRY_CREDENTIALS,
} from '../../cliproxy/routing/routing-strategy';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import { getProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { getConfigPathForPort, getAuthDir } from '../../cliproxy/config/path-resolver';
import { hasAnyFlag } from '../arg-extractor';

/**
 * Print the manual-config guidance for remote/Docker targets, then refuse.
 * enablePoolRouting/disablePoolRouting only write local config files, so a
 * remote proxy is never touched — refuse rather than lie about hot-reload.
 * Mirrors the remote-refusal copy in order-subcommand and the manual snippet
 * in pool-opt-in-prompt's printRemoteHint().
 */
function printRemotePoolRefusal(enable: boolean): void {
  console.log(
    warn(
      `Remote proxy target detected. Pool routing management for remote proxies is not\n` +
        `    supported in v1. Run this command on the host running CLIProxy instead.`
    )
  );
  console.log('');
  if (enable) {
    console.log('    To enable pool routing manually, add to your CLIProxy config.yaml:');
    console.log('      disable-cooling: false');
    console.log(`      max-retry-credentials: ${POOL_MAX_RETRY_CREDENTIALS}`);
    console.log('      routing:');
    console.log('        strategy: fill-first');
    console.log('        session-affinity: true');
    console.log('        session-affinity-ttl: "1h"');
    console.log('');
  }
}

export async function handlePoolSubcommand(args: string[]): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Pool Routing'));
  console.log('');

  const wantsEnable = hasAnyFlag(args, ['--enable']);
  const wantsDisable = hasAnyFlag(args, ['--disable']);

  // Resolve the real proxy target before any config write.  Remote targets are
  // refused (enable/disable only mutate local files; the remote proxy is never
  // touched, so the "hot-reload" success message would be a lie).  Local targets
  // use the configured lifecycle port so the regenerated config-<port>.yaml is
  // the same file the running proxy reads.
  if (wantsEnable || wantsDisable) {
    const target = getProxyTarget();
    if (target.isRemote) {
      printRemotePoolRefusal(wantsEnable);
      process.exitCode = 1;
      return;
    }
  }

  const port = resolveLifecyclePort();
  const configPath = getConfigPathForPort(port);
  const authDir = getAuthDir();

  if (wantsEnable) {
    const result = enablePoolRouting(port, { configPath, authDir });
    if (result.failed) {
      console.log(warn(result.message));
      process.exitCode = 1;
    } else if (result.changed) {
      // message already carries the correct [OK]/[!] prefix from routing-strategy
      console.log(result.message);
    } else {
      console.log(info(result.message));
    }
    console.log('');
    return;
  }

  if (wantsDisable) {
    const result = disablePoolRouting(port, { configPath, authDir });
    if (result.failed) {
      console.log(warn(result.message));
      process.exitCode = 1;
    } else if (result.changed) {
      // message already carries the correct [OK]/[!] prefix from routing-strategy
      console.log(result.message);
    } else {
      console.log(info(result.message));
    }
    console.log('');
    return;
  }

  // Default: show status
  const config = loadOrCreateUnifiedConfig();
  const enabled = config.cliproxy?.pool_routing?.enabled === true;
  const dismissed = config.cliproxy?.pool_routing?.prompt_dismissed === true;
  const maxRetry = config.cliproxy?.pool_routing?.max_retry_credentials;

  console.log(`  Status:       ${enabled ? ok('enabled') : warn('disabled')}`);
  if (enabled && maxRetry !== undefined) {
    console.log(`  Max retry:    ${maxRetry}`);
  }
  if (!enabled && dismissed) {
    console.log(`  Dismissed:    ${info('yes (prompt will not re-show)')}`);
  }
  console.log('');
  console.log(`  Enable:   ccs cliproxy pool --enable`);
  console.log(`  Disable:  ccs cliproxy pool --disable`);
  console.log('');
}
