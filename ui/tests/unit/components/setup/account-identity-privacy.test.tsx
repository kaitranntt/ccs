import { render, screen } from '@tests/setup/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AccountStep } from '@/components/setup/wizard/steps/account-step';
import { VariantStep } from '@/components/setup/wizard/steps/variant-step';
import type { OAuthAccount } from '@/lib/api-client';

const businessAccount: OAuthAccount = {
  id: 'victim@example.com#04a0f049-team',
  email: 'victim@example.com',
  provider: 'gemini',
  isDefault: false,
  tokenFile: 'gemini-victim@example.com-04a0f049-team.json',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('setup account identity privacy', () => {
  it('masks a saved nickname and its secondary identity in the account selector', () => {
    render(
      <AccountStep
        accounts={[{ ...businessAccount, nickname: 'Work' }]}
        privacyMode
        onSelect={vi.fn()}
        onAddNew={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText('Work')).toHaveClass('blur-[4px]');
    expect(screen.getByText('victim@example.com (Business · Workspace 04a0f049)')).toHaveClass(
      'blur-[4px]'
    );
  });
  it('blurs account metadata badges in the account selection step', () => {
    render(
      <AccountStep
        accounts={[businessAccount]}
        privacyMode={true}
        onSelect={vi.fn()}
        onAddNew={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('victim@example.com')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Business')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Workspace 04a0f049')).toHaveClass('blur-[4px]');
  });

  it('blurs account metadata badges in the variant step', () => {
    render(
      <VariantStep
        selectedProvider="gemini"
        catalog={{ models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }] }}
        selectedAccount={businessAccount}
        variantName="gemini"
        modelName="gemini-2.5-pro"
        isPending={false}
        privacyMode={true}
        onVariantNameChange={vi.fn()}
        onModelChange={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onCreate={vi.fn()}
      />
    );

    expect(screen.getByText('victim@example.com')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Business')).toHaveClass('blur-[4px]');
    expect(screen.getByText('Workspace 04a0f049')).toHaveClass('blur-[4px]');
  });
});
