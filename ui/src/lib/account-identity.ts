import i18n from './i18n';

const FREE_PLAN_PARTS = new Set(['free']);
const PERSONAL_PLAN_PARTS = new Set(['plus', 'pro']);
const BUSINESS_PLAN_PARTS = new Set(['team']);

// Keep variant parsing aligned with src/cliproxy/accounts/email-account-identity.ts.
// This browser copy stays local because the server module is not bundle-safe for the UI.

export type AccountAudience = 'business' | 'free' | 'personal' | 'unknown';

export interface AccountIdentityPresentation {
  email: string;
  audience: AccountAudience;
  audienceLabel: string | null;
  detailLabel: string | null;
  compactDetailLabel: string | null;
  inlineLabel: string | null;
}

export interface CodexIdentityBadge {
  audience: AccountAudience;
  label: string | null;
}

function normalizeVariantTokenPart(value: string): string {
  return value
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export function formatAccountVariantPart(part: string): string {
  const normalized = part.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'team':
      return i18n.t('accountIdentity.team');
    case 'free':
      return i18n.t('accountIdentity.free');
    case 'plus':
      return i18n.t('accountIdentity.plus');
    case 'pro':
      return i18n.t('accountIdentity.pro');
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
      detailLabel: i18n.t('accountIdentity.workspace', { id: workspaceId.toLowerCase() }),
      compactDetailLabel: workspaceId.toLowerCase(),
    };
  }

  const extraLabel = parts.map(formatAccountVariantPart).filter(Boolean).join(' · ');
  return {
    detailLabel: extraLabel || null,
    compactDetailLabel: extraLabel || null,
  };
}

function formatAudienceDetail(parts: string[]): string | null {
  const label = parts.map(formatAccountVariantPart).filter(Boolean).join(' · ');
  return label || null;
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
    const inlineLabel = [i18n.t('accountIdentity.business'), workspace.detailLabel]
      .filter(Boolean)
      .join(' · ');
    return {
      email: resolvedEmail,
      audience: 'business',
      audienceLabel: i18n.t('accountIdentity.business'),
      detailLabel: workspace.detailLabel,
      compactDetailLabel: workspace.compactDetailLabel,
      inlineLabel,
    };
  }

  if (suffix && FREE_PLAN_PARTS.has(suffix)) {
    const detailLabel = formatAudienceDetail(parts.slice(0, -1));
    const inlineLabel = [i18n.t('accountIdentity.free'), detailLabel].filter(Boolean).join(' · ');
    return {
      email: resolvedEmail,
      audience: 'free',
      audienceLabel: i18n.t('accountIdentity.free'),
      detailLabel,
      compactDetailLabel: detailLabel,
      inlineLabel,
    };
  }

  if (suffix && PERSONAL_PLAN_PARTS.has(suffix)) {
    const detailLabel = [formatAccountVariantPart(suffix), formatAudienceDetail(parts.slice(0, -1))]
      .filter(Boolean)
      .join(' · ');
    const inlineLabel = [i18n.t('accountIdentity.personal'), detailLabel]
      .filter(Boolean)
      .join(' · ');
    return {
      email: resolvedEmail,
      audience: 'personal',
      audienceLabel: i18n.t('accountIdentity.personal'),
      detailLabel: detailLabel || formatAccountVariantPart(suffix),
      compactDetailLabel: detailLabel || formatAccountVariantPart(suffix),
      inlineLabel,
    };
  }

  const fallbackLabel = parts.map(formatAccountVariantPart).filter(Boolean).join(' · ');
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

export function getCodexIdentityBadge(
  presentation: Pick<AccountIdentityPresentation, 'audience' | 'detailLabel' | 'compactDetailLabel'>
): CodexIdentityBadge {
  if (presentation.audience === 'business') {
    return { audience: 'business', label: i18n.t('accountIdentity.business') };
  }

  if (presentation.audience === 'free') {
    return { audience: 'free', label: i18n.t('accountIdentity.free') };
  }

  if (presentation.audience === 'personal') {
    return {
      audience: 'personal',
      label:
        presentation.compactDetailLabel ??
        presentation.detailLabel ??
        i18n.t('accountIdentity.personal'),
    };
  }

  return { audience: 'unknown', label: null };
}

export function formatAccountDisplayName(
  accountId: string,
  email?: string,
  tokenFile?: string,
  nickname?: string
): string {
  const { primary, secondary } = getAccountDisplayLabels(accountId, email, tokenFile, nickname);
  if (secondary) return `${primary} (${secondary})`;
  const presentation = getAccountIdentityPresentation(accountId, email, tokenFile);
  return presentation.inlineLabel ? `${presentation.email} (${presentation.inlineLabel})` : primary;
}

/** Presentation only: nicknames never replace the account ID used for actions. */
export function getAccountDisplayLabels(
  accountId: string,
  email?: string,
  tokenFile?: string,
  nickname?: string,
  displayEmail?: string
): { primary: string; secondary?: string } {
  const presentation = getAccountIdentityPresentation(accountId, email, tokenFile);
  const identityLabel = presentation.inlineLabel
    ? `${presentation.email} (${presentation.inlineLabel})`
    : presentation.email;
  const savedNickname = nickname?.trim();
  return savedNickname
    ? {
        primary: savedNickname,
        secondary:
          !presentation.inlineLabel && presentation.email !== accountId
            ? `${identityLabel} · ${accountId}`
            : identityLabel,
      }
    : { primary: displayEmail || presentation.email || accountId };
}
