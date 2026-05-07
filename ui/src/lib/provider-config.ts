/**
 * Provider Configuration
 * Backend provider capabilities are the source of truth.
 * UI keeps only presentation-specific overrides (assets/colors/instructions).
 */

import {
  CLIPROXY_PROVIDER_IDS,
  PROVIDER_CAPABILITIES,
  getDeviceCodeVerificationProviders,
} from '../../../src/cliproxy/provider-capabilities';
import type { AiProviderFamilyId, AiProviderModelAlias } from '../../../src/cliproxy/ai-providers';
import { PLUS_ONLY_PROVIDERS } from '../../../src/cliproxy/types';
import i18n from './i18n';

// Monorepo contract: UI consumes provider capability constants directly from backend
// to enforce one source of truth and prevent provider drift across surfaces.

/** Canonical list of CLIProxy provider IDs (shared with backend). */
export const CLIPROXY_PROVIDERS = CLIPROXY_PROVIDER_IDS;
export type CLIProxyProvider = (typeof CLIPROXY_PROVIDERS)[number];
export type ProviderVisualId = CLIProxyProvider | 'openai' | 'vertex';
export type CLIProxyProviderSectionId = 'core' | 'plus-extra';

export interface CLIProxyProviderSection {
  id: CLIProxyProviderSectionId;
  labelKey: string;
  hintKey: string;
  providers: readonly CLIProxyProvider[];
}

const PLUS_ONLY_PROVIDER_SET = new Set<CLIProxyProvider>(PLUS_ONLY_PROVIDERS);

export const CORE_CLIPROXY_PROVIDERS: readonly CLIProxyProvider[] = Object.freeze(
  CLIPROXY_PROVIDERS.filter((provider) => !PLUS_ONLY_PROVIDER_SET.has(provider))
);

export const PLUS_EXTRA_CLIPROXY_PROVIDERS: readonly CLIProxyProvider[] = Object.freeze(
  CLIPROXY_PROVIDERS.filter((provider) => PLUS_ONLY_PROVIDER_SET.has(provider))
);

export const CLIPROXY_PROVIDER_SECTIONS: readonly CLIProxyProviderSection[] = Object.freeze([
  {
    id: 'core',
    labelKey: 'providerConfig.sectionCoreLabel',
    hintKey: 'providerConfig.sectionCoreHint',
    providers: CORE_CLIPROXY_PROVIDERS,
  },
  {
    id: 'plus-extra',
    labelKey: 'providerConfig.sectionPlusLabel',
    hintKey: 'providerConfig.sectionPlusHint',
    providers: PLUS_EXTRA_CLIPROXY_PROVIDERS,
  },
]);

/** Check if a string is a backend-supported CLIProxy provider. */
export function isValidProvider(provider: string): provider is CLIProxyProvider {
  return CLIPROXY_PROVIDERS.includes(provider as CLIProxyProvider);
}

function normalizeProviderInput(provider: unknown): string {
  return typeof provider === 'string' ? provider.trim().toLowerCase() : '';
}

interface ProviderMetadata {
  displayName: string;
  description: string;
}

const SPECIAL_PROVIDER_VISUAL_IDS = ['openai', 'vertex'] as const;

function isPresentationProvider(provider: string): provider is CLIProxyProvider {
  return isValidProvider(provider);
}

function isProviderVisualId(provider: string): provider is ProviderVisualId {
  return (
    isPresentationProvider(provider) ||
    SPECIAL_PROVIDER_VISUAL_IDS.includes(provider as (typeof SPECIAL_PROVIDER_VISUAL_IDS)[number])
  );
}

export const PROVIDER_METADATA: Record<CLIProxyProvider, ProviderMetadata> = Object.freeze(
  Object.fromEntries(
    CLIPROXY_PROVIDERS.map((provider) => [
      provider,
      {
        displayName: PROVIDER_CAPABILITIES[provider].displayName,
        description: PROVIDER_CAPABILITIES[provider].description,
      },
    ])
  ) as Record<CLIProxyProvider, ProviderMetadata>
);

