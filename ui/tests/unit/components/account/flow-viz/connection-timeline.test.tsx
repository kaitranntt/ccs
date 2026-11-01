import { describe, expect, it } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';
import { ConnectionTimeline } from '@/components/account/flow-viz/connection-timeline';
import { generateConnectionEvents } from '@/components/account/flow-viz/utils';

const account = {
  id: 'account-id',
  nickname: 'Work',
  email: 'user@example.com',
  provider: 'codex',
  color: '#000',
  successCount: 1,
  failureCount: 0,
};

describe('nickname in flow timeline', () => {
  it('carries the nickname without replacing event or account identities and masks both lines', () => {
    const events = generateConnectionEvents([account]);
    expect(events[0]).toMatchObject({
      id: 'account-id-success-0',
      accountNickname: 'Work',
      accountEmail: 'user@example.com',
    });
    render(<ConnectionTimeline events={events} privacyMode />);
    expect(screen.getByText('Work')).toHaveClass('blur-[4px]');
    expect(screen.getByText('user@example.com')).toHaveClass('blur-[4px]');
  });

  it('continues to show the email fallback for accounts without nicknames', () => {
    const events = generateConnectionEvents([{ ...account, nickname: '  ' }]);
    render(<ConnectionTimeline events={events} privacyMode={false} />);
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });
});
