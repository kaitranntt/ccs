import { initUI, header, subheader, color, dim, ok, fail, infoBox, warn } from '../../utils/ui';
import { extractOption } from '../arg-extractor';
import {
  applyCliproxyRoutingStrategy,
  applyCliproxySessionAffinitySettings,
  normalizeCliproxyRoutingStrategy,
  normalizeCliproxySessionAffinityEnabled,
  normalizeCliproxySessionAffinityTtl,
  readCliproxyRoutingState,
  readCliproxySessionAffinityState,
} from '../../cliproxy/routing/routing-strategy';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';

function printStrategyGuide(): void {
  console.log(subheader('Routing Modes:'));
  console.log(`  ${color('round-robin', 'command')} Spread requests across matching accounts.`);
  console.log(`  ${dim('    Best when you want even usage and predictable distribution.')}`);
  console.log('');
  console.log(`  ${color('fill-first', 'command')} Drain one available account before moving on.`);
  console.log(
    `  ${dim('    Best when you want backup accounts to stay cold until the active one hits a limit.')}`
  );
  console.log('');
  console.log(
    dim(
      '  Default stays round-robin. CCS will not switch strategy from your account mix automatically.'
    )
  );
  console.log('');
}

function printSessionAffinityGuide(): void {
  console.log(subheader('Session Affinity:'));
  console.log(
    `  ${color('session-affinity off', 'command')} Each request follows the base routing strategy.`
  );
  console.log(`  ${dim('    Best when you want pure proxy-wide balancing behavior.')}`);
  console.log('');
  console.log(
    `  ${color('session-affinity on', 'command')} Keep one conversation pinned to the same account when possible.`
  );
  console.log(
    `  ${dim('    Best when you want stronger prompt-cache locality for a single conversation.')}`
  );
  console.log('');
}

function printSessionRecognitionGuide(): void {
  console.log(subheader('How CLIProxy Knows A Session Is New:'));
  console.log(
    `  ${dim('  CLIProxy prefers explicit session or thread identifiers when clients send them.')}`
  );
  console.log(
    `  ${dim('  Common examples: Claude session UUIDs, X-Session-ID, or provider-specific thread ids.')}`
  );
  console.log(
    `  ${dim('  If no explicit identifier is present, it can fall back to fields such as metadata.user_id or conversation_id.')}`
  );
  console.log(
    `  ${dim('  Last resort: it derives a stable key from the opening prompt history.')}`
  );
  console.log(
    `  ${dim('  Exact precedence can vary by upstream backend/runtime version, so CCS does not promise one universal order.')}`
  );
  console.log('');
}

export async function handleRoutingStatus(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Routing Strategy'));
  console.log('');

  const [state, sessionAffinity] = await Promise.all([
    readCliproxyRoutingState(),
    readCliproxySessionAffinityState(),
  ]);
  console.log(`  Current: ${color(state.strategy, 'command')}`);
  console.log(`  Target:  ${color(state.target, 'info')}`);
  console.log(
    `  Source:  ${color(state.source === 'live' ? 'live CLIProxy' : 'saved startup default', 'info')}`
  );
  if (state.message) {
    console.log('');
    console.log(infoBox(state.message, state.reachable ? 'INFO' : 'WARNING'));
  }
  console.log(
    `  Session Affinity: ${
      sessionAffinity.manageable
        ? color(sessionAffinity.enabled ? 'on' : 'off', 'command')
        : color('unsupported', 'warning')
    }`
  );
  if (sessionAffinity.ttl) {
    console.log(`  Affinity TTL: ${color(sessionAffinity.ttl, 'info')}`);
  }
  if (sessionAffinity.message) {
    console.log('');
    console.log(
      infoBox(
        sessionAffinity.message,
        sessionAffinity.manageable && sessionAffinity.reachable ? 'INFO' : 'WARNING'
      )
    );
  }
  console.log('');
  printStrategyGuide();
  printSessionAffinityGuide();
}

export async function handleRoutingExplain(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Routing Guide'));
  console.log('');
  printStrategyGuide();
  printSessionAffinityGuide();
  printSessionRecognitionGuide();
}

