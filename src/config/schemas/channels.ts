/**
 * Official Channels configuration types and defaults.
 *
 * Controls runtime-only injection of Anthropic's official channel plugins
 * (Telegram, Discord, iMessage).
 * Version 12+ feature.
 */

/**
 * Supported Anthropic official channel IDs.
 */
export type OfficialChannelId = 'telegram' | 'discord' | 'imessage';

/**
 * Official Channels configuration.
 * Controls runtime-only injection of Anthropic's official channel plugins.
 */
export interface OfficialChannelsConfig {
  /** Selected official channels to auto-enable for compatible sessions */
  selected: OfficialChannelId[];
  /** Also add --dangerously-skip-permissions when auto-enable is active */
  unattended: boolean;
}

/**
 * Default Official Channels configuration.
 * Disabled by default because the feature requires explicit user setup.
 */
export const DEFAULT_OFFICIAL_CHANNELS_CONFIG: OfficialChannelsConfig = {
  selected: [],
  unattended: false,
};