// Map provider names to asset filenames (only providers with actual logos)
export const PROVIDER_ASSETS: Partial<Record<ProviderVisualId, string>> = {
  gemini: '/assets/providers/gemini-color.svg',
  agy: '/assets/providers/agy.png',
  codex: '/assets/providers/codex-color.svg',
  qwen: '/assets/providers/qwen-color.svg',
  iflow: '/assets/providers/iflow.png',
  kiro: '/assets/providers/kiro.png',
  cursor: '/assets/sidebar/cursor.svg',
  gitlab: '/assets/providers/gitlab.svg',
  codebuddy: '/assets/providers/codebuddy.png',
  kilo: '/assets/providers/kilo.png',
  ghcp: '/assets/providers/copilot.svg',
  claude: '/assets/providers/claude.svg',
  kimi: '/assets/providers/kimi.svg',
  openai: '/assets/providers/openai.svg',
  vertex: '/assets/providers/vertex.svg',
};

interface ProviderFallbackVisual {
  textClass: string;
  letter: string;
}

const DEFAULT_PROVIDER_FALLBACK_VISUAL: ProviderFallbackVisual = {
  textClass: 'text-gray-600',
  letter: '?',
};

/** Fallback visual style when a provider logo asset is unavailable. */
export const PROVIDER_FALLBACK_VISUALS: Record<ProviderVisualId, ProviderFallbackVisual> = {
  gemini: { textClass: 'text-blue-600', letter: 'G' },
  claude: { textClass: 'text-orange-600', letter: 'C' },
  codex: { textClass: 'text-emerald-600', letter: 'X' },
  agy: { textClass: 'text-violet-600', letter: 'A' },
  qwen: { textClass: 'text-cyan-600', letter: 'Q' },
  iflow: { textClass: 'text-indigo-600', letter: 'i' },
  kiro: { textClass: 'text-teal-600', letter: 'K' },
  cursor: { textClass: 'text-slate-900', letter: 'C' },
  gitlab: { textClass: 'text-orange-600', letter: 'G' },
  codebuddy: { textClass: 'text-blue-600', letter: 'B' },
  kilo: { textClass: 'text-rose-600', letter: 'K' },
  ghcp: { textClass: 'text-green-600', letter: 'C' },
  kimi: { textClass: 'text-orange-500', letter: 'K' },
  openai: { textClass: 'text-slate-900', letter: 'O' },
  vertex: { textClass: 'text-blue-600', letter: 'V' },
};

/** Providers whose logo looks better on dark background. */
export const PROVIDERS_WITH_DARK_LOGO_BG: ReadonlySet<ProviderVisualId> = new Set(['kimi']);
const PROVIDERS_WITH_SELF_CONTAINED_LOGO: ReadonlySet<ProviderVisualId> = new Set(['codex']);

export function getAiProviderFamilyVisual(familyId: AiProviderFamilyId): ProviderVisualId {
  switch (familyId) {
    case 'gemini-api-key':
      return 'gemini';
    case 'codex-api-key':
      return 'codex';
    case 'claude-api-key':
      return 'claude';
    case 'vertex-api-key':
      return 'vertex';
    case 'openai-compatibility':
      return 'openai';
  }
}

/**
 * Parse UI model rules that use the requested=upstream convention into the
 * provider config shape where `name` is upstream and `alias` is client-visible.
 */
export function parseRequestedUpstreamModelRules(value: string): AiProviderModelAlias[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return { name: line.trim(), alias: '' };
      }

      const requested = line.slice(0, separatorIndex).trim();
      const upstream = line.slice(separatorIndex + 1).trim();
      if (!upstream) {
        return { name: requested, alias: '' };
      }

      return {
        name: upstream,
        alias: requested,
      };
    })
    .filter((item) => item.name.length > 0 || item.alias.length > 0);
}

