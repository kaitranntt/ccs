/**
 * Resolve upstream URLs for OpenAI-compat proxy requests.
 *
 * Two modes are supported:
 *
 * 1. Default (OpenAI mode) - appends `/chat/completions` or `/models` to the
 *    base URL so requests are routed to the OpenAI-compatible endpoint of the
 *    upstream provider.
 *
 * 2. Anthropic passthrough - some providers (e.g. Kimi coding endpoints)
 *    expose an Anthropic-compatible `/v1/messages` endpoint and reject
 *    OpenAI-format requests. For these profiles we preserve the incoming
 *    Anthropic body and forward it directly to the provider's
 *    `/v1/messages` endpoint.
 *
 * Passthrough is enabled when:
 *   - `CCS_OPENAI_PROXY_PASSTHROUGH=1` is set in the profile env, OR
 *   - The base URL is a known Anthropic-style provider host.
 */

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '';
}

function ensureSupportedProtocol(parsed: URL): void {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported upstream protocol: ${parsed.protocol}`);
  }
}

function isAnthropicPassthroughHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'api.anthropic.com' ||
    normalized.endsWith('.anthropic.com') ||
    normalized === 'api.kimi.com' ||
    normalized.endsWith('.kimi.com')
  );
}

function isOpenRouterHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'openrouter.ai' || normalized.endsWith('.openrouter.ai');
}

/**
 * Returns true if the profile should pass Anthropic-format requests through
 * directly to the upstream provider, skipping the OpenAI translation.
 */
export function isAnthropicPassthroughProfile(
  baseUrl: string,
  options: { forcePassthrough?: boolean } = {}
): boolean {
  if (options.forcePassthrough) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  ensureSupportedProtocol(parsed);
  return isAnthropicPassthroughHost(parsed.hostname);
}

/**
 * Build the upstream URL for either the messages path or the models path.
 * When passthrough is enabled, the messages path is appended verbatim
 * (i.e. `/v1/messages`); otherwise the OpenAI suffix is appended.
 */
function buildResolvedUrl(
  baseUrl: string,
  suffix: string,
  options: { passthrough?: boolean } = {}
): string {
  const parsed = new URL(baseUrl);
  ensureSupportedProtocol(parsed);

  const pathname = normalizePathname(parsed.pathname);

  if (options.passthrough) {
    // For Anthropic passthrough, the suffix is always `/v1/messages` or
    // `/v1/models`. If the base URL already ends in `/v1` we drop the
    // duplicated prefix; otherwise we append the suffix verbatim.
    if (pathname.endsWith('/v1') && suffix.startsWith('/v1/')) {
      parsed.pathname = `${pathname}${suffix.slice(3)}`;
      parsed.search = '';
      return parsed.toString();
    }
    parsed.pathname = pathname ? `${pathname}${suffix}` : suffix;
    parsed.search = '';
    return parsed.toString();
  }

  if (pathname.endsWith(suffix)) {
    return parsed.toString();
  }

  if (isOpenRouterHost(parsed.hostname) && pathname.endsWith('/api')) {
    parsed.pathname = `${pathname}/v1${suffix}`;
    return parsed.toString();
  }

  if (pathname.endsWith('/v1') || pathname.endsWith('/api')) {
    parsed.pathname = `${pathname}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
    return parsed.toString();
  }

  parsed.pathname = pathname ? `${pathname}/v1${suffix}` : `/v1${suffix}`;
  return parsed.toString();
}

/**
 * Resolve the upstream URL for a chat completions request.
 *
 * For OpenAI-compatible providers this resolves to
 * `<base>/v1/chat/completions`. For Anthropic passthrough providers this
 * resolves to `<base>/v1/messages`.
 */
export function resolveOpenAIChatCompletionsUrl(
  baseUrl: string,
  options: { passthrough?: boolean } = {}
): string {
  if (options.passthrough) {
    return buildResolvedUrl(baseUrl, '/v1/messages', { passthrough: true });
  }
  return buildResolvedUrl(baseUrl, '/chat/completions');
}

/**
 * Resolve the upstream URL for the models endpoint.
 */
export function resolveOpenAIModelsUrl(
  baseUrl: string,
  options: { passthrough?: boolean } = {}
): string {
  if (options.passthrough) {
    return buildResolvedUrl(baseUrl, '/v1/models', { passthrough: true });
  }
  return buildResolvedUrl(baseUrl, '/models');
}
