/**
 * Unified config version constant.
 *
 * Central source of truth for the current config schema version.
 * Incremented whenever new sections are added to config.yaml.
 */

/**
 * Unified config version.
 * Version 2 = YAML unified format
 * Version 3 = WebSearch config with model configuration for Gemini/OpenCode
 * Version 4 = Copilot API integration (GitHub Copilot proxy)
 * Version 5 = Remote proxy configuration (connect to remote CLIProxyAPI)
 * Version 6 = Customizable auth tokens (API key and management secret)
 * Version 7 = Quota management for hybrid auto+manual account control
 * Version 8 = Thinking/reasoning budget configuration
 * Version 9 = Real WebSearch backends (DuckDuckGo/Brave) with legacy CLI fallback
 * Version 10 = Exa + Tavily WebSearch backends
 * Version 11 = Discord Channels runtime auto-enable preferences
 * Version 12 = Official Channels multi-provider support (Telegram, Discord, iMessage)
 * Version 13 = Browser automation defaults to safe manual/off exposure
 */
export const UNIFIED_CONFIG_VERSION = 13;
