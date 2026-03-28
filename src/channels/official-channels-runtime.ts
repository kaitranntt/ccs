import { spawnSync } from 'child_process';
import type { TargetType } from '../targets/target-adapter';
import type { ProfileType } from '../types/profile';
import type { OfficialChannelId, OfficialChannelsConfig } from '../config/unified-config-types';
import type { OfficialChannelTokenSource } from './official-channels-store';
import {
  getClaudeAuthStatus,
  getClaudeCliVersion,
  isClaudeCliVersionAtLeast,
  type ClaudeAuthStatus,
} from '../utils/claude-detector';

export interface OfficialChannelDefinition {
  id: OfficialChannelId;
  displayName: string;
  pluginSpec: string;
  envKey?: string;
  envDir: string;
  stateDirEnvKey: string;
  requiresMacOS?: boolean;
  manualSetupCommands: string[];
}

export const OFFICIAL_CHANNELS: Record<OfficialChannelId, OfficialChannelDefinition> = {
  telegram: {
    id: 'telegram',
    displayName: 'Telegram',
    pluginSpec: 'plugin:telegram@claude-plugins-official',
    envKey: 'TELEGRAM_BOT_TOKEN',
    envDir: 'telegram',
    stateDirEnvKey: 'TELEGRAM_STATE_DIR',
    manualSetupCommands: [
      '/plugin install telegram@claude-plugins-official',
      '/telegram:configure <token>',
      '/telegram:access pair <code>',
      '/telegram:access policy allowlist',
    ],
  },
  discord: {
    id: 'discord',
    displayName: 'Discord',
    pluginSpec: 'plugin:discord@claude-plugins-official',
    envKey: 'DISCORD_BOT_TOKEN',
    envDir: 'discord',
    stateDirEnvKey: 'DISCORD_STATE_DIR',
    manualSetupCommands: [
      '/plugin install discord@claude-plugins-official',
      '/discord:configure <token>',
      '/discord:access pair <code>',
      '/discord:access policy allowlist',
    ],
  },
  imessage: {
    id: 'imessage',
    displayName: 'iMessage',
    pluginSpec: 'plugin:imessage@claude-plugins-official',
    envDir: 'imessage',
    stateDirEnvKey: 'IMESSAGE_STATE_DIR',
    requiresMacOS: true,
    manualSetupCommands: [
      '/plugin install imessage@claude-plugins-official',
      '/imessage:access allow +15551234567',
    ],
  },
};

export const OFFICIAL_CHANNEL_IDS = Object.keys(OFFICIAL_CHANNELS) as OfficialChannelId[];
export const MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION = '2.1.80';

export interface OfficialChannelsVersionSummary {
  current: string | null;
  minimum: string;
  state: 'supported' | 'unsupported' | 'unknown';
  message: string;
}

export interface OfficialChannelsAuthSummary {
  checked: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
  state: 'eligible' | 'ineligible' | 'unknown';
  eligible: boolean;
  message: string;
  orgRequirementMessage?: string;
}

export interface OfficialChannelsEnvironmentStatus {
  bunInstalled: boolean;
  supportedProfiles: string[];
  stateScopeMessage: string;
  claudeVersion: OfficialChannelsVersionSummary;
  auth: OfficialChannelsAuthSummary;
}

export interface OfficialChannelSetupSummary {
  state: 'not_selected' | 'ready' | 'needs_token' | 'needs_claude_setup' | 'unavailable';
  label: string;
  detail: string;
  nextStep: string;
}

export interface OfficialChannelsReadinessSummary {
  state: 'ready' | 'needs_setup' | 'limited';
  title: string;
  message: string;
  nextStep: string;
  blockers: string[];
}

export interface OfficialChannelsLaunchPreview {
  state: 'disabled' | 'blocked' | 'partial' | 'ready';
  title: string;
  detail: string;
  command: string;
  appendedArgs: string[];
  appliedChannels: OfficialChannelId[];
  permissionBypassIncluded: boolean;
  skippedMessages: string[];
}