export function getRequestedUpstreamModelRuleErrors(value: string): string[] {
  return value
    .split('\n')
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0 && line.includes('='))
    .flatMap(({ line, lineNumber }) => {
      const separatorIndex = line.indexOf('=');
      const requested = line.slice(0, separatorIndex).trim();
      const upstream = line.slice(separatorIndex + 1).trim();
      if (requested && upstream) {
        return [];
      }

      return [`Line ${lineNumber}: use requested=upstream or a plain model name.`];
    });
}

/**
 * Format stored provider config back into the UI-facing requested=upstream form.
 */
export function formatRequestedUpstreamModelRules(
  models: Array<Partial<AiProviderModelAlias>> | null | undefined
): string {
  return (models || [])
    .map((item) => {
      const requested = item.alias?.trim() || '';
      const upstream = item.name?.trim() || '';
      return requested ? `${requested}=${upstream}` : upstream;
    })
    .join('\n');
}

/**
 * Return the client-visible model ID for previews and generated settings.
 */
export function getRequestedModelId(model: AiProviderModelAlias): string {
  const requested = model.alias.trim();
  return requested || model.name.trim();
}

export function getProviderLogoAsset(provider: unknown): string | undefined {
  const normalized = normalizeProviderInput(provider);
  if (!isProviderVisualId(normalized)) {
    return undefined;
  }
  return PROVIDER_ASSETS[normalized];
}

export function getProviderFallbackVisual(provider: unknown): ProviderFallbackVisual {
  const normalized = normalizeProviderInput(provider);
  if (isProviderVisualId(normalized)) {
    return PROVIDER_FALLBACK_VISUALS[normalized];
  }
  return {
    ...DEFAULT_PROVIDER_FALLBACK_VISUAL,
    letter: normalized[0]?.toUpperCase() || DEFAULT_PROVIDER_FALLBACK_VISUAL.letter,
  };
}

export function providerNeedsDarkLogoBackground(provider: unknown): boolean {
  const normalized = normalizeProviderInput(provider);
  return isProviderVisualId(normalized) && PROVIDERS_WITH_DARK_LOGO_BG.has(normalized);
}

export function providerUsesSelfContainedLogo(provider: unknown): boolean {
  const normalized = normalizeProviderInput(provider);
  return isProviderVisualId(normalized) && PROVIDERS_WITH_SELF_CONTAINED_LOGO.has(normalized);
}

// Provider brand colors
export const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#4285F4',
  agy: '#f3722c',
  codex: '#10a37f',
  openai: '#111827',
  vertex: '#4285F4',
  iflow: '#f94144',
  qwen: '#6236FF',
  kiro: '#4d908e',
  cursor: '#111827',
  gitlab: '#FC6D26',
  codebuddy: '#2563EB',
  kilo: '#E11D48',
  ghcp: '#43aa8b',
  claude: '#D97757',
  kimi: '#FF6B35',
};

const PROVIDER_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    CLIPROXY_PROVIDERS.map((provider) => [provider, PROVIDER_METADATA[provider].displayName])
  ),
  openai: 'OpenAI',
  vertex: 'Vertex AI',
};

export function getProviderDisplayName(provider: unknown): string {
  const normalized = normalizeProviderInput(provider);
  if (!normalized) {
    return i18n.t('toasts.providerUnknown', { provider: 'unknown' });
  }
  return PROVIDER_NAMES[normalized] || i18n.t('toasts.providerUnknown', { provider: normalized });
}

export function isPlusExtraProvider(provider: unknown): boolean {
  const normalized = normalizeProviderInput(provider);
  return isValidProvider(normalized) && PLUS_ONLY_PROVIDER_SET.has(normalized);
}

export function getProviderSection(provider: unknown): CLIProxyProviderSection | null {
  const normalized = normalizeProviderInput(provider);
  if (!isValidProvider(normalized)) {
    return null;
  }

  return (
    CLIPROXY_PROVIDER_SECTIONS.find((section) => section.providers.includes(normalized)) || null
  );
}

interface VariantLike {
  provider?: unknown;
  tiers?: Record<string, { provider?: unknown } | undefined> | null;
}

