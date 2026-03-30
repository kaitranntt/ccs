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

export function extractAccountVariantKey(accountId: string, email?: string): string | null {
  if (!email) {
    return null;
  }

  const prefix = `${email}#`;
  return accountId.startsWith(prefix) ? accountId.slice(prefix.length) : null;
}

export function formatAccountVariantLabel(accountId: string, email?: string): string | null {
  const variantKey = extractAccountVariantKey(accountId, email);
  if (!variantKey) {
    return null;
  }

  const parts = variantKey.split('-').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const genericSuffix = parts[parts.length - 1];
  if (['team', 'free', 'plus', 'pro'].includes(genericSuffix)) {
    return [formatVariantPart(genericSuffix), ...parts.slice(0, -1).map(formatVariantPart)]
      .filter(Boolean)
      .join(' · ');
  }

  return parts.map(formatVariantPart).filter(Boolean).join(' · ');
}

export function formatAccountDisplayName(accountId: string, email?: string): string {
  const base = email || accountId;
  const variantLabel = formatAccountVariantLabel(accountId, email);
  return variantLabel ? `${base} (${variantLabel})` : base;
}