export interface OfficialChannelsStatusChannelInput {
  id: OfficialChannelId;
  displayName: string;
  selected: boolean;
  requiresToken: boolean;
  tokenAvailable: boolean;
  tokenSource?: OfficialChannelTokenSource;
  savedInClaudeState?: boolean;
  processEnvAvailable?: boolean;
  unavailableReason?: string;
}

export interface DiscordChannelsLaunchPlan {
  applied: boolean;
  wantsPermissionBypass: boolean;
  appliedChannels: OfficialChannelId[];
  skippedMessages: string[];
}

interface DiscordChannelsLaunchInput {
  args: string[];
  config: OfficialChannelsConfig;
  target: TargetType;
  profileType: ProfileType;
  environment: OfficialChannelsEnvironmentStatus;
  channelReadiness: Record<OfficialChannelId, boolean>;
}

export function isBunAvailable(): boolean {
  const result = spawnSync('bun', ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function isDiscordChannelsSessionSupported(
  target: TargetType,
  profileType: ProfileType
): boolean {
  return target === 'claude' && (profileType === 'default' || profileType === 'account');
}

export function isOfficialChannelId(value: string): value is OfficialChannelId {
  return value in OFFICIAL_CHANNELS;
}

export function normalizeOfficialChannelIds(values: readonly string[]): OfficialChannelId[] {
  const seen = new Set<OfficialChannelId>();
  const normalized: OfficialChannelId[] = [];

  for (const channelId of OFFICIAL_CHANNEL_IDS) {
    if (!values.includes(channelId) || seen.has(channelId)) {
      continue;
    }

    seen.add(channelId);
    normalized.push(channelId);
  }

  return normalized;
}

export function hasExplicitChannelsFlag(args: string[]): boolean {
  return args.some((arg) => arg === '--channels' || arg.startsWith('--channels='));
}

export function hasExplicitPermissionOverride(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === '--allow-dangerously-skip-permissions' ||
      arg === '--dangerously-skip-permissions' ||
      arg === '--permission-mode' ||
      arg.startsWith('--permission-mode=')
  );
}

function isTeamOrEnterpriseSubscription(subscriptionType: string | null): boolean {
  const normalized = subscriptionType?.trim().toLowerCase() ?? '';
  return normalized.includes('team') || normalized.includes('enterprise');
}

export function resolveOfficialChannelsVersionSummary(
  version: string | null
): OfficialChannelsVersionSummary {
  if (!version) {
    return {
      current: null,
      minimum: MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION,
      state: 'unknown',
      message: `Unable to detect Claude Code version. Official Channels require v${MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION}+.`,
    };
  }

  if (isClaudeCliVersionAtLeast(version, MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION)) {
    return {
      current: version,
      minimum: MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION,
      state: 'supported',
      message: `Claude Code v${version}`,
    };
  }

  return {
    current: version,
    minimum: MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION,
    state: 'unsupported',
    message: `Official Channels require Claude Code v${MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION}+ (found v${version}).`,
  };
}

export function resolveOfficialChannelsAuthSummary(
  authStatus: ClaudeAuthStatus | null
): OfficialChannelsAuthSummary {
  if (!authStatus) {
    return {
      checked: false,
      loggedIn: false,
      authMethod: null,
      subscriptionType: null,
      state: 'unknown',
      eligible: false,
      message: 'Unable to verify Claude auth status. Official Channels require claude.ai login.',
    };
  }

  if (!authStatus.loggedIn) {
    return {
      checked: true,
      loggedIn: false,
      authMethod: authStatus.authMethod ?? null,
      subscriptionType: authStatus.subscriptionType ?? null,
      state: 'ineligible',
      eligible: false,
      message: 'Official Channels require claude.ai login. Run `claude auth login` first.',
    };
  }

  if (authStatus.authMethod !== 'claude.ai') {
    return {
      checked: true,
      loggedIn: true,
      authMethod: authStatus.authMethod ?? null,
      subscriptionType: authStatus.subscriptionType ?? null,
      state: 'ineligible',
      eligible: false,
      message: `Official Channels require claude.ai login. Current auth method: ${authStatus.authMethod ?? 'unknown'}.`,
    };
  }

  return {
    checked: true,
    loggedIn: true,
    authMethod: authStatus.authMethod,
    subscriptionType: authStatus.subscriptionType ?? null,
    state: 'eligible',
    eligible: true,
    message: 'Authenticated with claude.ai.',
    ...(isTeamOrEnterpriseSubscription(authStatus.subscriptionType ?? null)
      ? {
          orgRequirementMessage:
            'Team and Enterprise orgs also need channels enabled by an admin before messages will arrive.',
        }
      : {}),
  };
}

export function getOfficialChannelsStateScopeMessage(): string {
  return "Telegram and Discord tokens live in Claude's machine-level channel state under ~/.claude/channels/. Native Claude sessions share that state unless you manually override the official *_STATE_DIR variables.";
}

export function getOfficialChannelsSupportMessage(): string {
  return 'Works only for native Claude default/account sessions. It does not apply to API, OAuth, or non-Claude targets such as `ccs glm`, `ccs gemini`, `ccs codex`, `ccs --target droid`, or `ccs --target codex`.';
}

export function getOfficialChannelsAccountStatusCaveat(): string {
  return 'Dashboard status reflects the base Claude install visible to the current CCS process. Isolated native account sessions can still differ until that account signs in with claude.ai.';
}

export function getOfficialChannelsEnvironmentStatus(
  authEnvOverrides?: NodeJS.ProcessEnv
): OfficialChannelsEnvironmentStatus {
  return {
    bunInstalled: isBunAvailable(),
    supportedProfiles: getOfficialChannelsSupportedProfiles(),
    stateScopeMessage: getOfficialChannelsStateScopeMessage(),
    claudeVersion: resolveOfficialChannelsVersionSummary(getClaudeCliVersion()),
    auth: resolveOfficialChannelsAuthSummary(getClaudeAuthStatus(authEnvOverrides)),
  };
}

export function buildOfficialChannelsArgs(
  args: string[],
  channels: OfficialChannelId[],
  includePermissionBypass: boolean
): string[] {
  const nextArgs = [
    ...args,
    '--channels',
    ...channels.map((channel) => OFFICIAL_CHANNELS[channel].pluginSpec),
  ];

  if (includePermissionBypass) {
    nextArgs.push('--dangerously-skip-permissions');
  }

  return nextArgs;
}

export function resolveOfficialChannelsLaunchPlan(
  input: DiscordChannelsLaunchInput
): DiscordChannelsLaunchPlan {
  const { args, config, target, profileType, environment, channelReadiness } = input;
  const skippedMessages: string[] = [];

  if (config.selected.length === 0) {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages,
    };
  }

  if (!isDiscordChannelsSessionSupported(target, profileType)) {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages: [getOfficialChannelsCompatibilityMessage()],
    };
  }

  if (hasExplicitChannelsFlag(args)) {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages,
    };
  }

  if (!environment.bunInstalled) {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages: ['Official Channels auto-enable skipped because Bun is not installed.'],
    };
  }

  if (environment.claudeVersion.state !== 'supported') {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages: [environment.claudeVersion.message],
    };
  }

  if (environment.auth.state !== 'eligible') {
    return {
      applied: false,
      wantsPermissionBypass: false,
      appliedChannels: [],
      skippedMessages: [environment.auth.message],
    };
  }

  const appliedChannels: OfficialChannelId[] = [];

  for (const channelId of normalizeOfficialChannelIds(config.selected)) {
    const channel = OFFICIAL_CHANNELS[channelId];

    if (channel.requiresMacOS && !isMacOS()) {
      skippedMessages.push(`${channel.displayName} auto-enable skipped because it requires macOS.`);
      continue;
    }

    if (!channelReadiness[channelId]) {
      skippedMessages.push(
        channel.envKey
          ? `${channel.displayName} auto-enable skipped because ${channel.envKey} is not configured.`
          : `${channel.displayName} auto-enable skipped because it is not ready on this machine.`
      );
      continue;
    }

    appliedChannels.push(channelId);
  }

  return {
    applied: appliedChannels.length > 0,
    wantsPermissionBypass: config.unattended && !hasExplicitPermissionOverride(args),
    appliedChannels,
    skippedMessages,
  };
}

