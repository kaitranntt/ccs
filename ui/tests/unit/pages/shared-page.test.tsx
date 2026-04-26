/**
 * Unit tests for the migrated SharedPage design-system layout.
 *
 * Covers:
 * - PageHeader renders with title + subtitle
 * - SharedTabNav: tab switching between commands / skills / agents
 * - SharedItemList: search/filter, item selection, error state, empty state
 * - SharedItemViewer: metadata strip, markdown content, content error state
 * - SharedMarkdownViewer: headings, lists, code blocks, frontmatter
 * - Network error → offline guidance
 * - Symlink warning banner
 * - Summary error (non-blocking) alert + retry
 *
 * jsdom stubs: matchMedia, IntersectionObserver (for ConfigLayout + SectionRail).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import { SharedPage } from '@/pages/shared';

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('1024'), // treat desktop as true for ≥1024px query
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class StubIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_cb: IntersectionObserverCallback) {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: StubIntersectionObserver,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Minimal valid summary object. */
const okSummary = {
  commands: 1,
  skills: 2,
  agents: 1,
  total: 4,
  symlinkStatus: { valid: true, message: 'Symlinks active' },
};

/** One command item fixture. */
const commandItem = {
  name: 'engineer/review',
  description: 'Review the latest PR changes.',
  path: '/tmp/commands/engineer/review.md',
  type: 'command' as const,
};

/** One skill item fixture. */
const skillItem = {
  name: 'cook',
  description: 'Cooking skill for plan execution.',
  path: '/tmp/skills/cook.md',
  type: 'skill' as const,
};

