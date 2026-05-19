export const LOCALE_STORAGE_KEY = 'ccs-ui-locale';

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'vi', 'ja', 'ko'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(locale: string): locale is AppLocale {
  return SUPPORTED_LOCALES.includes(locale as AppLocale);
}

export function normalizeLocale(locale: string | null | undefined): AppLocale {
  if (!locale) return 'en';
  if (locale.toLowerCase().startsWith('ko')) return 'ko';
  if (locale.toLowerCase().startsWith('ja')) return 'ja';
  if (locale.toLowerCase().startsWith('zh')) return 'zh-CN';
  if (locale.toLowerCase().startsWith('vi')) return 'vi';
  return 'en';
}

export function getStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    return null;
  }
}

export function getInitialLocale(): AppLocale {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== 'undefined') return normalizeLocale(navigator.language);
  return 'en';
}

export function getFormattingLocale(locale?: string): string {
  if (locale) return normalizeLocale(locale);
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== 'undefined') return normalizeLocale(navigator.language);
  return 'en';
}

export function persistLocale(locale: string): AppLocale {
  const normalized = normalizeLocale(locale);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage errors and keep runtime locale only.
    }
  }
  return normalized;
}
