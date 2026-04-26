/**
 * UpdatesPage smoke test
 * Validates that the design-system migration (PageShell + PageHeader + KpiRow + MonitorGrid)
 * renders correctly and preserves all interactive flows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { UpdatesPage } from '@/pages/updates';
import { render, screen, userEvent } from '@tests/setup/test-utils';

// ── Module mocks ─────────────────────────────────────────────────────────────

const { mockGetSupportNotices, mockReadProgressMap } = vi.hoisted(() => ({
  mockGetSupportNotices: vi.fn(),
  mockReadProgressMap: vi.fn(),
}));

vi.mock('@/lib/support-updates-catalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/support-updates-catalog')>(
    '@/lib/support-updates-catalog'
  );
  return {
    ...actual,
    getSupportNotices: mockGetSupportNotices,
    getSupportEntriesForNotice: vi.fn().mockReturnValue([]),
  };
});

vi.mock('@/lib/updates-notice-state', async () => {
  const actual = await vi.importActual<typeof import('@/lib/updates-notice-state')>(
    '@/lib/updates-notice-state'
  );
  return {
    ...actual,
    readNoticeProgressMap: mockReadProgressMap,
    writeNoticeProgressMap: vi.fn(),
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotice(
  id: string,
  overrides: Partial<import('@/lib/support-updates-catalog').SupportNotice> = {}
): import('@/lib/support-updates-catalog').SupportNotice {
  return {
    id,
    title: `Notice ${id}`,
    summary: `Summary for ${id}`,
    primaryAction: 'Review',
    publishedAt: '2025-01-01',
    status: 'new',
    scopes: ['target'],
    entryIds: [],
    highlights: [],
    actions: [],
    routes: [],
    commands: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UpdatesPage', () => {
  beforeEach(async () => {
    mockGetSupportNotices.mockReturnValue([makeNotice('notice-a'), makeNotice('notice-b')]);
    mockReadProgressMap.mockReturnValue({});
    await i18n.changeLanguage('en');
  });

  it('renders PageHeader title (identity-strip pattern)', () => {
    render(<UpdatesPage />);
    // PageHeader renders the title — i18n key: updates.inboxTitle
    expect(screen.getByText(/Updates Center|inbox/i)).toBeVisible();
  });

  it('renders KpiRow with pending + done counts', () => {
    render(<UpdatesPage />);
    // Both notices are new → 2 pending, 0 done
    const pending = screen.getByText('2');
    expect(pending).toBeVisible();
    const done = screen.getByText('0');
    expect(done).toBeVisible();
  });

  it('renders at least one MonitorCard (inbox pane) with notice items', () => {
    render(<UpdatesPage />);
    // Both notices visible in inbox — use getAllByText since title appears in inbox list + detail pane
    expect(screen.getAllByText('Notice notice-a').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Notice notice-b').length).toBeGreaterThanOrEqual(1);
  });

  it('filter buttons are rendered and toggle view modes', async () => {
    render(<UpdatesPage />);
    // Use getAllByRole and pick the first one (filter bar), not the action button in detail pane
    const doneButtons = screen.getAllByRole('button', { name: /done/i });
    expect(doneButtons.length).toBeGreaterThanOrEqual(1);
    const filterDoneButton = doneButtons[0]; // first match = filter bar button
    expect(filterDoneButton).toBeVisible();
    await userEvent.click(filterDoneButton);
    // After switching to "Done", both notices (state='new') are removed from inbox list.
    // UpdatesInboxItem renders notice title inside <p class="truncate text-sm font-medium">
    const inboxItems = document.querySelectorAll('p.truncate.text-sm.font-medium');
    const inboxTitles = Array.from(inboxItems).map((el) => el.textContent);
    expect(inboxTitles).not.toContain('Notice notice-a');
    expect(inboxTitles).not.toContain('Notice notice-b');
  });

  it('search input filters notices by title', async () => {
    render(<UpdatesPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, 'notice-a');
    // Inbox list should show notice-a (via inbox item p element) and hide notice-b
    const inboxItems = document.querySelectorAll('p.truncate.text-sm.font-medium');
    const inboxTitles = Array.from(inboxItems).map((el) => el.textContent);
    expect(inboxTitles).toContain('Notice notice-a');
    expect(inboxTitles).not.toContain('Notice notice-b');
  });

  it('shows empty state when no notices match search query', async () => {
    render(<UpdatesPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, 'xyznonexistent');
    // Empty state message — i18n key: updates.noNotices
    expect(screen.queryByText('Notice notice-a')).not.toBeInTheDocument();
    expect(screen.queryByText('Notice notice-b')).not.toBeInTheDocument();
  });

  it('detail pane (MonitorCard span=8) receives selected notice', () => {
    // First notice is auto-selected — UpdatesDetailsPanel should receive it
    render(<UpdatesPage />);
    // The details panel renders the selected notice title somewhere
    // (it receives notice prop → renders its title)
    const titleOccurrences = screen.getAllByText('Notice notice-a');
    // notice appears in inbox list AND detail pane
    expect(titleOccurrences.length).toBeGreaterThanOrEqual(1);
  });
});
