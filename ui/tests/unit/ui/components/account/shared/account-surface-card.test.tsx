import { render, screen } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
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
