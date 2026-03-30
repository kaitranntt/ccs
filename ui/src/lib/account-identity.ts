const PERSONAL_PLAN_PARTS = new Set(['free', 'plus', 'pro']);
const BUSINESS_PLAN_PARTS = new Set(['team']);

export type AccountAudience = 'business' | 'personal' | 'unknown';

export interface AccountIdentityPresentation {
  email: string;
  audience: AccountAudience;
  audienceLabel: string | null;
  detailLabel: string | null;
  compactDetailLabel: string | null;
  inlineLabel: string | null;
}

function normalizeVariantTokenPart(value: string): string {
  return value
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function formatVariantPart(part: string): string {
  const normalized = part.trim().toLowerCase();
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
            .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
            .join(' ');
  }
}

function extractCanonicalEmailFromAccountId(accountId: string): string | null {
  const canonical = accountId.split('#')[0]?.trim();
  return canonical && canonical.includes('@') ? canonical : null;
}

function extractVariantKeyFromAccountId(accountId: string, email?: string): string | null {
  if (!email) {
    return null;
  }

  const prefix = `${email}#`;
  return accountId.startsWith(prefix) ? accountId.slice(prefix.length) : null;
}

function extractVariantKeyFromTokenFile(tokenFile?: string, email?: string): string | null {
  if (!tokenFile || !email) {
    return null;
  }

  const fileName = tokenFile.split(/[\\/]/).pop() ?? tokenFile;
  const baseName = fileName.replace(/\.json$/i, '');
  if (!baseName.toLowerCase().startsWith('codex-')) {
    return null;
  }
  const firstDashIndex = baseName.indexOf('-');
  const candidate =
    firstDashIndex > 0 && !baseName.slice(0, firstDashIndex).includes('@')
      ? baseName.slice(firstDashIndex + 1)
      : baseName;
  const emailIndex = candidate.toLowerCase().indexOf(email.toLowerCase());

  if (emailIndex === -1) {
    return null;
  }

  const before = normalizeVariantTokenPart(candidate.slice(0, emailIndex));
  const after = normalizeVariantTokenPart(candidate.slice(emailIndex + email.length));
  const parts = [before, after].filter(Boolean);
  return parts.length > 0 ? parts.join('-') : null;
}

function formatWorkspaceLabel(parts: string[]): {
  detailLabel: string | null;
  compactDetailLabel: string | null;
} {
  const workspaceId = parts.find((part) => /^[a-f0-9]{8}$/i.test(part));
  if (workspaceId) {
    return {
      detailLabel: `Workspace ${workspaceId.toLowerCase()}`,
      compactDetailLabel: workspaceId.toLowerCase(),
    };
  }

  const extraLabel = parts.map(formatVariantPart).filter(Boolean).join(' · ');
  return {
    detailLabel: extraLabel || 'Team',
    compactDetailLabel: extraLabel || 'Team',
  };
}

export function extractAccountVariantKey(
  accountId: string,
  email?: string,
  tokenFile?: string
): string | null {
  const resolvedEmail = email?.trim() || extractCanonicalEmailFromAccountId(accountId) || undefined;
  return (
    extractVariantKeyFromTokenFile(tokenFile, resolvedEmail) ??
    extractVariantKeyFromAccountId(accountId, resolvedEmail)
  );
}

export function getAccountIdentityPresentation(
  accountId: string,
  email?: string,
  tokenFile?: string
): AccountIdentityPresentation {
  const resolvedEmail = email?.trim() || extractCanonicalEmailFromAccountId(accountId) || accountId;
  const variantKey = extractAccountVariantKey(accountId, resolvedEmail, tokenFile);
  if (!variantKey) {
    return {
      email: resolvedEmail,
      audience: 'unknown',
      audienceLabel: null,
      detailLabel: null,
      compactDetailLabel: null,
      inlineLabel: null,
    };
  }

  const parts = variantKey.split('-').filter(Boolean);
  if (parts.length === 0) {
    return {
      email: resolvedEmail,
      audience: 'unknown',
      audienceLabel: null,
      detailLabel: null,
      compactDetailLabel: null,
      inlineLabel: null,
    };
  }

  const suffix = parts[parts.length - 1]?.toLowerCase();
  if (suffix && BUSINESS_PLAN_PARTS.has(suffix)) {
    const workspace = formatWorkspaceLabel(parts.slice(0, -1));
    const inlineLabel = ['Business', workspace.detailLabel].filter(Boolean).join(' · ');
    return {
      email: resolvedEmail,
      audience: 'business',
      audienceLabel: 'Business',
      detailLabel: workspace.detailLabel,
      compactDetailLabel: workspace.compactDetailLabel,
      inlineLabel,
    };
  }

  if (suffix && PERSONAL_PLAN_PARTS.has(suffix)) {
    const detailParts = [formatVariantPart(suffix), ...parts.slice(0, -1).map(formatVariantPart)]
      .filter(Boolean)
      .join(' · ');
    const detailLabel = detailParts || formatVariantPart(suffix);
    const inlineLabel = ['Personal', detailLabel].filter(Boolean).join(' · ');
    return {
      email: resolvedEmail,
      audience: 'personal',
      audienceLabel: 'Personal',
      detailLabel,
      compactDetailLabel: detailLabel,
      inlineLabel,
    };
  }

  const fallbackLabel = parts.map(formatVariantPart).filter(Boolean).join(' · ');
  return {
    email: resolvedEmail,
    audience: 'unknown',
    audienceLabel: null,
    detailLabel: fallbackLabel || null,
    compactDetailLabel: fallbackLabel || null,
    inlineLabel: fallbackLabel || null,
  };
}

export function formatAccountVariantLabel(
  accountId: string,
  email?: string,
  tokenFile?: string
): string | null {
  return getAccountIdentityPresentation(accountId, email, tokenFile).inlineLabel;
}

export function formatAccountDisplayName(
  accountId: string,
  email?: string,
  tokenFile?: string
): string {
  const presentation = getAccountIdentityPresentation(accountId, email, tokenFile);
  return presentation.inlineLabel
    ? `${presentation.email} (${presentation.inlineLabel})`
    : presentation.email;
}
