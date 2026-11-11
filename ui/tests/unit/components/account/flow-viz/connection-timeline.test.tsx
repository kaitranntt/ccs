import { describe, expect, it } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';
import { ConnectionTimeline } from '@/components/account/flow-viz/connection-timeline';
import { buildConnectionEvents } from '@/components/account/flow-viz/utils';

const account = {
  id: 'account-id',
  nickname: 'Work',
  email: 'user@example.com',
  provider: 'codex',
  color: '#000',
  successCount: 1,
  failureCount: 0,
};

const request = {
  accountKey: 'codex:account-id',
  timestamp: '2026-03-26T10:00:00.000Z',
  failed: false,
};

describe('nickname in flow timeline', () => {
  it('carries the nickname without replacing event or account identities and masks both lines', () => {
    const events = buildConnectionEvents([request], [account]);
    expect(events[0]).toMatchObject({
      id: 'codex:account-id-2026-03-26T10:00:00.000Z-0',
      accountNickname: 'Work',
      accountEmail: 'user@example.com',
    });
    render(<ConnectionTimeline events={events} privacyMode />);
    expect(screen.getByText('Work')).toHaveClass('blur-[4px]');
    expect(screen.getByText('user@example.com')).toHaveClass('blur-[4px]');
  });

  it('continues to show the email fallback for accounts without nicknames', () => {
    const events = buildConnectionEvents([request], [{ ...account, nickname: '  ' }]);
    render(<ConnectionTimeline events={events} privacyMode={false} />);
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });
});
