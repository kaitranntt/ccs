import { initUI, header, ok, info, warn, fail, subheader, color, dim } from '../utils/ui';

import type { OfficialChannelId } from '../config/unified-config-types';
import { DEFAULT_OFFICIAL_CHANNELS_CONFIG } from '../config/unified-config-types';
import {
  clearConfiguredOfficialChannelTokensEverywhere,
  getOfficialChannelTokenStatus,
  hasConfiguredOfficialChannelToken,
  setConfiguredOfficialChannelToken,
} from '../channels/official-channels-store';
import {
  buildOfficialChannelsLaunchPreview,
  buildOfficialChannelsReadinessSummary,
  buildOfficialChannelSetupSummary,
  expandOfficialChannelSelection,
  getChannelConfigSelectionLabel,
  getOfficialChannelChoices,
  getOfficialChannelsAccountStatusCaveat,
  getOfficialChannelsSupportMessage,
  getOfficialChannelDisplayName,
  getOfficialChannelEnvKey,
  getOfficialChannelManualSetupCommands,
  getOfficialChannelsCompatibilityMessage,
  getOfficialChannelsDocsSummary,
  getOfficialChannelsLegacyEnableHelp,
  getOfficialChannelsSetHelp,
  getOfficialChannelTokenHelp,
  getOfficialChannelClearTokenHelp,
  getOfficialChannelMacOSHelp,
  getOfficialChannelSummary,
  getOfficialChannelsEnvironmentStatus,
  getOfficialChannelsRuntimeNote,
  getOfficialChannelsSectionDescription,
  getOfficialChannelsSupportedProfiles,
  getOfficialChannelUnavailableReason,
  getOfficialChannelTokenIds,
  isOfficialChannelId,
  isOfficialChannelSelectionValid,
} from '../channels/official-channels-runtime';
import { extractOption, hasAnyFlag } from './arg-extractor';
import {
  getOfficialChannelsConfig,
  loadOrCreateUnifiedConfig,
  updateConfig,
} from '../config/config-loader-facade';

interface ChannelsCommandOptions {
  enable: boolean;
  disable: boolean;
  clear: boolean;
  unattended: boolean;
  noUnattended: boolean;
  setSelection?: string;
  setSelectionMissing: boolean;
  clearTokenAll: boolean;
  clearTokenChannel?: OfficialChannelId;
  setTokenChannel?: OfficialChannelId;
  setTokenMissing: boolean;
  clearTokenInvalid?: string;
  setTokenInvalid?: string;
  help: boolean;
}

export function parseChannelsCommandArgs(args: string[]): ChannelsCommandOptions {
  const setSelection = extractOption(args, ['--set']);
  const setToken = extractOption(args, ['--set-token']);
  const clearToken = extractOption(args, ['--clear-token']);

  let clearTokenAll = false;
  let clearTokenChannel: OfficialChannelId | undefined;
  let clearTokenInvalid: string | undefined;
  if (clearToken.found) {
    if (clearToken.missingValue) {
      clearTokenAll = true;
    } else if (clearToken.value) {
      const channelId = clearToken.value.trim().toLowerCase();
      if (isOfficialChannelId(channelId)) {
        clearTokenChannel = channelId;
      } else {
        clearTokenInvalid = clearToken.value;
      }
    }
  }

  let parsedSetTokenChannel: OfficialChannelId | undefined;
  let setTokenInvalid: string | undefined;
  if (setToken.found && !setToken.missingValue && setToken.value) {
    const channelId = setToken.value.trim().toLowerCase();
    if (isOfficialChannelId(channelId)) {
      parsedSetTokenChannel = channelId;
    } else {
      setTokenInvalid = setToken.value;
    }
  }

  return {
    enable: hasAnyFlag(args, ['--enable']),
    disable: hasAnyFlag(args, ['--disable']),
    clear: hasAnyFlag(args, ['--clear']),
    unattended: hasAnyFlag(args, ['--unattended']),
    noUnattended: hasAnyFlag(args, ['--no-unattended']),
    setSelection: setSelection.found ? setSelection.value : undefined,
    setSelectionMissing: setSelection.found && setSelection.missingValue,
    clearTokenAll,
    clearTokenChannel,
    clearTokenInvalid,
    setTokenChannel: parsedSetTokenChannel,
    setTokenMissing: setToken.found && setToken.missingValue,
    setTokenInvalid,
    help: hasAnyFlag(args, ['--help', '-h']),
  };
}

