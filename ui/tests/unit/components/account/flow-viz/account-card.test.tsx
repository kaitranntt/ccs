import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@tests/setup/test-utils';
import { AccountCard } from '@/components/account/flow-viz/account-card';
import type { AccountData } from '@/components/account/flow-viz/types';
import type { CodexQuotaResult } from '@/lib/api-client';
import { useAccountQuota, useAccountQuotas } from '@/hooks/use-cliproxy-stats';

vi.mock('@/hooks/use-cliproxy-stats', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-cliproxy-stats')>(
    '@/hooks/use-cliproxy-stats'
  );

  return {
    ...actual,
    useAccountQuota: vi.fn(),
    useAccountQuotas: vi.fn(),
  };
});

const mockedUseAccountQuota = vi.mocked(useAccountQuota);
const mockedUseAccountQuotas = vi.mocked(useAccountQuotas);

function makeCodexQuota(
  planType: 'free' | 'plus' | 'pro' | 'team',
  fiveHour: number,
  weekly: number
) {
  return {
    success: true,
    planType,
    lastUpdated: Date.now(),
    windows: [
      {
        label: 'Primary',
        usedPercent: 100 - fiveHour,
        remainingPercent: fiveHour,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-04-04T08:44:00Z',
      },
      {
        label: 'Secondary',
        usedPercent: 100 - weekly,
        remainingPercent: weekly,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-04-08T10:20:00Z',
      },
    ],
    coreUsage: {
      fiveHour: {
        label: 'Primary',
        remainingPercent: fiveHour,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-04-04T08:44:00Z',
      },
      weekly: {
        label: 'Secondary',
        remainingPercent: weekly,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-04-08T10:20:00Z',
      },
    },
  } satisfies CodexQuotaResult;
}

const groupedAccount: AccountData = {
  id: 'codex:user@example.com',
  email: 'user@example.com',
  tokenFile: 'codex-user.json',
  provider: 'codex',
  successCount: 9,
  failureCount: 1,
  color: '#1e6091',
  variants: [
    {
      id: 'business@example.com',
      email: 'user@example.com',
      tokenFile: 'codex-business.json',
      isDefault: false,
      successCount: 5,
      failureCount: 0,
      audience: 'business',
      audienceLabel: 'Business',
      detailLabel: 'Workspace 04a0f049',
      compactDetailLabel: '04a0f049',
      inlineLabel: 'Business · Workspace 04a0f049',
    },
    {
      id: 'personal@example.com',
      email: 'user@example.com',
      tokenFile: 'codex-personal.json',
      isDefault: true,
      successCount: 4,
      failureCount: 1,
      audience: 'free',
      audienceLabel: 'Free',
      detailLabel: null,
      compactDetailLabel: null,
      inlineLabel: 'Free',
    },
  ],
};

const groupedAccountWithProPersonal: AccountData = {
  ...groupedAccount,
  variants: groupedAccount.variants?.map((variant) =>
    variant.audience === 'free'
      ? {
          ...variant,
          audience: 'personal',
          audienceLabel: 'Personal',
          detailLabel: 'Pro',
          compactDetailLabel: 'Pro',
          inlineLabel: 'Personal · Pro',
        }
      : variant
  ),
};

