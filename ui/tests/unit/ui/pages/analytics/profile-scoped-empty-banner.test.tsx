import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileScopedEmptyBanner } from '@/pages/analytics/components/profile-scoped-empty-banner';

describe('ProfileScopedEmptyBanner', () => {
  it('shows the selected profile label and explains the gap', () => {
    render(<ProfileScopedEmptyBanner selectedProfileLabel="Default Claude" onShowAll={() => {}} />);

    expect(screen.getByTestId('profile-scoped-empty-banner')).toBeInTheDocument();
    expect(screen.getByText(/Default Claude/)).toBeInTheDocument();
    expect(screen.getByText(/CLIProxy and native runtime/i)).toBeInTheDocument();
  });

  it('invokes onShowAll when the CTA is clicked', () => {
    const onShowAll = vi.fn();
    render(<ProfileScopedEmptyBanner selectedProfileLabel="work" onShowAll={onShowAll} />);

    fireEvent.click(screen.getByTestId('profile-scoped-empty-banner-show-all'));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
