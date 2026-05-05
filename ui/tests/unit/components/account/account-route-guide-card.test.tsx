import { describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { AccountRouteGuideCard } from '@/components/account/account-route-guide-card';
import { render, screen } from '@tests/setup/test-utils';

describe('AccountRouteGuideCard', () => {
  it('explains explicit two-account usage while tokens stay isolated', async () => {
    await i18n.changeLanguage('en');

    render(
      <AccountRouteGuideCard
        totalAccounts={2}
        isolatedCount={2}
        sharedPeerGroups={[]}
        deeperReadyGroups={[]}
      />
    );

    expect(screen.getByText('Recommended two-account route')).toBeInTheDocument();
    expect(screen.getByText('isolated ready')).toBeInTheDocument();
    expect(screen.getByText('Tokens stay separate')).toBeInTheDocument();
    expect(screen.getByText('Settings follow root')).toBeInTheDocument();
    expect(screen.getByText('ccs auth create work')).toBeInTheDocument();
    expect(screen.getByText('ccs auth create personal')).toBeInTheDocument();
    expect(screen.getByText('ccs work')).toBeInTheDocument();
    expect(screen.getByText('ccs personal')).toBeInTheDocument();
  });

  it('uses the active deeper-ready group in optional sync guidance', async () => {
    await i18n.changeLanguage('en');

    render(
      <AccountRouteGuideCard
        totalAccounts={2}
        isolatedCount={0}
        sharedPeerGroups={['sprint-a']}
        deeperReadyGroups={['sprint-a']}
      />
    );

    expect(screen.getByText('deeper sync ready')).toBeInTheDocument();
    expect(
      screen.getByText(
        'ccs auth create work2 --share-context --context-group sprint-a --deeper-continuity'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use the same group, such as "sprint-a", on both accounts when you want them to share local history.'
      )
    ).toBeInTheDocument();
  });
});