describe('AccountCard grouped quota tooltip', () => {
  beforeEach(() => {
    mockedUseAccountQuota.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useAccountQuota>);

    mockedUseAccountQuotas.mockReturnValue([
      {
        data: makeCodexQuota('team', 95, 81),
        isLoading: false,
      },
      {
        data: makeCodexQuota('free', 64, 42),
        isLoading: false,
      },
    ] as ReturnType<typeof useAccountQuotas>);
  });

  it('separates same-email Claude nicknames from hashes and controls while keeping exact quota and pause IDs', async () => {
    const onPauseToggle = vi.fn();
    const accounts: AccountData[] = [
      {
        id: 'shared@example.com#a1b2c3d4',
        email: 'shared@example.com',
        nickname: 'educup-primary',
        provider: 'claude',
        color: '#1e6091',
        successCount: 2,
        failureCount: 0,
        isDefault: true,
      },
      {
        id: 'shared@example.com#e5f6a7b8',
        email: 'shared@example.com',
        nickname: 'educup-dev',
        provider: 'claude',
        color: '#1e6091',
        successCount: 1,
        failureCount: 0,
        paused: true,
      },
    ];
    const cards = (privacyMode: boolean) => (
      <>
        {accounts.map((account, index) => (
          <AccountCard
            key={account.id}
            account={account}
            zone="left"
            originalIndex={index}
            isHovered={false}
            isDragging={false}
            offset={{ x: 0, y: 0 }}
            showDetails={false}
            privacyMode={privacyMode}
            onMouseEnter={vi.fn()}
            onMouseLeave={vi.fn()}
            onPointerDown={vi.fn()}
            onPointerMove={vi.fn()}
            onPointerUp={vi.fn()}
            onPauseToggle={onPauseToggle}
          />
        ))}
      </>
    );
    const { container, rerender } = render(cards(false));

    for (const account of accounts) {
      const label = screen.getByText(account.nickname ?? '');
      const card = label.closest('[data-account-index]');
      if (!(card instanceof HTMLElement)) throw new Error('Expected a monitor account card');
      const details = within(card).getByText(`shared@example.com (${account.id.split('#')[1]})`);
      const pause = within(card).getByRole('button');
      expect(card).toHaveClass('w-44');
      expect(label).toHaveClass('whitespace-normal', 'wrap-anywhere');
      expect(label).not.toHaveClass('truncate');
      expect(label.parentElement?.parentElement).toContainElement(details);
      expect(label.parentElement?.parentElement).not.toContainElement(pause);
      expect(mockedUseAccountQuota).toHaveBeenCalledWith('claude', account.id, true);
      await userEvent.click(pause);
      expect(onPauseToggle).toHaveBeenLastCalledWith([account.id], !account.paused);
    }

    expect(onPauseToggle).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    rerender(cards(true));
    for (const account of accounts) {
      expect(screen.getByText(account.nickname ?? '')).toHaveClass('blur-[4px]');
      expect(screen.getByText(`shared@example.com (${account.id.split('#')[1]})`)).toHaveClass(
        'blur-[4px]'
      );
    }
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('retains long Claude nicknames as wrapping text rather than a truncated title', () => {
    const nickname = 'educup-production-with-a-very-long-saved-nickname';
    render(
      <AccountCard
        account={{
          ...groupedAccount,
          id: 'shared@example.com#a1b2c3d4',
          email: 'shared@example.com',
          nickname,
          provider: 'claude',
          variants: undefined,
        }}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode={false}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
      />
    );

    // This asserts markup/classes only; browser verification owns the 176px layout.
    const label = screen.getByText(nickname);
    expect(label).toHaveClass('w-full', 'whitespace-normal', 'wrap-anywhere', 'leading-snug');
    expect(label).not.toHaveClass('truncate');
    expect(label.parentElement?.children).toHaveLength(1);
    expect(label.parentElement).not.toContainElement(
      screen.getByText('shared@example.com (a1b2c3d4)')
    );
  });

  it('renders a single nickname and keeps quota and pause actions keyed by the original ID', async () => {
    const onPauseToggle = vi.fn();
    const account = {
      ...groupedAccount,
      id: 'user@example.com#free',
      nickname: 'Personal',
      variants: undefined,
    };
    render(
      <AccountCard
        account={account}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode={false}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        onPauseToggle={onPauseToggle}
      />
    );
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('user@example.com (Free)')).toBeInTheDocument();
    expect(mockedUseAccountQuota).toHaveBeenCalledWith('codex', account.id, true);
    await userEvent.click(screen.getByRole('button'));
    expect(onPauseToggle).toHaveBeenCalledWith([account.id], true);
  });

  it('renders each grouped nickname and masks the labels in privacy mode', () => {
    const account = {
      ...groupedAccount,
      variants: groupedAccount.variants?.map((variant, index) => ({
        ...variant,
        nickname: index === 0 ? 'Work' : 'Personal',
      })),
    };
    const { container } = render(
      <AccountCard
        account={account}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
      />
    );
    for (const nickname of ['Work', 'Personal']) {
      expect(screen.getByText(nickname).parentElement).toHaveClass('blur-[4px]');
    }
    expect(screen.getByText('user@example.com')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Biz').parentElement).toHaveClass('blur-[4px]');
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('keeps grouped Codex account labels distinct and shows quota tooltips for each variant', async () => {
    render(
      <AccountCard
        account={groupedAccount}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode={false}
        onMouseEnter={() => undefined}
        onMouseLeave={() => undefined}
        onPointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
      />
    );

    expect(screen.getByTitle('Business • Free')).toBeInTheDocument();
    expect(screen.getByText('Biz')).toBeInTheDocument();

    await userEvent.hover(screen.getByText('Business'));
    const businessPlan = (await screen.findAllByText('Plan: team')).find((node) =>
      node.closest('[data-slot="tooltip-content"]')
    );
    expect(businessPlan).toBeInTheDocument();
    expect(screen.getAllByText('5h usage limit').length).toBeGreaterThan(0);
    const tooltipContent = businessPlan.closest('[data-slot="tooltip-content"]');
    expect(tooltipContent?.className).toContain('bg-popover');
    expect(tooltipContent?.className).toContain('text-popover-foreground');
    expect(tooltipContent?.className).toContain('max-w-[calc(100vw-2rem)]');

    const freeLabels = screen.getAllByText('Free');
    const quotaLabel = freeLabels[freeLabels.length - 1];
    expect(quotaLabel).toBeDefined();
    if (!quotaLabel) {
      throw new Error('Expected a Free quota label');
    }

    await userEvent.hover(quotaLabel);
    const personalPlan = (await screen.findAllByText('Plan: free')).find((node) =>
      node.closest('[data-slot="tooltip-content"]')
    );
    expect(personalPlan).toBeInTheDocument();
    expect(screen.getAllByText('Weekly usage limit').length).toBeGreaterThan(0);
  });

  it('keeps richer grouped personal detail when quota planType is coarser runtime evidence', () => {
    render(
      <AccountCard
        account={groupedAccountWithProPersonal}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode={false}
        onMouseEnter={() => undefined}
        onMouseLeave={() => undefined}
        onPointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
      />
    );

    expect(screen.getByTitle('Business • Pro')).toBeInTheDocument();
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0);
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });
});
