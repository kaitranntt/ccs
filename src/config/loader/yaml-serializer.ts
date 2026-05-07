/**
 * yaml-serializer.ts
 *
 * YAML generation helpers extracted from unified-config-loader.ts
 * (Phase 3 split — issue #1164).
 *
 * Contains: generateYamlHeader, generateYamlWithComments.
 * These produce the commented YAML written to config.yaml on every save.
 */

import * as yaml from 'js-yaml';
import type { UnifiedConfig } from '../unified-config-types';

/**
 * Generate YAML header with helpful comments.
 */
export function generateYamlHeader(): string {
  return `# CCS Unified Configuration
# Docs: https://github.com/kaitranntt/ccs
`;
}

/**
 * Generate YAML content with section comments for better readability.
 */
export function generateYamlWithComments(config: UnifiedConfig): string {
  const lines: string[] = [];

  // Version
  lines.push(`version: ${config.version}`);
  if (config.setup_completed !== undefined) {
    lines.push(`setup_completed: ${config.setup_completed}`);
  }
  lines.push('');

  // Default
  if (config.default) {
    lines.push(`# Default profile used when running 'ccs' without arguments`);
    lines.push(`default: "${config.default}"`);
    lines.push('');
  }

  // Accounts section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Accounts: Isolated Claude instances (each with separate auth/sessions)');
  lines.push('# Manage with: ccs auth add <name>, ccs auth list, ccs auth remove <name>');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ accounts: config.accounts }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  // Profiles section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Profiles: API-based providers (GLM, Kimi, custom endpoints)');
  lines.push('# Each profile points to a *.settings.json file containing env vars.');
  lines.push('# Edit the settings file directly to customize (ANTHROPIC_MAX_TOKENS, etc.)');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ profiles: config.profiles }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  // CLIProxy section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# CLIProxy: OAuth-based providers (gemini, codex, agy, qwen, iflow)');
  lines.push('# Each variant can reference a *.settings.json file for custom env vars.');
  lines.push('# Edit the settings file directly to customize model or other settings.');
  lines.push(
    '# Optional: cliproxy.management_panel_repository overrides the generated CPAMC repo.'
  );
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ cliproxy: config.cliproxy }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  if (config.proxy?.routing) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Proxy Routing: OpenAI-compatible local proxy model selection rules');
    lines.push('# Use profile:model selectors to force a target profile and upstream model.');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ proxy: config.proxy }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  if (config.logging) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Logging: CCS-owned structured runtime logs');
    lines.push('# Current file: ~/.ccs/logs/current.jsonl');
    lines.push('# Archives rotate automatically and are pruned by retain_days.');
    lines.push('# This is separate from cliproxy.logging, which controls CLIProxy runtime files.');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ logging: config.logging }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  // CLIProxy Server section (remote proxy configuration) - placed right after cliproxy
  if (config.cliproxy_server) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# CLIProxy Server: Remote proxy connection settings');
    lines.push('# Configure via Dashboard (`ccs config`) > Proxy tab.');
    lines.push('#');
    lines.push('# remote: Connect to a remote CLIProxyAPI instance');
    lines.push('# fallback: Use local proxy if remote is unreachable');
    lines.push('# local: Local proxy settings (port, auto-start)');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { cliproxy_server: config.cliproxy_server },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  // Preferences section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Preferences: User settings');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml
      .dump({ preferences: config.preferences }, { indent: 2, lineWidth: -1, quotingType: '"' })
      .trim()
  );
  lines.push('');

  // WebSearch section
  if (config.websearch) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# WebSearch: real search backends for third-party profiles');
    lines.push('# Dashboard (`ccs config`) is the source of truth for provider selection.');
    lines.push('#');
    lines.push('# Third-party providers (gemini, codex, agy, etc.) do not have access to');
    lines.push("# Anthropic's WebSearch tool. CCS intercepts that tool and runs local search.");
    lines.push('#');
    lines.push(
      '# Priority: Exa -> Tavily -> Brave -> DuckDuckGo -> optional legacy AI CLI fallbacks'
    );
    lines.push('#');
    lines.push('# Exa requires EXA_API_KEY in your environment.');
    lines.push('# Tavily requires TAVILY_API_KEY in your environment.');
    lines.push('# Brave requires BRAVE_API_KEY in your environment.');
    lines.push('# DuckDuckGo works with zero extra setup and is enabled by default.');
    lines.push('#');
    lines.push('# Legacy LLM fallbacks remain optional if you still want them:');
    lines.push('#   gemini: npm i -g @google/gemini-cli');
    lines.push('#   opencode: curl -fsSL https://opencode.ai/install | bash');
    lines.push('#   grok: npm i -g @vibe-kit/grok-cli');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ websearch: config.websearch }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Copilot section (deprecated GitHub Copilot compatibility bridge)
  if (config.copilot) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Copilot: Deprecated GitHub Copilot compatibility bridge (via copilot-api)');
    lines.push(
      '# Existing local setups remain available, but prefer Codex or another active provider.'
    );
    lines.push('# GitHub usage-based Copilot billing begins June 1, 2026.');
    lines.push('#');
    lines.push('# !! DISCLAIMER - USE AT YOUR OWN RISK !!');
    lines.push('# This uses an UNOFFICIAL reverse-engineered API.');
    lines.push('# Excessive usage may trigger GitHub account restrictions.');
    lines.push('# CCS provides NO WARRANTY and accepts NO RESPONSIBILITY for consequences.');
    lines.push('#');
    lines.push('# Setup: npx copilot-api auth (authenticate with GitHub)');
    lines.push('# Usage: ccs copilot (switch to copilot profile)');
    lines.push('#');
    lines.push('# Models: claude-sonnet-4.5, claude-opus-4.5, gpt-5.1, gemini-2.5-pro');
    lines.push('# Account types: individual, business, enterprise');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ copilot: config.copilot }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  // Cursor section (Cursor IDE proxy daemon)
  if (config.cursor) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Cursor: Cursor IDE proxy daemon');
    lines.push('# Enables Cursor IDE integration via local proxy daemon.');
    lines.push('#');
    lines.push('# enabled: Enable/disable Cursor integration (default: false)');
    lines.push('# port: Port for cursor proxy daemon (default: 20129)');
    lines.push('# auto_start: Auto-start daemon when CCS starts (default: false)');
    lines.push('# ghost_mode: Disable telemetry for privacy (default: true)');
    lines.push('# model: Default model ID (used for ANTHROPIC_MODEL)');
    lines.push('# opus_model/sonnet_model/haiku_model: Optional tier model mapping');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ cursor: config.cursor }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  // Global env section
  if (config.global_env) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      '# Global Environment Variables: Injected into all non-Claude subscription profiles'
    );
    lines.push('# These env vars disable telemetry/reporting for third-party providers.');
    lines.push('# Configure via Dashboard (`ccs config`) > Global Env tab.');
    lines.push('#');
    lines.push('# Default variables:');
    lines.push('#   DISABLE_BUG_COMMAND: Disables /bug command (not supported by proxy)');
    lines.push('#   DISABLE_ERROR_REPORTING: Disables error reporting to Anthropic');
    lines.push('#   DISABLE_TELEMETRY: Disables usage telemetry');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ global_env: config.global_env }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Continuity inheritance section
  if (config.continuity?.inherit_from_account) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Continuity Inheritance: Reuse account continuity artifacts across profiles');
    lines.push('# Map execution profile names to source account profiles (CLAUDE_CONFIG_DIR).');
    lines.push('# Applies to Claude target only; credentials remain profile-specific.');
    lines.push('# Example: continuity.inherit_from_account.glm: pro');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ continuity: config.continuity }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Thinking section (extended thinking/reasoning configuration)
  if (config.thinking) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Thinking: Extended thinking/reasoning budget configuration');
    lines.push('# Controls reasoning depth for supported providers (agy, gemini, codex).');
    lines.push('#');
    lines.push(
      '# Modes: auto (use tier_defaults), off (disable), manual (--thinking/--effort flags)'
    );
    lines.push(
      '# Levels: minimal (512), low (1K), medium (8K), high (24K), xhigh (32K), max (adaptive ceiling), auto'
    );
    lines.push('# Override: Set global override value (number or level name)');
    lines.push('# Provider overrides: Per-provider tier defaults');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ thinking: config.thinking }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Official Channels section
  if (config.channels) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Official Channels: Runtime auto-enable for Anthropic official channel plugins');
    lines.push('# Supported channels: telegram, discord, imessage');
    lines.push('# Runtime-only: CCS injects --channels at launch for compatible Claude sessions.');
    lines.push('# Bot tokens live in Claude channel env files, not in config.yaml.');
    lines.push('# Use selected: [telegram, discord, imessage] to choose channels.');
    lines.push(
      '# unattended adds --dangerously-skip-permissions only when channel auto-enable is active.'
    );
    lines.push('# Compatible sessions: native Claude default/account profiles only.');
    lines.push('# Configure via: ccs config channels or the Settings > Channels dashboard tab.');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ channels: config.channels }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Dashboard auth section (only if configured)
  if (config.dashboard_auth?.enabled) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Dashboard Auth: Optional login protection for CCS dashboard');
    lines.push('# Generate password hash: npx bcrypt-cli hash "your-password"');
    lines.push(
      '# ENV override: CCS_DASHBOARD_AUTH_ENABLED, CCS_DASHBOARD_USERNAME, CCS_DASHBOARD_PASSWORD_HASH'
    );
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { dashboard_auth: config.dashboard_auth },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  // Browser automation section
  if (config.browser) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Browser Automation: Claude browser attach and Codex browser tooling');
    lines.push('# Claude attach reuses a running Chrome/Chromium session with remote debugging.');
    lines.push('# Codex tooling controls whether CCS injects Playwright MCP overrides.');
    lines.push('#');
    lines.push('# claude.user_data_dir should point at the Chrome user-data directory for the');
    lines.push('# dedicated attach session. claude.devtools_port is the expected debugging port.');
    lines.push('# Configure via: Settings > Browser or `ccs browser ...`.');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ browser: config.browser }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  // Image analysis section
  if (config.image_analysis) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Image Analysis: Vision-based analysis for images and PDFs');
    lines.push('# Routes Read tool requests for images/PDFs through CLIProxy vision API.');
    lines.push('#');
    lines.push('# When enabled: Image files trigger vision analysis instead of raw file read');
    lines.push('# Provider models: Vision model used for each CLIProxy provider');
    lines.push('# Timeout: Maximum seconds to wait for analysis (10-600)');
    lines.push('#');
    lines.push('# Supported formats: .jpg, .jpeg, .png, .gif, .webp, .heic, .bmp, .tiff, .pdf');
    lines.push('# Configure via: ccs config image-analysis');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { image_analysis: config.image_analysis },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  return lines.join('\n');
}
