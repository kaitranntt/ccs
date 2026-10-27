import type { CLIProxyProvider } from '../types';

// Claude: one login can authorize a personal or a team organization, and CLIProxyAPI
// keeps each in its own claude-<org hash>-<email>.json file.
const DUPLICATE_EMAIL_ACCOUNT_PROVIDERS = new Set<string>(['codex', 'claude']);
const FREE_PLAN_PARTS = new Set(['free']);
const PERSONAL_PLAN_PARTS = new Set(['plus', 'pro']);
const BUSINESS_PLAN_PARTS = new Set(['team']);

// Keep variant parsing aligned with ui/src/lib/account-identity.ts. The UI copy is
// separate because the browser bundle cannot import this server module directly.

function normalizeProvider(provider: CLIProxyProvider | string): string {
  return provider.trim().toLowerCase();
}

function cleanVariantTokenPart(value: string): string {
  return value
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function baseNicknameFromEmail(email?: string): string {
  if (!email) return 'default';
  return email.split('@')[0].replace(/\s+/g, '').slice(0, 50) || 'default';
}

function formatVariantPart(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'team':
      return 'Team';
    case 'free':
      return 'Free';
    case 'plus':
      return 'Plus';
    case 'pro':
      return 'Pro';
    default:
      return /^[a-f0-9]{8}$/i.test(normalized)
        ? normalized
        : normalized
            .split(/[._-]+/)
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(' ');
  }
}

function formatWorkspaceLabel(parts: string[]): string | null {
  const workspaceId = parts.find((part) => /^[a-f0-9]{8}$/i.test(part));
  if (workspaceId) {
    return `Workspace ${workspaceId.toLowerCase()}`;
  }

  return parts.map(formatVariantPart).filter(Boolean).join(' · ') || null;
}

function formatAudienceDetail(parts: string[]): string | null {
  const label = parts.map(formatVariantPart).filter(Boolean).join(' · ');
  return label || null;
}

export function supportsDuplicateEmailAccounts(provider: CLIProxyProvider | string): boolean {
  return DUPLICATE_EMAIL_ACCOUNT_PROVIDERS.has(normalizeProvider(provider));
}

export function extractCanonicalEmailFromAccountId(accountId: string): string | null {
  const canonical = accountId.split('#')[0]?.trim();
  return canonical && canonical.includes('@') ? canonical : null;
}

export function extractEmailAccountVariantKey(
  provider: CLIProxyProvider | string,
  tokenFile: string,
  email?: string
): string | null {
  if (!email || !supportsDuplicateEmailAccounts(provider)) {
    return null;
  }

  const normalizedProvider = normalizeProvider(provider);
  const baseName = tokenFile.replace(/\.json$/i, '');
  const providerPrefix = `${normalizedProvider}-`;
  const candidate = baseName.toLowerCase().startsWith(providerPrefix)
    ? baseName.slice(providerPrefix.length)
    : baseName;
  const emailIndex = candidate.toLowerCase().indexOf(email.toLowerCase());

  if (emailIndex === -1) {
    const fallback = cleanVariantTokenPart(candidate);
    return fallback && fallback !== cleanVariantTokenPart(email) ? fallback : null;
  }

  const before = cleanVariantTokenPart(candidate.slice(0, emailIndex));
  const after = cleanVariantTokenPart(candidate.slice(emailIndex + email.length));
  const parts = [before, after].filter(Boolean);
  return parts.length > 0 ? parts.join('-') : null;
}

export function buildEmailBackedAccountId(
  provider: CLIProxyProvider | string,
  tokenFile: string,
  email?: string,
  duplicateEmailCount = 1
): string {
  if (!email) {
    return 'default';
  }

  if (!supportsDuplicateEmailAccounts(provider) || duplicateEmailCount <= 1) {
    return email;
  }

  const variantKey = extractEmailAccountVariantKey(provider, tokenFile, email);
  return variantKey ? `${email}#${variantKey}` : email;
}

export function buildEmailBackedNickname(
  provider: CLIProxyProvider | string,
  tokenFile: string,
  email?: string,
  duplicateEmailCount = 1
): string {
  const base = baseNicknameFromEmail(email);
  if (!supportsDuplicateEmailAccounts(provider) || duplicateEmailCount <= 1) {
    return base;
  }

  const variantKey = extractEmailAccountVariantKey(provider, tokenFile, email);
  if (!variantKey) {
    return base;
  }

  return `${base}-${variantKey}`.slice(0, 50);
}

export function formatAccountVariantLabel(accountId: string, email?: string): string | null {
  const variantKey =
    extractCanonicalEmailFromAccountId(accountId) === email ? accountId.split('#')[1] : null;
  if (!variantKey) {
    return null;
  }

  const parts = variantKey.split('-').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const suffix = parts[parts.length - 1]?.toLowerCase();
  if (suffix && BUSINESS_PLAN_PARTS.has(suffix)) {
    return ['Business', formatWorkspaceLabel(parts.slice(0, -1))].filter(Boolean).join(' · ');
  }

  if (suffix && FREE_PLAN_PARTS.has(suffix)) {
    return ['Free', formatAudienceDetail(parts.slice(0, -1))].filter(Boolean).join(' · ');
  }

  if (suffix && PERSONAL_PLAN_PARTS.has(suffix)) {
    return ['Personal', formatVariantPart(suffix), formatAudienceDetail(parts.slice(0, -1))]
      .filter(Boolean)
      .join(' · ');
  }

  return parts.map(formatVariantPart).filter(Boolean).join(' · ');
}

export function formatAccountDisplayName(account: { id: string; email?: string }): string {
  const base = account.email || account.id;
  const variantLabel = formatAccountVariantLabel(account.id, account.email);
  return variantLabel ? `${base} (${variantLabel})` : base;
}
