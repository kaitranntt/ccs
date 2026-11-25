import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getInitialLocale, normalizeLocale, SUPPORTED_LOCALES, type AppLocale } from './locales';
import enTranslation from './locales/en';

export type LocaleMessages = Record<string, unknown>;

const localeLoaders: Record<
  Exclude<AppLocale, 'en'>,
  () => Promise<{ default: LocaleMessages }>
> = {
  'pt-BR': () => import('./locales/pt-BR'),
  'zh-CN': () => import('./locales/zh-CN'),
  vi: () => import('./locales/vi'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
};

const inFlightLoads = new Map<AppLocale, Promise<LocaleMessages>>();

/**
 * Dynamically load a locale's translation dictionary and register it with i18next.
 * English is bundled eagerly as the fallback; non-English bundles are code-split.
 */
export async function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
  const normalized = normalizeLocale(locale);
  if (normalized === 'en') {
    return enTranslation as unknown as LocaleMessages;
  }

  const existing = i18n.getResourceBundle(normalized, 'translation') as LocaleMessages | undefined;
  if (existing) {
    return existing;
  }

  const pending = inFlightLoads.get(normalized);
  if (pending) {
    return pending;
  }

  const loadPromise = localeLoaders[normalized]()
    .then((mod) => {
      const messages = mod.default;
      i18n.addResourceBundle(normalized, 'translation', messages, true, true);
      return messages;
    })
    .finally(() => {
      inFlightLoads.delete(normalized);
    });

  inFlightLoads.set(normalized, loadPromise);
  return loadPromise;
}

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    loadLocaleMessages(language)
      .then((messages) => callback(null, messages))
      .catch((error) => callback(error as Error, null));
  },
};

if (!i18n.isInitialized) {
  i18n
    .use(lazyLocaleBackend)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: enTranslation },
      },
      partialBundledLanguages: true,
      supportedLngs: [...SUPPORTED_LOCALES],
      load: 'currentOnly',
      lng: getInitialLocale(),
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
    });
}

export default i18n;