export function getOfficialChannelTokenIds(): OfficialChannelId[] {
  return OFFICIAL_CHANNEL_IDS.filter((channelId) => Boolean(OFFICIAL_CHANNELS[channelId].envKey));
}

export function getOfficialChannelManualSetupCommands(channelId: OfficialChannelId): string[] {
  return OFFICIAL_CHANNELS[channelId].manualSetupCommands;
}

export function getOfficialChannelDisplayName(channelId: OfficialChannelId): string {
  return OFFICIAL_CHANNELS[channelId].displayName;
}

export function getOfficialChannelPluginSpec(channelId: OfficialChannelId): string {
  return OFFICIAL_CHANNELS[channelId].pluginSpec;
}

export function getOfficialChannelEnvKey(channelId: OfficialChannelId): string | undefined {
  return OFFICIAL_CHANNELS[channelId].envKey;
}

export function officialChannelRequiresMacOS(channelId: OfficialChannelId): boolean {
  return Boolean(OFFICIAL_CHANNELS[channelId].requiresMacOS);
}

export function getOfficialChannelEnvDir(channelId: OfficialChannelId): string {
  return OFFICIAL_CHANNELS[channelId].envDir;
}

export function getOfficialChannelStateDirEnvKey(channelId: OfficialChannelId): string {
  return OFFICIAL_CHANNELS[channelId].stateDirEnvKey;
}

