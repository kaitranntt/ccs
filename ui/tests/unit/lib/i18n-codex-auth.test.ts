import { afterAll, describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';

const locales = ['en', 'zh-CN', 'vi', 'ja', 'ko'] as const;

const codexAuthKeys = [
  ['codex.auth.sourceDefault'],
  ['codex.auth.sourceEnv'],
  ['codex.auth.sourceExplicitCodexHome'],
  ['codex.auth.terminalOnlyTooltipRich'],
  ['codex.auth.activeSourceBadge', { source: 'default' }],
  ['codex.auth.statusOk'],
  ['codex.auth.statusInvalid'],
  ['codex.auth.loading'],
  ['codex.auth.loadError'],
  ['codex.auth.emptyRegistryRich'],
  ['codex.auth.legacyCodexHomeRich'],
  ['codex.auth.legacyModeRich'],
  ['codex.auth.externalCodexHomeRich', { path: '/tmp/codex-home' }],
  ['codex.auth.activeProfile'],
  ['codex.auth.unknownProfile'],
  ['codex.auth.planLabel'],
  ['codex.auth.switchAction'],
  ['codex.auth.removeAction'],
  ['codex.auth.col.name'],
  ['codex.auth.col.email'],
  ['codex.auth.col.plan'],
  ['codex.auth.col.lastUsed'],
  ['codex.auth.col.status'],
  ['codex.auth.col.actions'],
  ['codexPage.authProfiles'],
] as const;

const originalLanguage = i18n.language;

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage);
});

describe('codex auth i18n', () => {
  it.each(locales)('resolves codex auth dashboard keys for %s', async (locale) => {
    await i18n.changeLanguage(locale);

    for (const [key, options] of codexAuthKeys) {
      const translated = i18n.t(key, options);

      expect(translated).not.toBe(key);
      expect(translated).not.toContain('codex.auth.');
      expect(translated).not.toContain('codexPage.');
      if (key === 'codex.auth.externalCodexHomeRich') {
        expect(translated).toContain('/tmp/codex-home');
      }
      if (key === 'codex.auth.activeSourceBadge') {
        expect(translated).toContain('default');
      }
    }
  });
});
