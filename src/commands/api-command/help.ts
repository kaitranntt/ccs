import {
  PROVIDER_PRESETS,
  listCliproxyBridgeProviders,
  getPresetAliases,
  getPresetIds,
  type ProviderPreset,
} from '../../api/services';
import { color, dim, fail, header, initUI, subheader } from '../../utils/ui';
import { sanitizeHelpText } from './shared';

type HelpWriter = (line: string) => void;

function renderPresetHelpLine(preset: ProviderPreset, idWidth: number): string {
  const presetId = sanitizeHelpText(preset.id) || 'unknown';
  const paddedId = presetId.padEnd(idWidth);
  const presetName = sanitizeHelpText(preset.name) || 'Unknown preset';
  const presetDescription = sanitizeHelpText(preset.description) || 'No description';
  return `  ${color(paddedId, 'command')} ${presetName} - ${presetDescription}`;
}

export async function showApiCommandHelp(writeLine: HelpWriter = console.log): Promise<void> {
  await initUI();
  const presetIds = getPresetIds()
    .map((id) => sanitizeHelpText(id))
    .filter(Boolean);
  const cliproxyProviderIds = listCliproxyBridgeProviders().map((provider) => provider.provider);
  const presetAliases = getPresetAliases();
  const presetIdWidth = Math.max(0, ...presetIds.map((id) => id.length)) + 2;

  writeLine(header('CCS API Management'));
  writeLine('');
  writeLine(subheader('Usage'));
  writeLine(`  ${color('ccs api', 'command')} <command> [options]`);
  writeLine('');
  writeLine(subheader('Commands'));
  writeLine(`  ${color('create [name]', 'command')}    Create new API profile (interactive)`);
  writeLine(`  ${color('list', 'command')}             List all API profiles`);
  writeLine(
    `  ${color('discover', 'command')}         Discover orphan *.settings.json and register`
  );
  writeLine(`  ${color('copy <src> <dest>', 'command')} Duplicate API profile settings + config`);
  writeLine(
    `  ${color('export <name>', 'command')}    Export profile bundle for cross-device transfer`
  );
  writeLine(`  ${color('import <file>', 'command')}    Import profile bundle and register profile`);
  writeLine(`  ${color('remove <name>', 'command')}    Remove an API profile`);
  writeLine('');
  writeLine(subheader('Options'));
  writeLine(
    `  ${color('--preset <id>', 'command')}        Use provider preset (${presetIds.join(', ')})`
  );
  writeLine(
    `  ${color('--cliproxy-provider <id>', 'command')} Use routed CLIProxy provider (${cliproxyProviderIds.join(', ')})`
  );
  writeLine(`  ${color('--base-url <url>', 'command')}     API base URL (create)`);
  writeLine(`  ${color('--api-key <key>', 'command')}      API key (create)`);
  writeLine(`  ${color('--model <model>', 'command')}      Default model (create)`);
  writeLine(
    `  ${color('--1m / --no-1m', 'command')}         Write or clear [1m] on compatible Claude mappings`
  );
  writeLine(
    `  ${color('--target <cli>', 'command')}       Default target: claude or droid (create)`
  );
  writeLine(`  ${color('--register', 'command')}           Register discovered orphan settings`);
  writeLine(`  ${color('--json', 'command')}               JSON output for discover command`);
  writeLine(`  ${color('--out <file>', 'command')}         Export bundle output path`);
  writeLine(`  ${color('--include-secrets', 'command')}    Include token in export bundle`);
  writeLine(`  ${color('--name <name>', 'command')}        Override profile name during import`);
  writeLine(
    `  ${color('--force', 'command')}              Overwrite existing or bypass validation (create/discover/copy/import)`
  );
  writeLine(`  ${color('--yes, -y', 'command')}            Skip confirmation prompts`);
  writeLine('');
  writeLine(subheader('Provider Presets'));
  PROVIDER_PRESETS.forEach((preset) => writeLine(renderPresetHelpLine(preset, presetIdWidth)));
  Object.entries(presetAliases).forEach(([alias, canonical]) => {
    const safeAlias = sanitizeHelpText(alias);
    const safeCanonical = sanitizeHelpText(canonical);
    writeLine(`  ${dim(`Legacy alias: --preset ${safeAlias} (auto-mapped to ${safeCanonical})`)}`);
  });
  writeLine('');
  writeLine(subheader('Examples'));
  writeLine(`  ${dim('# Interactive wizard')}`);
  writeLine(`  ${color('ccs api create', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Quick setup with preset')}`);
  writeLine(`  ${color('ccs api create --preset anthropic', 'command')}`);
  writeLine(
    `  ${color('ccs api create --preset anthropic --1m', 'command')} ${dim('# explicit Claude [1m] opt-in')}`
  );
  writeLine(`  ${color('ccs api create --preset openrouter', 'command')}`);
  writeLine(`  ${color('ccs api create --preset alibaba-coding-plan', 'command')}`);
  writeLine(`  ${color('ccs api create --preset alibaba', 'command')} ${dim('# alias')}`);
  writeLine(`  ${color('ccs api create --preset glm', 'command')}`);
  writeLine('');
  writeLine(subheader('Claude Long Context'));
  writeLine(`  ${dim('Plain Claude model IDs stay on standard context by default.')}`);
  writeLine(
    `  ${dim('Use --1m during create to append [1m] to compatible Claude mappings, or --no-1m to force plain IDs.')}`
  );
  writeLine(
    `  ${dim('CCS controls only the saved [1m] suffix. Provider pricing/entitlement stay upstream, and some accounts can still return 429 for long-context requests.')}`
  );
  writeLine('');
  writeLine(`  ${dim('# Create routed profile from existing CLIProxy provider config')}`);
  writeLine(`  ${color('ccs api create --cliproxy-provider gemini', 'command')}`);
  writeLine(
    `  ${color('ccs api create gemini-droid --cliproxy-provider gemini --target droid', 'command')}`
  );
  writeLine(`  ${color('ccs api create codex-api --cliproxy-provider codex', 'command')}`);
  writeLine(
    `  ${color('ccs codex-api --target codex', 'command')} ${dim('# runtime-only native Codex launch')}`
  );
  writeLine('');
  writeLine(`  ${dim('# Create with name')}`);
  writeLine(`  ${color('ccs api create myapi', 'command')}`);
  writeLine(`  ${color('ccs api create mydroid --preset glm --target droid', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Remove API profile')}`);
  writeLine(`  ${color('ccs api remove myapi', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Discover and register orphan settings files')}`);
  writeLine(`  ${color('ccs api discover', 'command')}`);
  writeLine(`  ${color('ccs api discover --register', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Duplicate an existing API profile')}`);
  writeLine(`  ${color('ccs api copy glm glm-backup', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Export and import across devices')}`);
  writeLine(`  ${color('ccs api export glm --out ./glm.ccs-profile.json', 'command')}`);
  writeLine(`  ${color('ccs api import ./glm.ccs-profile.json', 'command')}`);
  writeLine('');
  writeLine(`  ${dim('# Show all API profiles')}`);
  writeLine(`  ${color('ccs api list', 'command')}`);
  writeLine('');
}

export async function showUnknownApiCommand(command: string): Promise<void> {
  await initUI();
  console.log(fail(`Unknown command: ${command}`));
  console.log('');
  console.log('Run for help:');
  console.log(`  ${color('ccs api --help', 'command')}`);
  process.exit(1);
}
