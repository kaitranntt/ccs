/**
 * Droid BYOK provider resolution helpers.
 *
 * Factory BYOK accepts exactly:
 * - anthropic
 * - openai
 * - generic-chat-completion-api
 *
 * CCS stores provider hints in profile settings as CCS_DROID_PROVIDER and
 * resolves a best-effort provider from base URL/model when the hint is absent.
 */

export type DroidProvider = 'anthropic' | 'openai' | 'generic-chat-completion-api';

const GENERIC_PROVIDER_ALIASES = new Set<string>([
  'generic',
  'generic-openai',
  'generic-openai-api',
  'generic-chat',
  'generic-chat-completions',
  'openai-compatible',
  'chat-completions',
]);

const OPENAI_PROVIDER_ALIASES = new Set<string>(['openai-responses', 'openai-official']);
const ANTHROPIC_PROVIDER_ALIASES = new Set<string>(['anthropic-compatible']);

/**
 * Normalize potentially messy provider input into a valid Factory provider.
 */
export function normalizeDroidProvider(provider: string | undefined | null): DroidProvider | null {
  if (!provider) return null;
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'anthropic' || ANTHROPIC_PROVIDER_ALIASES.has(normalized)) {
    return 'anthropic';
  }
  if (normalized === 'openai' || OPENAI_PROVIDER_ALIASES.has(normalized)) {
    return 'openai';
  }
  if (normalized === 'generic-chat-completion-api' || GENERIC_PROVIDER_ALIASES.has(normalized)) {
    return 'generic-chat-completion-api';
  }

  return null;
}

/**
 * Infer provider primarily from base URL patterns used in BYOK configs.
 */
export function inferDroidProviderFromBaseUrl(
  baseUrl: string | undefined | null
): DroidProvider | null {
  if (!baseUrl) return null;
  const raw = baseUrl.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.host.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const isLocalHost =
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');

  if (
    host.includes('api.openai.com') ||
    host.includes('.openai.azure.com') ||
    host.includes('.services.ai.azure.com')
  ) {
    return 'openai';
  }

  if (
    pathname.includes('/compatible-mode') ||
    pathname.includes('/openai') ||
    pathname.includes('/chat/completions')
  ) {
    return 'generic-chat-completion-api';
  }

  if (
    host.includes('anthropic.com') ||
    pathname.includes('/anthropic') ||
    host.includes('ollama.com')
  ) {
    return 'anthropic';
  }

  if (
    host.includes('openrouter.ai') ||
    host.includes('orcarouter.ai') ||
    host.includes('api.groq.com') ||
    host.includes('api.deepinfra.com') ||
    host.includes('api.fireworks.ai') ||
    host.includes('inference.baseten.co') ||
    host.includes('dashscope') ||
    host.includes('huggingface.co')
  ) {
    return 'generic-chat-completion-api';
  }

  // Local OpenAI-compatible proxies are commonly exposed at /v1.
  if (isLocalHost && (pathname === '/v1' || pathname.startsWith('/v1/'))) {
    return 'generic-chat-completion-api';
  }

  return null;
}

/**
 * Infer provider from model naming when URL does not provide a clear signal.
 */
export function inferDroidProviderFromModel(
  model: string | undefined | null
): DroidProvider | null {
  if (!model) return null;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;

  const stripped = normalized.startsWith('openai/') ? normalized.slice(7) : normalized;

  if (stripped.startsWith('claude-')) {
    return 'anthropic';
  }
  if (
    stripped.startsWith('gpt-') ||
    stripped.startsWith('o1') ||
    stripped.startsWith('o3') ||
    stripped.startsWith('o4')
  ) {
    return 'openai';
  }
  if (
    stripped.startsWith('qwen') ||
    stripped.startsWith('deepseek') ||
    stripped.startsWith('kimi')
  ) {
    return 'generic-chat-completion-api';
  }
  return null;
}

export interface DroidProviderResolveInput {
  provider?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}

/**
 * Resolve a provider for Droid custom model entries.
 *
 * Precedence:
 * 1) explicit provider hint (CCS_DROID_PROVIDER)
 * 2) base URL inference
 * 3) model inference
 * 4) anthropic (backward-compatible default for legacy CCS profiles)
 */
export function resolveDroidProvider(input: DroidProviderResolveInput): DroidProvider {
  const explicit = normalizeDroidProvider(input.provider);
  if (explicit) return explicit;

  const fromUrl = inferDroidProviderFromBaseUrl(input.baseUrl);
  if (fromUrl) return fromUrl;

  const fromModel = inferDroidProviderFromModel(input.model);
  if (fromModel) return fromModel;

  return 'anthropic';
}