export function variantUsesPlusExtraProvider(variant: VariantLike | null | undefined): boolean {
  if (!variant) {
    return false;
  }

  if (variant.tiers) {
    return Object.values(variant.tiers).some((tier) => isPlusExtraProvider(tier?.provider));
  }

  return isPlusExtraProvider(variant.provider);
}

export function groupProvidersBySection<T>(
  items: readonly T[],
  getProvider: (item: T) => unknown
): Array<CLIProxyProviderSection & { items: T[] }> {
  return CLIPROXY_PROVIDER_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => {
      const normalized = normalizeProviderInput(getProvider(item));
      return isValidProvider(normalized) && section.providers.includes(normalized);
    }),
  })).filter((section) => section.items.length > 0);
}

/** Map provider to user-facing short description */
export function getProviderDescription(provider: unknown): string {
  const normalized = normalizeProviderInput(provider);
  if (!isPresentationProvider(normalized)) return '';
  return PROVIDER_METADATA[normalized].description;
}

/** Providers whose add-account UX shows a verification code and uses `/start`. */
export const VERIFICATION_CODE_AUTH_PROVIDERS: CLIProxyProvider[] = [
  ...getDeviceCodeVerificationProviders(),
];

/** Backward-compatible alias for verification-code auth providers. */
export const DEVICE_CODE_PROVIDERS = VERIFICATION_CODE_AUTH_PROVIDERS;

const DEVICE_CODE_PROVIDER_DISPLAY_NAMES: Readonly<Partial<Record<CLIProxyProvider, string>>> =
  Object.freeze({
    ghcp: 'GitHub Copilot',
    kiro: 'Kiro (AWS)',
    qwen: 'Qwen Code',
  });

const DEVICE_CODE_PROVIDER_INSTRUCTIONS: Readonly<Partial<Record<CLIProxyProvider, string>>> =
  Object.freeze({
    ghcp: 'Sign in with your GitHub account that has Copilot access.',
    qwen: 'Sign in with your Qwen account to authorize access.',
    kiro: 'Sign in with your selected Kiro auth provider to continue.',
    kimi: 'Sign in with your Kimi account and finish the device authorization.',
  });

/** Check if the add-account UI should use the verification-code auth dialog. */
export function isDeviceCodeProvider(provider: unknown): boolean {
  const normalized = normalizeProviderInput(provider);
  return isValidProvider(normalized) && VERIFICATION_CODE_AUTH_PROVIDERS.includes(normalized);
}

/** Provider display name tuned for device-code UX copy. */
export function getDeviceCodeProviderDisplayName(provider: unknown): string {
  const normalized = normalizeProviderInput(provider);
  if (!normalized) {
    return i18n.t('toasts.providerUnknown', { provider: 'unknown' });
  }
  if (isValidProvider(normalized)) {
    return DEVICE_CODE_PROVIDER_DISPLAY_NAMES[normalized] || getProviderDisplayName(normalized);
  }
  return i18n.t('toasts.providerUnknown', { provider: normalized });
}

/** Provider-specific helper text for device-code dialog. */
export function getDeviceCodeProviderInstruction(provider: unknown): string {
  const normalized = normalizeProviderInput(provider);
  if (isValidProvider(normalized)) {
    return (
      DEVICE_CODE_PROVIDER_INSTRUCTIONS[normalized] ||
      i18n.t('providerConfig.defaultDeviceCodeInstruction')
    );
  }
  return i18n.t('providerConfig.defaultDeviceCodeInstruction');
}

/** Kiro auth methods exposed in CCS UI (aligned with CLIProxyAPIPlus support). */
export const KIRO_AUTH_METHODS = ['aws', 'aws-authcode', 'google', 'github', 'idc'] as const;
export type KiroAuthMethod = (typeof KIRO_AUTH_METHODS)[number];
export const KIRO_IDC_FLOWS = ['authcode', 'device'] as const;
export type KiroIDCFlow = (typeof KIRO_IDC_FLOWS)[number];
export const DEFAULT_KIRO_IDC_FLOW: KiroIDCFlow = 'authcode';