function showHelp(): void {
  console.log('');
  console.log(header('ccs config channels'));
  console.log('');
  console.log(`  ${getOfficialChannelsSectionDescription()}`);
  console.log(`  ${dim(getOfficialChannelsDocsSummary())}`);
  console.log(
    `  ${dim('Fastest path: run `ccs config`, open Settings -> Channels, turn on the channel, save the token if needed, then run `ccs`.')}`
  );
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs config channels', 'command')} [options]`);
  console.log('');
  console.log(subheader('Options:'));
  console.log(`  ${color('--set <csv|all>', 'command')}      ${getOfficialChannelsSetHelp()}`);
  console.log(`  ${color('--clear', 'command')}              Clear all selected channels`);
  console.log(
    `  ${color('--enable', 'command')}             Legacy compatibility alias: add Discord`
  );
  console.log(
    `  ${color('--disable', 'command')}            Legacy compatibility alias: remove Discord`
  );
  console.log(
    `  ${color('--unattended', 'command')}         Also add --dangerously-skip-permissions`
  );
  console.log(`  ${color('--no-unattended', 'command')}      Disable unattended runtime flag`);
  console.log(`  ${color('--set-token <channel>', 'command')} ${getOfficialChannelTokenHelp()}`);
  console.log(
    `  ${color('--clear-token [channel]', 'command')} ${getOfficialChannelClearTokenHelp()}`
  );
  console.log(`  ${color('--help, -h', 'command')}           Show this help`);
  console.log('');
  console.log(subheader('Examples:'));
  console.log(
    `  $ ${color('ccs config', 'command')}                                    ${dim('# Dashboard -> Settings -> Channels (fastest path)')}`
  );
  console.log(
    `  $ ${color('ccs config channels', 'command')}                           ${dim('# Show status')}`
  );
  console.log(
    `  $ ${color('ccs config channels --set telegram,discord', 'command')}  ${dim('# Enable Telegram + Discord')}`
  );
  console.log(
    `  $ ${color('ccs config channels --set all', 'command')}               ${dim('# Enable all official channels')}`
  );
  console.log(
    `  $ ${color('TELEGRAM_BOT_TOKEN=123:abc ccs config channels --set-token telegram', 'command')} ${dim('# Save TELEGRAM_BOT_TOKEN')}`
  );
  console.log(
    `  $ ${color('ccs config channels --clear-token discord', 'command')}   ${dim('# Clear one token')}`
  );
  console.log(`  ${dim(getOfficialChannelsSupportMessage())}`);
  console.log('');
}

