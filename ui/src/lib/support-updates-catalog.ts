export type SupportStatus = 'new' | 'stable' | 'planned';

export type SupportScope = 'target' | 'cliproxy' | 'api-profiles' | 'websearch';

export interface SupportRouteHint {
  label: string;
  path: string;
}

export interface SupportNoticeAction {
  id: string;
  label: string;
  description: string;
  type: 'route' | 'command';
  path?: string;
  command?: string;
}

export interface SupportNotice {
  id: string;
  title: string;
  summary: string;
  primaryAction: string;
  publishedAt: string;
  status: SupportStatus;
  scopes: SupportScope[];
  entryIds: string[];
  highlights: string[];
  actions: SupportNoticeAction[];
  routes: SupportRouteHint[];
  commands: string[];
}

export interface CliSupportEntry {
  id: string;
  name: string;
  scope: SupportScope;
  status: SupportStatus;
  summary: string;
  pillars: {
    baseUrl: string;
    auth: string;
    model: string;
  };
  routes: SupportRouteHint[];
  commands: string[];
  notes?: string;
}

export const SUPPORT_SCOPE_LABELS: Record<SupportScope, string> = {
  target: 'Target CLI',
  cliproxy: 'CLIProxy Provider',
  'api-profiles': 'API Profile',
  websearch: 'WebSearch',
};

export const SUPPORT_NOTICES: SupportNotice[] = [
  {
    id: 'codex-target-runtime-support',
    title: 'Native Codex runtime support is live',
    summary:
      'Codex now participates as a first-class runtime target through ccs-codex, ccsx, or --target codex.',
    primaryAction:
      'Use Codex as a runtime target for native Codex sessions and Codex-routed CLIProxy flows.',
    publishedAt: '2026-03-28',
    status: 'new',
    scopes: ['target', 'cliproxy', 'api-profiles'],
    entryIds: ['codex-target', 'codex-cliproxy'],
    highlights: [
      'Use ccs-codex or ccsx for native Codex runs.',
      'Built-in Codex and Codex bridge profiles can run on native Codex with --target codex.',
      'Saved default targets for API profiles and variants remain claude or droid.',
    ],
    actions: [
      {
        id: 'copy-codex-alias-command',
        label: 'Open native Codex',
        description: 'Launch Codex through the explicit CCS runtime alias.',
        type: 'command',
        command: 'ccs-codex',
      },
      {
        id: 'copy-codex-provider-command',
        label: 'Run built-in Codex on Codex',
        description: 'Use the built-in Codex provider with native Codex runtime.',
        type: 'command',
        command: 'ccs codex --target codex "your prompt"',
      },
      {
        id: 'open-cliproxy-codex',
        label: 'Open Codex provider settings',
        description: 'Review Codex provider and bridge flows in the dashboard.',
        type: 'route',
        path: '/cliproxy',
      },
    ],
    routes: [
      { label: 'CLIProxy', path: '/cliproxy' },
      { label: 'API Profiles', path: '/providers' },
    ],
    commands: ['ccs-codex', 'ccsx', 'ccs codex --target codex "your prompt"'],
  },
  {
    id: 'droid-target-support',
    title: 'Factory Droid support is live',
    summary:
      'API Profiles and CLIProxy variants now support Droid as a first-class execution target.',
    primaryAction: 'Set Droid as your default execution target for non-Claude workflows.',
    publishedAt: '2026-02-25',
    status: 'new',
    scopes: ['target', 'api-profiles', 'cliproxy'],
    entryIds: ['droid-target', 'custom-api-profiles', 'codex-cliproxy', 'agy-cliproxy'],
    highlights: [
      'Set default target to Droid when creating or editing API Profiles.',
      'Set default target to Droid for CLIProxy variants, including Codex and Antigravity flows.',
      'Use ccs-droid as the explicit alias, with ccsd kept as the legacy shortcut.',
    ],
    actions: [
      {
        id: 'open-api-profiles',
        label: 'Set default target in API Profiles',
        description:
          'Open API Profiles and set Default Target to Droid for profiles you run often.',
        type: 'route',
        path: '/providers',
      },
      {
        id: 'open-cliproxy',
        label: 'Set default target in CLIProxy variants',
        description:
          'Open CLIProxy variants and set target to Droid for Codex/Antigravity or custom variants.',
        type: 'route',
        path: '/cliproxy',
      },
      {
        id: 'copy-ccs-droid-command',
        label: 'Run once with explicit Droid alias',
        description: 'Use ccs-droid to force the Droid target with your current profile.',
        type: 'command',
        command: 'ccs-droid glm',
      },
      {
        id: 'copy-target-override',
        label: 'Run once with --target override',
        description: 'Keep your default profile but force Droid for a single command.',
        type: 'command',
        command: 'ccs codex --target droid "your prompt"',
      },
    ],
    routes: [
      { label: 'API Profiles', path: '/providers' },
      { label: 'CLIProxy', path: '/cliproxy' },
    ],
    commands: [
      'ccs-droid glm',
      'ccs codex --target droid "your prompt"',
      'ccs cliproxy create mycodex --provider codex --target droid',
    ],
  },
  {
    id: 'updates-center-launch',
    title: 'Updates inbox is available for rollout tasks',
    summary:
      'A focused updates inbox exists for setup tasks and rollout guidance when you need it.',
    primaryAction:
      'Use this page only when needed for rollout tasks, then return to your normal workflow.',
    publishedAt: '2026-02-25',
    status: 'new',
    scopes: ['target', 'cliproxy', 'api-profiles', 'websearch'],
    entryIds: ['droid-target', 'codex-cliproxy', 'custom-api-profiles', 'opencode-websearch'],
    highlights: [
      'Single data source powers update content and integration mapping.',
      'Notices can be tracked as new, seen, done, or dismissed.',
      'Catalog covers target CLI, CLIProxy providers, and WebSearch integrations.',
    ],
    actions: [
      {
        id: 'open-updates-page',
        label: 'Open updates inbox when needed',
        description: 'Review rollout tasks only when you want guided setup changes.',
        type: 'route',
        path: '/updates',
      },
      {
        id: 'copy-open-dashboard',
        label: 'Open dashboard from terminal',
        description: 'Re-open config dashboard anytime from CLI.',
        type: 'command',
        command: 'ccs config',
      },
    ],
    routes: [{ label: 'Updates Inbox', path: '/updates' }],
    commands: ['ccs config'],
  },
];