export type KiroFlowType = 'authorization_code' | 'device_code';
export type KiroStartEndpoint = 'start' | 'start-url';

export interface KiroAuthMethodOption {
  id: KiroAuthMethod;
  label: string;
  description: string;
  flowType: KiroFlowType;
  startEndpoint: KiroStartEndpoint;
}

/** UX-first default for issue #233: AWS Builder ID device flow. */
export const DEFAULT_KIRO_AUTH_METHOD: KiroAuthMethod = 'aws';

export const KIRO_AUTH_METHOD_OPTIONS: readonly KiroAuthMethodOption[] = [
  {
    id: 'aws',
    label: 'AWS Builder ID (Recommended)', // TODO i18n: missing key for kiro auth method aws
    description: 'Device code flow for AWS organizations and Builder ID accounts.', // TODO i18n: missing key
    flowType: 'device_code',
    startEndpoint: 'start',
  },
  {
    id: 'aws-authcode',
    label: 'AWS Builder ID (Auth Code)', // TODO i18n: missing key
    description: 'Authorization code flow via CLI binary.', // TODO i18n: missing key
    flowType: 'authorization_code',
    startEndpoint: 'start',
  },
  {
    id: 'google',
    label: 'Google OAuth', // TODO i18n: missing key
    description: 'Social OAuth flow with callback URL support.', // TODO i18n: missing key
    flowType: 'authorization_code',
    startEndpoint: 'start-url',
  },
  {
    id: 'github',
    label: 'GitHub OAuth', // TODO i18n: missing key
    description: 'Social OAuth flow via management API callback.', // TODO i18n: missing key
    flowType: 'authorization_code',
    startEndpoint: 'start-url',
  },
  {
    id: 'idc',
    label: 'AWS Identity Center (IDC)', // TODO i18n: missing key
    description: 'Use your organization start URL with auth code or device flow.', // TODO i18n: missing key
    flowType: 'authorization_code',
    startEndpoint: 'start',
  },
];

export function isKiroAuthMethod(value: string): value is KiroAuthMethod {
  return KIRO_AUTH_METHODS.includes(value as KiroAuthMethod);
}

export function normalizeKiroAuthMethod(value?: string): KiroAuthMethod {
  if (!value) return DEFAULT_KIRO_AUTH_METHOD;
  const normalized = value.trim().toLowerCase();
  return isKiroAuthMethod(normalized) ? normalized : DEFAULT_KIRO_AUTH_METHOD;
}

export function isKiroIDCFlow(value: string): value is KiroIDCFlow {
  return KIRO_IDC_FLOWS.includes(value as KiroIDCFlow);
}

export function normalizeKiroIDCFlow(value?: string): KiroIDCFlow {
  if (!value) return DEFAULT_KIRO_IDC_FLOW;
  const normalized = value.trim().toLowerCase();
  return isKiroIDCFlow(normalized) ? normalized : DEFAULT_KIRO_IDC_FLOW;
}

export function getKiroAuthMethodOption(method: KiroAuthMethod): KiroAuthMethodOption {
  const option = KIRO_AUTH_METHOD_OPTIONS.find((candidate) => candidate.id === method);
  return option || KIRO_AUTH_METHOD_OPTIONS[0];
}

export function getKiroEffectiveFlowType(
  method: KiroAuthMethod,
  idcFlow: KiroIDCFlow = DEFAULT_KIRO_IDC_FLOW
): KiroFlowType {
  if (method === 'aws') {
    return 'device_code';
  }

  if (method === 'idc') {
    return normalizeKiroIDCFlow(idcFlow) === 'device' ? 'device_code' : 'authorization_code';
  }

  return 'authorization_code';
}

export function getKiroEffectiveStartEndpoint(method: KiroAuthMethod): KiroStartEndpoint {
  return method === 'google' || method === 'github' ? 'start-url' : 'start';
}

export function isKiroSocialAuthMethod(method: KiroAuthMethod): boolean {
  return method === 'google' || method === 'github';
}