export function getOfficialChannelSummary(channelId: OfficialChannelId): string {
  if (channelId === 'telegram') {
    return 'Bot token required. Runtime-only while Claude is running; Telegram pairing and access policy still happen in Claude.';
  }
  if (channelId === 'discord') {
    return 'Bot token required. Runtime-only while Claude is running; Discord pairing and access policy still happen in Claude.';
  }

  return 'macOS-only. Runtime-only while Claude is running; plugin install, Full Disk Access, and the first-reply Automation approval are still required.';
}

export function getOfficialChannelUnavailableReason(
  channelId: OfficialChannelId
): string | undefined {
  if (channelId === 'imessage' && !isMacOS()) {
    return 'Requires macOS.';
  }

  return undefined;
}

export function getOfficialChannelReadyMessage(channelId: OfficialChannelId): string {
  if (channelId === 'imessage') {
    return isMacOS()
      ? 'Needs Claude-side install plus Full Disk Access and the first-reply Automation prompt.'
      : 'Unavailable on this platform.';
  }

  const envKey = getOfficialChannelEnvKey(channelId);
  return envKey
    ? `${envKey} must be configured before CCS can auto-enable this channel. Claude-side pairing and access policy are still required.`
    : 'Claude-side setup required.';
}

export function buildOfficialChannelSetupSummary(
  channel: OfficialChannelsStatusChannelInput
): OfficialChannelSetupSummary {
  if (!channel.selected) {
    return {
      state: 'not_selected',
      label: 'Not selected',
      detail: 'CCS will not auto-add this channel until you turn it on here.',
      nextStep: 'Turn this channel on if you want CCS to add it on supported native Claude runs.',
    };
  }

  if (channel.unavailableReason) {
    return {
      state: 'unavailable',
      label: channel.unavailableReason,
      detail: `${channel.displayName} is selected, but this machine cannot use it right now.`,
      nextStep: 'Turn it off here, or switch to a supported machine before relying on it.',
    };
  }

  if (channel.id === 'imessage') {
    return {
      state: 'needs_claude_setup',
      label: 'Claude-side setup remaining',
      detail:
        'CCS can add iMessage on the next native Claude run, but plugin install, sender allowlist, Full Disk Access, and the first-reply Automation prompt are still local steps.',
      nextStep: 'Complete the one-time Claude and macOS setup below before relying on iMessage.',
    };
  }

  const envKey = getOfficialChannelEnvKey(channel.id);
  if (channel.requiresToken && !channel.tokenAvailable) {
    return {
      state: 'needs_token',
      label: 'Needs token',
      detail: `${envKey} is missing. CCS cannot auto-add ${channel.displayName} until you save it here or provide it in the current CCS process env.`,
      nextStep: `Save ${envKey} below, or export it before launching CCS.`,
    };
  }

  const sourceDetail = channel.savedInClaudeState
    ? `${envKey} is saved in Claude channel state.`
    : `${envKey} is available from the current CCS process env.`;

  return {
    state: 'ready',
    label: channel.savedInClaudeState
      ? 'Ready for next native run'
      : 'Ready from current CCS process env',
    detail: channel.savedInClaudeState
      ? `${sourceDetail}${channel.processEnvAvailable ? ` The current CCS process env also provides ${envKey}.` : ''} CCS can auto-add ${channel.displayName} on the next supported native Claude run. Claude-side pairing and access policy still happen in Claude.`
      : `${sourceDetail} CCS can auto-add ${channel.displayName} on the next supported native Claude run. Claude-side pairing and access policy still happen in Claude.`,
    nextStep: channel.savedInClaudeState
      ? 'Run `ccs` or a native Claude account profile. Claude-side pairing and access policy may still be required.'
      : 'Run CCS from this same env, or save the token here if you want persistent Claude state.',
  };
}