export const CLI_SUPPORT_ENTRIES: CliSupportEntry[] = [
  {
    id: 'claude-target',
    name: 'Claude Code',
    scope: 'target',
    status: 'stable',
    summary: 'Default runtime target for all CCS profile types.',
    pillars: {
      baseUrl: 'From profile settings (ANTHROPIC_BASE_URL)',
      auth: 'From profile settings (ANTHROPIC_AUTH_TOKEN)',
      model: 'From profile settings (ANTHROPIC_MODEL)',
    },
    routes: [
      { label: 'API Profiles', path: '/providers' },
      { label: 'CLIProxy', path: '/cliproxy' },
    ],
    commands: ['ccs', 'ccs glm "your prompt"'],
  },
  {
    id: 'droid-target',
    name: 'Factory Droid',
    scope: 'target',
    status: 'new',
    summary: 'First-class target for API Profiles and CLIProxy variants.',
    pillars: {
      baseUrl: 'From profile or variant settings',
      auth: 'From profile or variant settings',
      model: 'From profile or variant settings',
    },
    routes: [
      { label: 'API Profiles', path: '/providers' },
      { label: 'CLIProxy', path: '/cliproxy' },
    ],
    commands: ['ccs-droid glm', 'ccs km --target droid', 'ccs codex --target droid'],
    notes: 'Use ccs-droid as the explicit runtime alias. Legacy ccsd still works.',
  },
  {
    id: 'codex-target',
    name: 'Codex CLI',
    scope: 'target',
    status: 'new',
    summary:
      'First-class runtime target for native Codex sessions and Codex-routed CLIProxy flows.',
    pillars: {
      baseUrl:
        'Native ~/.codex config for default mode, transient -c overrides for CCS-backed routes',
      auth: 'Native Codex auth for default mode, env_key injection for CCS-backed routes',
      model: 'Native Codex config or routed Codex model mapping from CLIProxy',
    },
    routes: [
      { label: 'CLIProxy', path: '/cliproxy' },
      { label: 'API Profiles', path: '/providers' },
    ],
    commands: ['ccs-codex', 'ccsx', 'ccs codex --target codex', 'ccs codex-api --target codex'],
    notes:
      'Runtime-only in v1. Saved default targets for API profiles and CLIProxy variants remain claude or droid.',
  },
  {
    id: 'codex-cliproxy',
    name: 'Codex via CLIProxy',
    scope: 'cliproxy',
    status: 'stable',
    summary: 'OAuth-backed provider with configurable variant model and target.',
    pillars: {
      baseUrl: 'Managed by CLIProxy backend',
      auth: 'OAuth account via CLIProxy auth flow',
      model: 'Selectable per provider or variant',
    },
    routes: [
      { label: 'CLIProxy', path: '/cliproxy' },
      { label: 'Control Panel', path: '/cliproxy/control-panel' },
    ],
    commands: [
      'ccs codex',
      'ccs codex --target codex',
      'ccs cliproxy create mycodex --provider codex',
      'ccs api create codex-api --cliproxy-provider codex',
    ],
  },
  {
    id: 'gemini-cliproxy',
    name: 'Gemini via CLIProxy',
    scope: 'cliproxy',
    status: 'stable',
    summary: 'OAuth-backed Gemini provider with multi-account management.',
    pillars: {
      baseUrl: 'Managed by CLIProxy backend',
      auth: 'OAuth account via CLIProxy auth flow',
      model: 'Selectable per provider or variant',
    },
    routes: [
      { label: 'CLIProxy', path: '/cliproxy' },
      { label: 'Control Panel', path: '/cliproxy/control-panel' },
    ],
    commands: ['ccs gemini', 'ccs cliproxy create mygem --provider gemini'],
  },
  {
    id: 'agy-cliproxy',
    name: 'Antigravity via CLIProxy',
    scope: 'cliproxy',
    status: 'stable',
    summary: 'OAuth-backed Antigravity provider with variant target controls.',
    pillars: {
      baseUrl: 'Managed by CLIProxy backend',
      auth: 'OAuth account via CLIProxy auth flow',
      model: 'Selectable per provider or variant',
    },
    routes: [
      { label: 'CLIProxy', path: '/cliproxy' },
      { label: 'Control Panel', path: '/cliproxy/control-panel' },
    ],
    commands: ['ccs agy', 'ccs cliproxy create myagy --provider agy --target droid'],
  },
  {
    id: 'custom-api-profiles',
    name: 'Custom API Profiles',
    scope: 'api-profiles',
    status: 'stable',
    summary: 'Any Anthropic-compatible endpoint with per-profile target and model mapping.',
    pillars: {
      baseUrl: 'User-defined endpoint',
      auth: 'User-defined token/key',
      model: 'User-defined model identifier',
    },
    routes: [{ label: 'API Profiles', path: '/providers' }],
    commands: ['ccs api create myprofile', 'ccs myprofile "your prompt"'],
  },
  {
    id: 'opencode-websearch',
    name: 'OpenCode WebSearch',
    scope: 'websearch',
    status: 'stable',
    summary: 'WebSearch provider surfaced in Settings for third-party profile workflows.',
    pillars: {
      baseUrl: 'Managed by OpenCode CLI integration',
      auth: 'Provider-specific (managed externally)',
      model: 'Configurable in WebSearch settings',
    },
    routes: [{ label: 'Settings', path: '/settings' }],
    commands: ['ccs config', 'ccs codex "your prompt"'],
    notes: 'Enable OpenCode in Settings > WebSearch to activate fallback search.',
  },
];

const SUPPORT_ENTRY_LOOKUP = new Map(CLI_SUPPORT_ENTRIES.map((entry) => [entry.id, entry]));

export function getSupportEntriesForNotice(notice: SupportNotice): CliSupportEntry[] {
  return notice.entryIds
    .map((entryId) => SUPPORT_ENTRY_LOOKUP.get(entryId))
    .filter((entry): entry is CliSupportEntry => Boolean(entry));
}

export function getLatestSupportNotice(): SupportNotice | null {
  if (SUPPORT_NOTICES.length === 0) {
    return null;
  }

  return [...SUPPORT_NOTICES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
}

export function formatCatalogDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}