export async function handleRoutingSet(args: string[]): Promise<void> {
  const requested = normalizeCliproxyRoutingStrategy(args[0]);
  if (!requested) {
    await initUI();
    console.log('');
    console.log(fail('Invalid strategy. Use: round-robin or fill-first'));
    console.log('');
    printStrategyGuide();
    process.exitCode = 1;
    return;
  }

  await initUI();
  console.log('');
  console.log(header('Update CLIProxy Routing'));
  console.log('');

  // Pool routing is active: the generator bypasses stored routing and emits
  // fill-first/affinity regardless.  Storing a strategy here creates a divergence
  // between the unified config and the emitted config.yaml — warn the user.
  const config = loadOrCreateUnifiedConfig();
  if (config.cliproxy?.pool_routing?.enabled === true) {
    console.log(
      warn(
        '[!] Pool routing is active. The stored strategy will not take effect\n' +
          '    until pool routing is disabled: ccs cliproxy pool --disable'
      )
    );
    console.log('');
  }

  const result = await applyCliproxyRoutingStrategy(requested);
  console.log(ok(`Routing strategy set to ${requested}`));
  console.log(`  Applied: ${color(result.applied, 'info')}`);
  console.log(`  Target:  ${color(result.target, 'info')}`);
  if (result.message) {
    console.log('');
    console.log(infoBox(result.message, result.reachable ? 'SUCCESS' : 'INFO'));
  }
  console.log('');
}

export async function handleRoutingAffinityStatus(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Session Affinity'));
  console.log('');

  const state = await readCliproxySessionAffinityState();
  if (!state.manageable) {
    console.log(`  Status: ${color('unsupported', 'warning')}`);
  } else {
    console.log(`  Status: ${color(state.enabled ? 'on' : 'off', 'command')}`);
  }
  console.log(
    `  Source: ${state.manageable ? color('saved local setting', 'info') : color('unsupported', 'warning')}`
  );
  console.log(`  Target: ${color(state.target, 'info')}`);
  if (state.ttl) {
    console.log(`  TTL:    ${color(state.ttl, 'info')}`);
  }
  if (state.message) {
    console.log('');
    console.log(infoBox(state.message, state.manageable && state.reachable ? 'INFO' : 'WARNING'));
  }
  console.log('');
  printSessionAffinityGuide();
  printSessionRecognitionGuide();
}

export async function handleRoutingAffinityHelp(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Session Affinity'));
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs cliproxy routing affinity', 'command')}`);
  console.log(`  ${color('ccs cliproxy routing affinity on', 'command')}`);
  console.log(`  ${color('ccs cliproxy routing affinity off', 'command')}`);
  console.log(`  ${color('ccs cliproxy routing affinity on --ttl 1h', 'command')}`);
  console.log('');
  printSessionAffinityGuide();
  console.log(`  ${dim('Accepted TTL examples: 30m, 1h, 2h30m')}`);
  console.log('');
  printSessionRecognitionGuide();
}

export async function handleRoutingAffinitySet(args: string[]): Promise<void> {
  const requested = normalizeCliproxySessionAffinityEnabled(args[0]);
  const extractedTtl = extractOption(args.slice(1), ['--ttl']);
  const remainingArgs = extractedTtl.remainingArgs.filter((token) => token.trim().length > 0);
  const ttl: string | undefined =
    extractedTtl.found && !extractedTtl.missingValue
      ? (normalizeCliproxySessionAffinityTtl(extractedTtl.value) ?? undefined)
      : undefined;

  if (
    requested === null ||
    extractedTtl.missingValue ||
    (extractedTtl.found && !ttl) ||
    remainingArgs.length > 0
  ) {
    await initUI();
    console.log('');
    console.log(
      fail('Invalid session affinity command. Use: routing affinity <on|off> [--ttl 1h]')
    );
    console.log('');
    printSessionAffinityGuide();
    console.log(`  ${dim('Accepted TTL examples: 30m, 1h, 2h30m')}`);
    console.log('');
    process.exitCode = 1;
    return;
  }

  await initUI();
  console.log('');
  console.log(header('Update CLIProxy Session Affinity'));
  console.log('');

  // Pool routing is active: the generator bypasses stored session-affinity and emits
  // affinity:true/1h regardless.  Storing a value here creates a divergence between
  // the unified config and the emitted config.yaml — warn the user.
  const affinityConfig = loadOrCreateUnifiedConfig();
  if (affinityConfig.cliproxy?.pool_routing?.enabled === true) {
    console.log(
      warn(
        '[!] Pool routing is active. The stored affinity setting will not take effect\n' +
          '    until pool routing is disabled: ccs cliproxy pool --disable'
      )
    );
    console.log('');
  }

  const result = await applyCliproxySessionAffinitySettings({
    enabled: requested,
    ttl,
  });

  if (!result.manageable) {
    console.log(fail(result.message || 'Session affinity is not supported for this target.'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log(ok(`Session affinity ${requested ? 'enabled' : 'disabled'}`));
  if (result.ttl) {
    console.log(`  TTL:     ${color(result.ttl, 'info')}`);
  }
  console.log(`  Applied: ${color(result.applied, 'info')}`);
  if (result.message) {
    console.log('');
    console.log(infoBox(result.message, result.reachable ? 'SUCCESS' : 'INFO'));
  }
  console.log('');
}