export function buildOfficialChannelsReadinessSummary(input: {
  config: OfficialChannelsConfig;
  environment: OfficialChannelsEnvironmentStatus;
  channels: OfficialChannelsStatusChannelInput[];
}): OfficialChannelsReadinessSummary {
  const { config, environment, channels } = input;

  if (config.selected.length === 0) {
    return {
      state: 'needs_setup',
      title: 'No channels selected yet',
      message:
        'Choose at least one official channel before CCS can auto-add it on supported native Claude runs.',
      nextStep: 'Turn on Telegram, Discord, and/or iMessage below.',
      blockers: ['Select at least one channel for auto-enable.'],
    };
  }

  const blockers: string[] = [];
  if (!environment.bunInstalled) {
    blockers.push('Install Bun to use Anthropic official channel plugins.');
  }
  if (environment.claudeVersion.state !== 'supported') {
    blockers.push(environment.claudeVersion.message);
  }
  if (environment.auth.state !== 'eligible') {
    blockers.push(environment.auth.message);
  }

  const selectedChannels = channels.filter((channel) => channel.selected);
  const missingTokenChannels = selectedChannels.filter(
    (channel) => channel.requiresToken && !channel.tokenAvailable
  );
  if (missingTokenChannels.length > 0) {
    blockers.push(
      `Missing bot token for ${missingTokenChannels.map((channel) => channel.displayName).join(', ')}.`
    );
  }

  if (blockers.length > 0) {
    return {
      state: 'needs_setup',
      title: 'Needs setup before CCS can auto-add these channels',
      message: blockers[0] ?? 'Official Channels still need setup.',
      nextStep: 'Resolve the blockers below, then launch a supported native Claude session again.',
      blockers,
    };
  }

  const limitedNotes: string[] = [];
  const unavailableSelectedChannels = selectedChannels.filter((channel) =>
    Boolean(channel.unavailableReason)
  );
  if (unavailableSelectedChannels.length > 0) {
    limitedNotes.push(
      `${unavailableSelectedChannels.map((channel) => channel.displayName).join(', ')} cannot run on this machine.`
    );
  }
  if (selectedChannels.some((channel) => channel.id === 'imessage')) {
    limitedNotes.push(
      'iMessage still needs Claude-side install plus local macOS permissions before it is dependable.'
    );
  }

  if (limitedNotes.length > 0) {
    return {
      state: 'limited',
      title: 'Selected, but some channels still need manual setup',
      message: limitedNotes[0] ?? 'Some selected channels still need additional setup.',
      nextStep: 'Review the channel cards below before relying on this from a native Claude run.',
      blockers: limitedNotes,
    };
  }

  const selectedLabels = selectedChannels.map((channel) => channel.displayName).join(', ');
  const envOnlyChannels = selectedChannels.filter(
    (channel) => channel.processEnvAvailable && !channel.savedInClaudeState
  );
  return {
    state: 'ready',
    title: 'Ready for the next native Claude run',
    message:
      envOnlyChannels.length === 0
        ? `CCS can auto-add ${selectedLabels} the next time you run \`ccs\` or a native Claude account profile.`
        : envOnlyChannels.length === selectedChannels.length
          ? `CCS can auto-add ${selectedLabels} on the next supported native Claude run from this same CCS process env.`
          : `CCS can auto-add ${selectedLabels} on the next supported native Claude run. ${envOnlyChannels.map((channel) => channel.displayName).join(', ')} currently depends on this same CCS process env.`,
    nextStep:
      envOnlyChannels.length === 0
        ? 'Claude-side pairing and access policy may still be required inside Claude, but CCS-side prerequisites are ready.'
        : envOnlyChannels.length === selectedChannels.length
          ? 'Run CCS from this same env, or save the token here first if you want persistent Claude channel state.'
          : 'Save env-only tokens here if you want persistent Claude channel state across shells.',
    blockers: [],
  };
}