function showStatus(): void {
  const config = getOfficialChannelsConfig();
  const selected = config.selected;
  const environment = getOfficialChannelsEnvironmentStatus();
  const channelRows = expandOfficialChannelSelection('all').map((channelId) => {
    const selectedForLaunch = selected.includes(channelId);
    const tokenStatus = getOfficialChannelTokenStatus(channelId);

    return {
      id: channelId,
      displayName: getOfficialChannelDisplayName(channelId),
      selected: selectedForLaunch,
      requiresToken: getOfficialChannelTokenIds().includes(channelId),
      tokenConfigured: hasConfiguredOfficialChannelToken(channelId),
      tokenStatus,
      unavailableReason: getOfficialChannelUnavailableReason(channelId),
      setup: buildOfficialChannelSetupSummary({
        id: channelId,
        displayName: getOfficialChannelDisplayName(channelId),
        selected: selectedForLaunch,
        requiresToken: getOfficialChannelTokenIds().includes(channelId),
        tokenAvailable: tokenStatus.available,
        tokenSource: tokenStatus.source,
        savedInClaudeState: tokenStatus.savedInClaudeState,
        processEnvAvailable: tokenStatus.processEnvAvailable,
        unavailableReason: getOfficialChannelUnavailableReason(channelId),
      }),
    };
  });
  const summary = buildOfficialChannelsReadinessSummary({
    config,
    environment,
    channels: channelRows.map((channel) => ({
      id: channel.id,
      displayName: channel.displayName,
      selected: channel.selected,
      requiresToken: channel.requiresToken,
      tokenAvailable: channel.tokenStatus.available,
      tokenSource: channel.tokenStatus.source,
      savedInClaudeState: channel.tokenStatus.savedInClaudeState,
      processEnvAvailable: channel.tokenStatus.processEnvAvailable,
      unavailableReason: channel.unavailableReason,
    })),
  });
  const launchPreview = buildOfficialChannelsLaunchPreview({
    config,
    environment,
    channels: channelRows.map((channel) => ({
      id: channel.id,
      displayName: channel.displayName,
      selected: channel.selected,
      requiresToken: channel.requiresToken,
      tokenAvailable: channel.tokenStatus.available,
      tokenSource: channel.tokenStatus.source,
      savedInClaudeState: channel.tokenStatus.savedInClaudeState,
      processEnvAvailable: channel.tokenStatus.processEnvAvailable,
      unavailableReason: channel.unavailableReason,
    })),
  });

  console.log('');
  console.log(header('Official Channels Configuration'));
  console.log('');
  console.log(
    `  Status:       ${
      summary.state === 'ready'
        ? ok(summary.title)
        : summary.state === 'limited'
          ? warn(summary.title)
          : warn(summary.title)
    }`
  );
  console.log(`  ${dim(summary.message)}`);
  console.log(`  ${dim(summary.nextStep)}`);
  console.log('');
  console.log(`  Launch:       ${info(launchPreview.title)}`);
  console.log(`  ${dim(launchPreview.detail)}`);
  if (launchPreview.appendedArgs.length > 0) {
    console.log(`  ${dim(`ccs adds: ${launchPreview.appendedArgs.join(' ')}`)}`);
  }
  if (launchPreview.skippedMessages.length > 0) {
    console.log(`  ${dim(`Skipped: ${launchPreview.skippedMessages.join(' | ')}`)}`);
  }
  console.log('');
  console.log(
    `  Channels:     ${selected.length > 0 ? ok(getChannelConfigSelectionLabel(selected)) : warn('Disabled')}`
  );
  console.log(`  Unattended:   ${config.unattended ? warn('Enabled') : info('Disabled')}`);
  console.log(`  Bun:          ${environment.bunInstalled ? ok('Installed') : warn('Missing')}`);
  console.log(
    `  Claude Code:  ${
      environment.claudeVersion.state === 'supported'
        ? ok(environment.claudeVersion.message)
        : environment.claudeVersion.state === 'unsupported'
          ? warn(environment.claudeVersion.message)
          : info(environment.claudeVersion.message)
    }`
  );
  console.log(
    `  Claude Auth:  ${
      environment.auth.state === 'eligible'
        ? ok(environment.auth.message)
        : environment.auth.state === 'ineligible'
          ? warn(environment.auth.message)
          : info(environment.auth.message)
    }`
  );
  console.log('');
  console.log(subheader('Applies To:'));
  console.log(`  ${dim(getOfficialChannelsSupportMessage())}`);
  console.log(
    `  ${dim(`Supported profiles: ${getOfficialChannelsSupportedProfiles().join(', ')}`)}`
  );
  console.log(`  ${dim(environment.stateScopeMessage)}`);
  console.log(`  ${dim(getOfficialChannelsAccountStatusCaveat())}`);
  if (environment.auth.orgRequirementMessage) {
    console.log(`  ${dim(environment.auth.orgRequirementMessage)}`);
  }
  console.log('');
  console.log(subheader('Channels:'));
  for (const channel of channelRows) {
    const status =
      channel.setup.state === 'ready'
        ? ok(channel.setup.label)
        : channel.setup.state === 'not_selected'
          ? info(channel.setup.label)
          : warn(channel.setup.label);
    console.log(`  ${channel.selected ? '[x]' : '[ ]'} ${channel.displayName}: ${status}`);
    console.log(`      ${dim(getOfficialChannelSummary(channel.id))}`);
    console.log(`      ${dim(channel.setup.detail)}`);
    console.log(`      ${dim(channel.setup.nextStep)}`);
    if (channel.requiresToken) {
      const envKey = getOfficialChannelEnvKey(channel.id) ?? '';
      if (channel.tokenStatus.source === 'saved_env') {
        console.log(`      ${dim(`${envKey}: saved in Claude channel state`)}`);
        if (channel.tokenStatus.processEnvAvailable) {
          console.log(`      ${dim(`${envKey}: also available from current CCS process env`)}`);
        }
        if (channel.tokenStatus.tokenPath) {
          console.log(`      ${dim(channel.tokenStatus.tokenPath)}`);
        }
      } else if (channel.tokenStatus.source === 'process_env') {
        console.log(`      ${dim(`${envKey}: available from current CCS process env`)}`);
      } else {
        console.log(`      ${dim(`${envKey}: missing`)}`);
        if (channel.tokenStatus.tokenPath) {
          console.log(`      ${dim(channel.tokenStatus.tokenPath)}`);
        }
      }
    }
  }
  console.log('');
  console.log(subheader('Notes:'));
  console.log(`  ${dim(getOfficialChannelsLegacyEnableHelp())}`);
  console.log(`  ${dim(environment.stateScopeMessage)}`);
  console.log(`  ${dim(getOfficialChannelMacOSHelp())}`);
  console.log(`  ${dim(getOfficialChannelsRuntimeNote())}`);
  console.log(`  ${dim(getOfficialChannelsCompatibilityMessage())}`);
  console.log(`  ${dim(getOfficialChannelsAccountStatusCaveat())}`);
  console.log('');
  console.log(subheader('Claude-side Setup:'));
  for (const channelId of expandOfficialChannelSelection('all')) {
    console.log(`  ${dim(`${getOfficialChannelDisplayName(channelId)}:`)}`);
    for (const command of getOfficialChannelManualSetupCommands(channelId)) {
      console.log(`    ${color(command, 'command')}`);
    }
  }
  console.log('');
}

