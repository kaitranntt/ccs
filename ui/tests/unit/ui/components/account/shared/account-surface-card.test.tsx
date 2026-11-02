import { render, screen, userEvent } from '@tests/setup/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AccountSurfaceCard } from '@/components/account/shared/account-surface-card';
import type { CodexQuotaResult, GeminiCliQuotaResult } from '@/lib/api-client';

function createGeminiQuotaResult(
  overrides: Partial<GeminiCliQuotaResult> = {}
): GeminiCliQuotaResult {
  return {
    success: true,
    buckets: [],
    projectId: 'project-123',
    tierLabel: 'Pro',
    tierId: 'g1-pro-tier',
    creditBalance: 12,
    entitlement: {
      normalizedTier: 'pro',
      rawTierId: 'g1-pro-tier',
      rawTierLabel: 'Pro',
      source: 'runtime_api',
      confidence: 'high',
      accessState: 'entitled',
      capacityState: 'available',
      lastVerifiedAt: Date.now(),
      notes: null,
    },
    lastUpdated: Date.now(),
    ...overrides,
  };
}

function createCodexQuotaResult(overrides: Partial<CodexQuotaResult> = {}): CodexQuotaResult {
  return {
    success: true,
    windows: [],
    planType: 'free',
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('AccountSurfaceCard', () => {
  it.each(['educup-primary', 'educup-dev', 'educup-production-with-a-very-long-saved-nickname'])(
    'gives the compact nickname %s its own wrapping row above identity details and actions',
    async (nickname) => {
      const accountId = 'shared@example.com#a1b2c3d4';
      const onReauth = vi.fn();
      render(
        <AccountSurfaceCard
          mode="compact"
          provider="claude"
          accountId={accountId}
          email="shared@example.com"
          nickname={nickname}
          paused
          headerEnd={<button onClick={() => onReauth(accountId)}>Reauthenticate</button>}
        />
      );

      const label = screen.getByText(nickname);
      const details = screen.getByText('shared@example.com (a1b2c3d4)');
      const action = screen.getByRole('button', { name: 'Reauthenticate' });
      const identityColumn = label.parentElement?.parentElement;
      // JSDOM verifies the wrapping contract and separation, not pixel layout at 176px.
      expect(label).toHaveClass('w-full', 'whitespace-normal', 'wrap-anywhere', 'leading-snug');
      expect(label).not.toHaveClass('truncate');
      expect(label.parentElement?.children).toHaveLength(1);
      expect(identityColumn).toContainElement(details);
      expect(identityColumn).not.toContainElement(action);
      expect(identityColumn).not.toContainElement(screen.getByText('Paused'));
      expect(details).toHaveAttribute('title', 'shared@example.com (a1b2c3d4)');
      expect(details).toHaveClass('wrap-anywhere');
      expect(screen.queryByText('a1b2c3d4', { exact: true })).not.toBeInTheDocument();

      await userEvent.click(action);
      expect(onReauth).toHaveBeenCalledExactlyOnceWith(accountId);
    }
  );

  it('keeps workspace disambiguation in a secondary line when no nickname is saved', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="claude"
        accountId="shared@example.com#a1b2c3d4-team"
        email="shared@example.com"
      />
    );

    const email = screen.getByText('shared@example.com');
    const workspace = screen.getByText('a1b2c3d4');
    const audience = screen.getByText('Biz');
    expect(email.parentElement).not.toContainElement(workspace);
    expect(email.parentElement?.parentElement).toContainElement(workspace);
    expect(email.parentElement?.parentElement).not.toContainElement(audience);
    expect(workspace).toHaveClass('text-muted-foreground', 'wrap-anywhere');
    expect(workspace).toHaveAttribute('title', 'Workspace a1b2c3d4');
  });

  it.each(['compact', 'detailed'] as const)(
    'masks saved Claude nicknames, email and hash details without sensitive hover titles in %s mode',
    (mode) => {
      const { container } = render(
        <AccountSurfaceCard
          mode={mode}
          provider="claude"
          accountId="shared@example.com#a1b2c3d4-team"
          email="shared@example.com"
          nickname="educup-primary"
          privacyMode
          isDefault
          paused
        />
      );

      expect(screen.getByText('educup-primary')).toHaveClass('blur-[4px]');
      expect(screen.getByText('shared@example.com (Business · Workspace a1b2c3d4)')).toHaveClass(
        'blur-[4px]'
      );
      expect(screen.getByText(mode === 'compact' ? 'Biz' : 'Business')).toHaveClass('blur-[4px]');
      expect(screen.getByText('Paused')).toBeInTheDocument();
      if (mode === 'detailed') {
        expect(screen.getByText('Workspace a1b2c3d4')).toHaveClass('blur-[4px]');
        expect(screen.getByText('Default')).toBeInTheDocument();
      }
      expect(container.querySelector('[title]')).toBeNull();
    }
  );

  it.each(['compact', 'detailed'] as const)(
    'shows the nickname first in %s mode and masks both identity lines',
    (mode) => {
      const card = (privacyMode: boolean) => (
        <AccountSurfaceCard
          mode={mode}
          provider="codex"
          accountId="user@example.com#free"
          email="user@example.com"
          nickname="Personal"
          privacyMode={privacyMode}
          showQuota={false}
        />
      );
      const { rerender, container } = render(card(false));
      const nickname = screen.getByText('Personal');
      const secondary = screen.getByText('user@example.com (Free)');
      expect(
        nickname.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(nickname).toHaveAttribute('title', 'Personal');
      rerender(card(true));
      expect(screen.getByText('Personal')).toHaveClass('blur-[4px]');
      expect(screen.getByText('user@example.com (Free)')).toHaveClass('blur-[4px]');
      expect(container.querySelector('[title]')).toBeNull();
    }
  );

  it('prefers live quota entitlement tier over a stale account tier for Gemini badges', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="gemini"
        accountId="user@example.com"
        email="user@example.com"
        displayEmail="user@example.com"
        tier="unknown"
        quota={createGeminiQuotaResult()}
        showQuota={false}
      />
    );

    expect(screen.getByText('pro')).toBeInTheDocument();
  });

  it('shows free Codex accounts as a single standalone audience badge', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="codex"
        accountId="user@example.com#free"
        email="user@example.com"
        displayEmail="user@example.com"
        tokenFile="codex-user@example.com-free.json"
        showQuota={false}
      />
    );

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByTitle('Free')).toBeInTheDocument();
    expect(screen.queryByText('Pers')).not.toBeInTheDocument();
  });

  it('keeps token-derived personal detail when live quota planType is coarser', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="codex"
        accountId="user@example.com#pro"
        email="user@example.com"
        displayEmail="user@example.com"
        tokenFile="codex-user@example.com-pro.json"
        quota={createCodexQuotaResult({ planType: 'free' })}
        showQuota={false}
      />
    );

    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
    expect(screen.queryByText('Pers')).not.toBeInTheDocument();
  });

  it('falls back to a single free badge when Codex quota detects a free plan', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="codex"
        accountId="user@example.com"
        email="user@example.com"
        displayEmail="user@example.com"
        quota={createCodexQuotaResult({ planType: 'free' })}
        showQuota={false}
      />
    );

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByText('Pers')).not.toBeInTheDocument();
  });

  it('falls back to plus or pro detail when Codex quota exposes a paid plan', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="codex"
        accountId="user@example.com"
        email="user@example.com"
        displayEmail="user@example.com"
        quota={createCodexQuotaResult({ planType: 'pro' })}
        showQuota={false}
      />
    );

    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.queryByText('Pers')).not.toBeInTheDocument();
  });

  it('lets live paid Codex plans override stale free identity badges', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="codex"
        accountId="user@example.com#free"
        email="user@example.com"
        displayEmail="user@example.com"
        tokenFile="codex-user@example.com-free.json"
        quota={createCodexQuotaResult({ planType: 'plus' })}
        showQuota={false}
      />
    );

    expect(screen.getByText('Plus')).toBeInTheDocument();
    expect(screen.queryByText('Pers')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Free')).not.toBeInTheDocument();
  });

  it('blurs detailed account identity metadata when privacy mode is enabled', () => {
    render(
      <AccountSurfaceCard
        mode="detailed"
        provider="gemini"
        accountId="victim@example.com#04a0f049-team"
        email="victim@example.com"
        displayEmail="victim@example.com"
        tokenFile="gemini-victim@example.com-04a0f049-team.json"
        privacyMode={true}
        showQuota={false}
      />
    );

    expect(screen.getByText('victim@example.com')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Business')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Workspace 04a0f049')).toHaveClass('blur-[4px]');
  });

  it('blurs compact account identity metadata when privacy mode is enabled', () => {
    render(
      <AccountSurfaceCard
        mode="compact"
        provider="gemini"
        accountId="victim@example.com#04a0f049-team"
        email="victim@example.com"
        displayEmail="victim@example.com"
        tokenFile="gemini-victim@example.com-04a0f049-team.json"
        privacyMode={true}
        showQuota={false}
      />
    );

    expect(screen.getByText('victim@example.com')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Biz')).toHaveClass('blur-[4px]');
    expect(screen.getByText('04a0f049')).toHaveClass('blur-[4px]');
  });
});