export function buildOfficialChannelsLaunchPreview(input: {
  config: OfficialChannelsConfig;
  environment: OfficialChannelsEnvironmentStatus;
  channels: OfficialChannelsStatusChannelInput[];
}): OfficialChannelsLaunchPreview {
  const { config, environment, channels } = input;

  if (config.selected.length === 0) {
    return {
      state: 'disabled',
      title: 'Nothing will be auto-added yet',
      detail: 'Turn on at least one channel below before `ccs` can add official channel flags.',
      command: 'ccs',
      appendedArgs: [],
      appliedChannels: [],
      permissionBypassIncluded: false,
      skippedMessages: [],
    };
  }

  const channelReadiness = Object.fromEntries(
    channels.map((channel) => [
      channel.id,
      !channel.unavailableReason &&
        (channel.id === 'imessage' || !channel.requiresToken || channel.tokenAvailable),
    ])
  ) as Record<OfficialChannelId, boolean>;

  const plan = resolveOfficialChannelsLaunchPlan({
    args: [],
    config,
    target: 'claude',
    profileType: 'default',
    environment,
    channelReadiness,
  });

  const appendedArgs = plan.applied
    ? buildOfficialChannelsArgs([], plan.appliedChannels, plan.wantsPermissionBypass)
    : [];

  if (!plan.applied) {
    return {
      state: 'blocked',
      title: 'Running `ccs` now will not auto-add channels',
      detail:
        plan.skippedMessages[0] ??
        'Official Channels are selected, but this machine is not ready to auto-add them yet.',
      command: 'ccs',
      appendedArgs: [],
      appliedChannels: [],
      permissionBypassIncluded: false,
      skippedMessages: plan.skippedMessages,
    };
  }

  const appliedLabels = plan.appliedChannels.map((channelId) =>
    getOfficialChannelDisplayName(channelId)
  );

  if (plan.skippedMessages.length > 0) {
    return {
      state: 'partial',
      title: `CCS will auto-add ${appliedLabels.join(', ')}`,
      detail:
        'Some selected channels are still skipped. Review the notes below before relying on the rest.',
      command: 'ccs',
      appendedArgs,
      appliedChannels: plan.appliedChannels,
      permissionBypassIncluded: plan.wantsPermissionBypass,
      skippedMessages: plan.skippedMessages,
    };
  }

  return {
    state: 'ready',
    title: `CCS will auto-add ${appliedLabels.join(', ')}`,
    detail: plan.wantsPermissionBypass
      ? 'Running `ccs` will add the selected official channels and skip permission prompts for that launch.'
      : 'Running `ccs` will add the selected official channels automatically on this machine.',
    command: 'ccs',
    appendedArgs,
    appliedChannels: plan.appliedChannels,
    permissionBypassIncluded: plan.wantsPermissionBypass,
    skippedMessages: [],
  };
}