function resolveNextSelection(args: ChannelsCommandOptions): OfficialChannelId[] | null {
  if (args.setSelection !== undefined) {
    return expandOfficialChannelSelection(args.setSelection);
  }

  if (args.clear) {
    return [];
  }

  return null;
}

export async function handleConfigChannelsCommand(args: string[]): Promise<void> {
  await initUI();

  const options = parseChannelsCommandArgs(args);
  if (options.help) {
    showHelp();
    return;
  }

  if (options.setSelectionMissing) {
    console.error(fail(`--set requires a value (${getOfficialChannelChoices()} or all)`));
    process.exitCode = 1;
    return;
  }
  if (
    options.setSelection !== undefined &&
    !isOfficialChannelSelectionValid(options.setSelection)
  ) {
    console.error(
      fail(`Invalid --set value: ${options.setSelection} (${getOfficialChannelChoices()} or all)`)
    );
    process.exitCode = 1;
    return;
  }
  if (options.setTokenMissing) {
    console.error(fail('--set-token requires a value'));
    process.exitCode = 1;
    return;
  }
  if (options.setTokenInvalid) {
    console.error(
      fail(
        `Invalid --set-token value: ${options.setTokenInvalid} (use ${getOfficialChannelChoices()})`
      )
    );
    process.exitCode = 1;
    return;
  }
  if (options.clearTokenInvalid) {
    console.error(
      fail(
        `Invalid --clear-token value: ${options.clearTokenInvalid} (use ${getOfficialChannelChoices()})`
      )
    );
    process.exitCode = 1;
    return;
  }

  const config = loadOrCreateUnifiedConfig();
  const nextConfig = {
    ...(config.channels ?? DEFAULT_OFFICIAL_CHANNELS_CONFIG),
    selected: [...(config.channels?.selected ?? DEFAULT_OFFICIAL_CHANNELS_CONFIG.selected)],
  };

  const explicitSelection = resolveNextSelection(options);
  const hasConfigMutation =
    explicitSelection !== null ||
    options.enable ||
    options.disable ||
    options.unattended ||
    options.noUnattended;
  if (explicitSelection) {
    nextConfig.selected = explicitSelection;
  }
  if (options.enable && !nextConfig.selected.includes('discord')) {
    nextConfig.selected.push('discord');
  }
  if (options.disable) {
    nextConfig.selected = nextConfig.selected.filter((channelId) => channelId !== 'discord');
  }
  if (options.unattended) {
    nextConfig.unattended = true;
  }
  if (options.noUnattended) {
    nextConfig.unattended = false;
  }

  try {
    if (hasConfigMutation) {
      updateConfig({ channels: nextConfig });
    }

    if (options.setTokenChannel) {
      if (!getOfficialChannelTokenIds().includes(options.setTokenChannel)) {
        throw new Error(`${options.setTokenChannel} does not use a bot token.`);
      }
      const envKey = getOfficialChannelEnvKey(options.setTokenChannel);
      const token = envKey ? process.env[envKey]?.trim() : '';
      if (!token) {
        throw new Error(
          `${getOfficialChannelDisplayName(options.setTokenChannel)} token missing. Set ${envKey} in your environment and rerun.`
        );
      }
      setConfiguredOfficialChannelToken(options.setTokenChannel, token);
      console.log(ok(`${getOfficialChannelDisplayName(options.setTokenChannel)} token saved`));
      console.log('');
    }

    if (options.clearTokenChannel) {
      if (!getOfficialChannelTokenIds().includes(options.clearTokenChannel)) {
        throw new Error(`${options.clearTokenChannel} does not use a bot token.`);
      }
      clearConfiguredOfficialChannelTokensEverywhere(options.clearTokenChannel);
      console.log(ok(`${getOfficialChannelDisplayName(options.clearTokenChannel)} token cleared`));
      console.log('');
    } else if (options.clearTokenAll) {
      clearConfiguredOfficialChannelTokensEverywhere();
      console.log(ok('All saved channel tokens cleared'));
      console.log('');
    }

    if (hasConfigMutation) {
      console.log(ok('Configuration updated'));
      console.log('');
    }
  } catch (error) {
    console.error(fail((error as Error).message));
    process.exitCode = 1;
    return;
  }

  showStatus();
}
