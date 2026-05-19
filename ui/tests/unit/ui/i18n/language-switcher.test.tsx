import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import i18n from '@/lib/i18n';
import { ContinuityOverview } from '@/components/account/continuity-overview';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { TabNavigation } from '@/pages/settings/components/tab-navigation';
import {
  getInitialLocale,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  persistLocale,
  SUPPORTED_LOCALES,
} from '@/lib/locales';

function flattenKeys(node: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (typeof node !== 'object' || node === null) return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.add(nextKey);
      continue;
    }
    if (value && typeof value === 'object') {
      flattenKeys(value, nextKey, out);
    }
  }
  return out;
}

function collectPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{[^{}]+\}\}/g), (match) => match[0]).sort();
}

describe('Dashboard i18n', () => {
  const storage = new Map<string, string>();
  const localStorageMock = window.localStorage as unknown as {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storage.clear();
    localStorageMock.getItem.mockImplementation((key: string) => storage.get(key) ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      storage.set(key, value);
    });
    localStorageMock.removeItem.mockImplementation((key: string) => {
      storage.delete(key);
    });
    localStorageMock.clear.mockImplementation(() => {
      storage.clear();
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    await i18n.changeLanguage('en');
  });

  it('renders language switcher and changes locale', async () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.queryByText('Vietnamese')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByText('Simplified Chinese'));

    await waitFor(() => {
      expect(i18n.language).toBe('zh-CN');
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'zh-CN');
  }, 10000);

  it.each([
    { locale: 'vi', label: 'Vietnamese', browserLocale: 'vi-VN' },
    { locale: 'ja', label: 'Japanese', browserLocale: 'ja-JP' },
    { locale: 'ko', label: 'Korean', browserLocale: 'ko-KR' },
  ])(
    'supports $locale locale in switcher and persistence',
    async ({ locale, label, browserLocale }) => {
      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.click(await screen.findByText(label));

      await waitFor(() => {
        expect(i18n.language).toBe(locale);
      });
      expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, locale);
      expect(normalizeLocale(browserLocale)).toBe(locale);
    }
  );

  it('restores locale from persisted storage', () => {
    persistLocale('ja');
    expect(getInitialLocale()).toBe('ja');
  });

  it('shows Chinese labels on translated settings tabs', async () => {
    await i18n.changeLanguage('zh-CN');

    render(<TabNavigation activeTab="websearch" onTabChange={() => {}} />);

    expect(screen.getByText('网页')).toBeInTheDocument();
    expect(screen.getByText('环境')).toBeInTheDocument();
    expect(screen.getByText('认证')).toBeInTheDocument();
  });

  it('shows Japanese labels on translated settings tabs', async () => {
    await i18n.changeLanguage('ja');

    render(<TabNavigation activeTab="websearch" onTabChange={() => {}} />);

    expect(screen.getByText('Web検索')).toBeInTheDocument();
    expect(screen.getByText('環境変数')).toBeInTheDocument();
    expect(screen.getByText('思考')).toBeInTheDocument();
  });

  it('uses single-account-specific next steps in the continuity overview', async () => {
    await i18n.changeLanguage('en');

    render(
      <ContinuityOverview
        totalAccounts={1}
        isolatedCount={1}
        sharedStandardCount={0}
        deeperSharedCount={0}
        sharedAloneCount={0}
        sharedPeerAccountCount={0}
        deeperReadyAccountCount={0}
        sharedGroups={[]}
        sharedPeerGroups={[]}
        deeperReadyGroups={[]}
        legacyTargetCount={0}
        cliproxyCount={0}
      />
    );

    expect(
      screen.getByText(
        'Cross-account handoff does not apply yet. Add another auth account before configuring shared continuity.'
      )
    ).toBeInTheDocument();
  });

  it('pluralizes the shared-alone readiness copy', async () => {
    await i18n.changeLanguage('en');

    render(
      <ContinuityOverview
        totalAccounts={3}
        isolatedCount={1}
        sharedStandardCount={2}
        deeperSharedCount={0}
        sharedAloneCount={2}
        sharedPeerAccountCount={0}
        deeperReadyAccountCount={0}
        sharedGroups={[]}
        sharedPeerGroups={[]}
        deeperReadyGroups={[]}
        legacyTargetCount={0}
        cliproxyCount={0}
      />
    );

    expect(
      screen.getByText('2 shared accounts are still waiting for another account in the same group.')
    ).toBeInTheDocument();
  });

  it.each(SUPPORTED_LOCALES.filter((locale: string) => locale !== 'en'))(
    'keeps %s translation keys in parity with en and preserves placeholders',
    (locale: string) => {
      const resources = i18n.options.resources as
        | Record<string, { translation: Record<string, unknown> }>
        | undefined;

      const enTranslation = resources?.en?.translation;
      const localeTranslation = resources?.[locale]?.translation;

      expect(enTranslation).toBeDefined();
      expect(localeTranslation).toBeDefined();

      const enKeys = flattenKeys(enTranslation);
      const localeKeys = flattenKeys(localeTranslation);

      expect([...localeKeys].sort()).toEqual([...enKeys].sort());

      for (const key of enKeys) {
        const enValue = key
          .split('.')
          .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], enTranslation);
        const localeValue = key
          .split('.')
          .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            localeTranslation
          );

        if (typeof enValue !== 'string' || typeof localeValue !== 'string') continue;
        expect(collectPlaceholders(localeValue)).toEqual(collectPlaceholders(enValue));
      }
    }
  );
});