export function expandOfficialChannelSelection(selection: string): OfficialChannelId[] {
  if (selection.trim().toLowerCase() === 'all') {
    return [...OFFICIAL_CHANNEL_IDS];
  }

  return normalizeOfficialChannelIds(
    selection
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getOfficialChannelChoices(): string {
  return OFFICIAL_CHANNEL_IDS.join(', ');
}

export function isOfficialChannelSelectionValid(selection: string): boolean {
  const parsed = selection
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return (
    parsed.length > 0 && parsed.every((value) => value === 'all' || isOfficialChannelId(value))
  );
}

export function resolveLegacyDiscordSelection(enabled: boolean | undefined): OfficialChannelId[] {
  return enabled ? ['discord'] : [];
}

export function getOfficialChannelsSupportedProfiles(): string[] {
  return ['default', 'account'];
}

export function getChannelConfigSelectionLabel(selected: OfficialChannelId[]): string {
  if (selected.length === 0) {
    return 'None';
  }

  return selected.map((channelId) => getOfficialChannelDisplayName(channelId)).join(', ');
}

export function getTokenValueLabel(channelId: OfficialChannelId): string {
  return getOfficialChannelEnvKey(channelId) ?? '';
}

export function isOfficialChannelTokenRequired(channelId: OfficialChannelId): boolean {
  return Boolean(getOfficialChannelEnvKey(channelId));
}

export function getOfficialChannelDefaultTokenPlaceholder(channelId: OfficialChannelId): string {
  const envKey = getOfficialChannelEnvKey(channelId);
  return envKey ? `Paste ${envKey}` : '';
}

export function getOfficialChannelConfiguredPlaceholder(channelId: OfficialChannelId): string {
  const envKey = getOfficialChannelEnvKey(channelId);
  return envKey ? `Configured. Enter a new ${envKey} to replace it.` : '';
}

export function getOfficialChannelsSectionDescription(): string {
  return 'Auto-enable Anthropic official channels for compatible Claude sessions. CCS only stores selection in config.yaml; Claude keeps machine-level channel state under ~/.claude/channels/.';
}

export function getOfficialChannelsRuntimeNote(): string {
  return 'CCS does not persist a global Claude channels default. It only injects runtime flags for the current Claude session when prerequisites are met.';
}

export function getOfficialChannelsSetHelp(): string {
  return `Set selected channels with --set <csv>. Supported values: ${getOfficialChannelChoices()}, or all.`;
}

export function getOfficialChannelsLegacyEnableHelp(): string {
  return 'Legacy aliases: --enable adds Discord, --disable removes Discord.';
}

export function getOfficialChannelTokenHelp(): string {
  return 'Use --set-token <channel>=<token>. If no channel is provided, Discord is assumed for backward compatibility.';
}

export function getOfficialChannelClearTokenHelp(): string {
  return 'Use --clear-token to clear all saved bot tokens, or --clear-token <channel> to clear one token.';
}

export function getOfficialChannelMacOSHelp(): string {
  return 'iMessage needs macOS Full Disk Access plus the Messages automation prompt on first reply.';
}

export function getOfficialChannelsDocsSummary(): string {
  return 'Supported official channels are Telegram, Discord, and iMessage.';
}

export function getOfficialChannelSyncFailureMessage(
  channelId: OfficialChannelId,
  targetPath: string
): string {
  return `${getOfficialChannelDisplayName(channelId)} auto-enable skipped: failed to sync channel env to ${targetPath}`;
}

export function getOfficialChannelSyncSkipReason(channelId: OfficialChannelId): string {
  return `${getOfficialChannelDisplayName(channelId)} auto-enable skipped.`;
}

export function getOfficialChannelsExplicitOverrideMessage(): string | undefined {
  return undefined;
}

export function getOfficialChannelTokenMissingMessage(channelId: OfficialChannelId): string {
  const envKey = getOfficialChannelEnvKey(channelId);
  return envKey
    ? `${getOfficialChannelDisplayName(channelId)} auto-enable skipped because ${envKey} is not configured.`
    : `${getOfficialChannelDisplayName(channelId)} auto-enable skipped because it is not ready.`;
}

export function getOfficialChannelsBunMissingMessage(): string {
  return 'Official Channels auto-enable skipped because Bun is not installed.';
}

export function getOfficialChannelsCompatibilityMessage(): string {
  return 'Official Channels auto-enable only works for native Claude default/account sessions. It does not apply to `ccs glm`, other API/OAuth profiles, or Droid targets.';
}

export function getOfficialChannelsNoSelectionMessage(): string {
  return 'No official channels selected.';
}

export function getOfficialChannelsPermissionBypassMessage(): string {
  return '--dangerously-skip-permissions';
}

export function getOfficialChannelsSelectionSummary(selected: OfficialChannelId[]): string[] {
  return selected.map((channelId) => getOfficialChannelDisplayName(channelId));
}