/** Full content payload for commandItem. */
const commandContent = {
  content:
    '---\nauthor: kai\n---\n# Review\n\nFull **review** workflow.\n\n- step one\n- step two\n\n```bash\ngit diff\n```',
  contentPath: '/tmp/commands/engineer/review.md',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SharedPage (design-system migration)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  // ── PageHeader ─────────────────────────────────────────────────────────────

  describe('PageHeader', () => {
    it('renders page title and subtitle', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('Shared Data')).toBeInTheDocument();
      expect(
        screen.getByText('Commands, skills, and agents shared across Claude instances')
      ).toBeInTheDocument();
    });
  });

  // ── SharedTabNav ───────────────────────────────────────────────────────────

  describe('SharedTabNav', () => {
    it('renders all three tabs with counts from summary', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Tabs rendered as role="tab" elements
      expect(await screen.findByRole('tab', { name: /Commands/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Skills/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Agents/ })).toBeInTheDocument();
    });

    it('switches to skills tab and fetches skills', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.endsWith('/api/shared/skills')) return jsonResponse({ items: [skillItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({ content: '# Cook\n\nCooking steps.', contentPath: skillItem.path });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Wait for initial render
      await screen.findByText('Shared Data');

      // Click Skills tab
      const skillsTab = await screen.findByRole('tab', { name: /Skills/ });
      await userEvent.click(skillsTab);

      // Skills list should appear (name appears multiple times — at least once)
      expect((await screen.findAllByText('cook')).length).toBeGreaterThan(0);
    });

    it('shows metric cards: total shared, active tab count, visible count', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary'))
          return jsonResponse({ ...okSummary, commands: 3, skills: 5, agents: 2, total: 10 });
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Total shared from sum of all tabs
      expect(await screen.findByText('10')).toBeInTheDocument();
    });
  });

  // ── SharedItemList ─────────────────────────────────────────────────────────

  describe('SharedItemList', () => {
    it('renders item name, description, and path in list', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Item name appears in both list row and viewer header — assert at least one
      expect((await screen.findAllByText('engineer/review')).length).toBeGreaterThan(0);
      // Description appears only in list row
      expect(screen.getByText('Review the latest PR changes.')).toBeInTheDocument();
      // Path appears in list row (mono) and in viewer metadata strip
      expect(screen.getAllByText('/tmp/commands/engineer/review.md').length).toBeGreaterThan(0);
    });

    it('filters items by search query', async () => {
      const items = [
        commandItem,
        {
          ...commandItem,
          name: 'doctor/check',
          description: 'Run health check.',
          path: '/tmp/commands/doctor/check.md',
        },
      ];

      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({ content: '# Item', contentPath: items[0].path });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Wait for both items to load
      await screen.findAllByText('engineer/review');

      const searchInput = screen.getByRole('textbox', {
        name: /Filter commands/,
      });
      await userEvent.type(searchInput, 'doctor');

      // doctor/check should appear in list; engineer/review should be absent from list
      expect(await screen.findByText('Run health check.')).toBeInTheDocument();
      // engineer/review description no longer visible after filter
      expect(screen.queryByText('Review the latest PR changes.')).not.toBeInTheDocument();
    });

    it('shows no-match message when filter has no results', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);
      // Wait for item description (unique to list row, not viewer)
      await screen.findByText('Review the latest PR changes.');

      const searchInput = screen.getByRole('textbox', { name: /Filter commands/ });
      await userEvent.type(searchInput, 'zzz-no-match');

      expect(await screen.findByText(/No commands match/)).toBeInTheDocument();
    });

    it('shows error state with retry button when fetch fails', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands'))
          return jsonResponse({ error: 'Backend unavailable' }, 500);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('Failed to load shared commands')).toBeInTheDocument();
      expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('shows empty state when no items exist for the tab', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse({ ...okSummary, commands: 0 });
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [] });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText(/No shared commands found/)).toBeInTheDocument();
    });
  });

  // ── SharedItemViewer ───────────────────────────────────────────────────────

  describe('SharedItemViewer', () => {
    it('renders item name, type badge, and path metadata', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Item name appears in list and viewer header — at least 1
      expect((await screen.findAllByText('engineer/review')).length).toBeGreaterThan(0);
      // Type badge rendered as uppercase text
      expect(screen.getAllByText('command').length).toBeGreaterThan(0);
    });

    it('shows loading indicator while content is fetching', async () => {
      let resolveContent!: (r: Response) => void;
      const contentPromise = new Promise<Response>((res) => {
        resolveContent = res;
      });

      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return contentPromise;
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Wait for item to be visible in list (description is unique to the list row)
      await screen.findByText('Review the latest PR changes.');
      // Content area should show loading state
      expect(await screen.findByText('Loading markdown content...')).toBeInTheDocument();

      // Resolve so the promise doesn't leak after test ends
      resolveContent(jsonResponse(commandContent));
    });

    it('shows content error with retry button', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({ error: 'File not found' }, 404);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('Failed to load content')).toBeInTheDocument();
      expect(screen.getByText('File not found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry content' })).toBeInTheDocument();
    });

    it('renders markdown content after loading', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Markdown heading
      expect(await screen.findByText('Review')).toBeInTheDocument();
      // Markdown paragraph text fragment
      expect(await screen.findByText(/Full/)).toBeInTheDocument();
    });

    it('renders select-one placeholder when no item is selected in an empty list', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse({ ...okSummary, commands: 0 });
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [] });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Wait for data and confirm placeholder
      await waitFor(() => {
        expect(screen.getByText(/Select a command to view full content/)).toBeInTheDocument();
      });
    });
  });

  // ── SharedMarkdownViewer (via content render path) ─────────────────────────

  describe('SharedMarkdownViewer (inline rendering)', () => {
    it('renders frontmatter fields', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({
            content: '---\nauthor: kai\nversion: 1.0\n---\n# Heading',
            contentPath: commandItem.path,
          });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('kai')).toBeInTheDocument();
      expect(screen.getByText('1.0')).toBeInTheDocument();
    });

    it('renders unordered list items', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({
            content: '- alpha\n- beta\n- gamma',
            contentPath: commandItem.path,
          });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('beta')).toBeInTheDocument();
      expect(screen.getByText('gamma')).toBeInTheDocument();
    });

    it('renders ordered list items', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({
            content: '1. first\n2. second\n3. third',
            contentPath: commandItem.path,
          });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('first')).toBeInTheDocument();
      expect(screen.getByText('second')).toBeInTheDocument();
      expect(screen.getByText('third')).toBeInTheDocument();
    });

    it('renders fenced code block with language label', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({
            content: '```bash\ngit diff --stat\n```',
            contentPath: commandItem.path,
          });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('bash')).toBeInTheDocument();
      expect(screen.getByText('git diff --stat')).toBeInTheDocument();
    });

    it('shows no-markdown placeholder for empty content', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary')) return jsonResponse(okSummary);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?'))
          return jsonResponse({ content: '', contentPath: commandItem.path });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('No markdown content available.')).toBeInTheDocument();
    });
  });

  // ── Network / offline ──────────────────────────────────────────────────────

  describe('network error handling', () => {
    it('shows offline guidance when all fetches fail with network error', async () => {
      fetchMock.mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });

      render(<SharedPage />);

      expect(await screen.findByText('Counts unavailable')).toBeInTheDocument();
      expect(
        screen.getAllByText(
          'Connection to dashboard server lost or restarting. Keep `ccs config` running, then retry.'
        ).length
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Retry counts' })).toBeInTheDocument();
    });
  });

  // ── Symlink warning ────────────────────────────────────────────────────────

  describe('symlink warning', () => {
    it('shows configuration-required alert when symlinkStatus.valid is false', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary'))
          return jsonResponse({
            ...okSummary,
            symlinkStatus: { valid: false, message: 'Symlinks not configured' },
          });
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [] });
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      expect(await screen.findByText('Configuration Required')).toBeInTheDocument();
      expect(screen.getByText(/Symlinks not configured/)).toBeInTheDocument();
    });
  });

  // ── Summary error (non-blocking) ───────────────────────────────────────────

  describe('summary error (non-blocking)', () => {
    it('shows summary error alert + retry-counts button while items still load', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/shared/summary'))
          return jsonResponse({ error: 'stats unavailable' }, 500);
        if (url.endsWith('/api/shared/commands')) return jsonResponse({ items: [commandItem] });
        if (url.includes('/api/shared/content?')) return jsonResponse(commandContent);
        return jsonResponse({ items: [] });
      });

      render(<SharedPage />);

      // Items still render (description is unique to the list row)
      expect(await screen.findByText('Review the latest PR changes.')).toBeInTheDocument();
      // Non-blocking alert shown
      expect(screen.getByText('Counts unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry counts' })).toBeInTheDocument();
    });
  });
});
