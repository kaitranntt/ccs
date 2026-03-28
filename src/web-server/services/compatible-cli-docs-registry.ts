export interface CompatibleCliDocLink {
  id: string;
  label: string;
  url: string;
  category: 'overview' | 'configuration' | 'byok' | 'reference';
  source: 'factory' | 'provider' | 'openai' | 'github';
  description: string;
}

export interface CompatibleCliProviderDocLink {
  provider: string;
  label: string;
  apiFormat: string;
  url: string;
}

export interface CompatibleCliDocsReference {
  providerValues: string[];
  settingsHierarchy: string[];
  notes: string[];
  links: CompatibleCliDocLink[];
  providerDocs: CompatibleCliProviderDocLink[];
}

interface CompatibleCliDocsRegistryEntry {
  cliId: string;
  displayName: string;
  docsReference: CompatibleCliDocsReference;
}

const COMPATIBLE_CLI_DOCS_REGISTRY: Record<string, CompatibleCliDocsRegistryEntry> = {
  droid: {
    cliId: 'droid',
    displayName: 'Droid CLI',
    docsReference: {
      providerValues: ['anthropic', 'openai', 'generic-chat-completion-api'],
      settingsHierarchy: [
        'project-level config',
        'user-level config',
        'home-level config',
        'CLI flags and env vars',
      ],
      notes: [
        'BYOK custom models are read from ~/.factory/settings.json customModels[]',
        'Legacy key style (custom_models, model_display_name, base_url, api_key, max_tokens) remains in circulation',
        'Factory docs mention legacy support for ~/.factory/config.json',
        'Interactive model selection uses settings.model (custom:<alias>)',
        'Provider-specific reasoning keys in extraArgs: generic-chat-completion-api => reasoning_effort, openai => reasoning.effort, anthropic => thinking.{type,budget_tokens}',
        'droid exec supports --model for one-off execution mode',
      ],
      links: [
        {
          id: 'droid-cli-overview',
          label: 'Droid CLI Overview',
          url: 'https://docs.factory.ai/cli/',
          category: 'overview',
          source: 'factory',
          description: 'Primary entry docs for setup, auth, and core CLI usage.',
        },
        {
          id: 'droid-byok-overview',
          label: 'BYOK Overview',
          url: 'https://docs.factory.ai/cli/byok/overview/',
          category: 'byok',
          source: 'factory',
          description: 'BYOK model/provider shape, provider values, and migration notes.',
        },
        {
          id: 'droid-settings-reference',
          label: 'settings.json Reference',
          url: 'https://docs.factory.ai/cli/configuration/settings/',
          category: 'configuration',
          source: 'factory',
          description: 'Supported settings keys, defaults, and allowed values.',
        },
      ],
      providerDocs: [
        {
          provider: 'anthropic',
          label: 'Anthropic Messages API',
          apiFormat: 'Messages API',
          url: 'https://docs.anthropic.com/en/api/messages',
        },
        {
          provider: 'openai',
          label: 'OpenAI Responses API',
          apiFormat: 'Responses API',
          url: 'https://platform.openai.com/docs/api-reference/responses',
        },
        {
          provider: 'generic-chat-completion-api',
          label: 'OpenAI Chat Completions Spec',
          apiFormat: 'Chat Completions API',
          url: 'https://platform.openai.com/docs/api-reference/chat',
        },
      ],
    },
  },
  codex: {
    cliId: 'codex',
    displayName: 'Codex CLI',
    docsReference: {
      providerValues: ['openai', 'oss', 'custom model_providers'],
      settingsHierarchy: [
        'system managed config',
        'user config ($CODEX_HOME/config.toml)',
        'cwd config',
        'tree/repo config',
        'CLI -c overrides and environment variables',
      ],
      notes: [
        'User config lives at ~/.codex/config.toml unless CODEX_HOME overrides the base directory',
        'Codex merges multiple config layers; this dashboard edits only the user layer',
        'CLI --profile selects a named [profiles.<name>] overlay on top of base config',
        'CCS-backed Codex launches may apply transient -c overrides and CCS_CODEX_API_KEY',
        'Official docs treat model_providers, mcp_servers, features, and project trust as schema-backed config surfaces',
      ],
      links: [
        {
          id: 'codex-config-basic',
          label: 'Codex Config Basics',
          url: 'https://developers.openai.com/codex/config-basic',
          category: 'overview',
          source: 'openai',
          description:
            'Official user-layer setup, config location, and basic configuration guidance.',
        },
        {
          id: 'codex-config-advanced',
          label: 'Codex Config Advanced',
          url: 'https://developers.openai.com/codex/config-advanced',
          category: 'configuration',
          source: 'openai',
          description: 'Advanced layering, project trust, profiles, and stricter config behaviors.',
        },
        {
          id: 'codex-config-reference',
          label: 'Codex Config Reference',
          url: 'https://developers.openai.com/codex/config-reference',
          category: 'reference',
          source: 'openai',
          description:
            'Canonical upstream config schema surface for model providers, features, MCP, and more.',
        },
        {
          id: 'codex-releases',
          label: 'Codex GitHub Releases',
          url: 'https://github.com/openai/codex/releases',
          category: 'reference',
          source: 'github',
          description:
            'Track CLI release notes and upstream behavior changes across stable and prerelease builds.',
        },
      ],
      providerDocs: [
        {
          provider: 'openai',
          label: 'OpenAI Responses API',
          apiFormat: 'Responses API',
          url: 'https://platform.openai.com/docs/api-reference/responses',
        },
      ],
    },
  },
};

export function getCompatibleCliDocsReference(cliId: string): CompatibleCliDocsReference {
  const entry = COMPATIBLE_CLI_DOCS_REGISTRY[cliId];
  if (!entry) {
    throw new Error(`Unsupported compatible CLI docs reference: ${cliId}`);
  }
  return entry.docsReference;
}
