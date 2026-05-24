import { describe, expect, it } from 'bun:test';
import { bundledServerPath, cpSync, getMockFrame, getMockShadowRoot, getResponseText, join, mkdtempSync, resolveNodeModulesPath, rmSync, runMcpRequests, tmpdir, writeFileSync } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - navigation and query', () => {
  it('works from an installed copy when global WebSocket is unavailable and NODE_PATH supplies package dependencies', async () => {
    const installDir = mkdtempSync(join(tmpdir(), 'ccs-browser-installed-copy-'));
    const installedServerPath = join(installDir, 'ccs-browser-server.cjs');
    const bootstrapServerPath = join(installDir, 'bootstrap.cjs');

    try {
      cpSync(bundledServerPath, installedServerPath);
      writeFileSync(
        bootstrapServerPath,
        'delete globalThis.WebSocket;\nrequire("./ccs-browser-server.cjs");\n',
        'utf8'
      );

      const responses = await runMcpRequests(
        [{ id: 'page-1', title: 'Installed Copy', currentUrl: 'https://example.com/' }],
        [
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'browser_get_url_and_title', arguments: {} },
          },
        ],
        {
          serverPath: bootstrapServerPath,
          childEnv: {
            NODE_PATH: resolveNodeModulesPath(),
          },
          responseTimeoutMs: 12000,
        }
      );

      const response = responses.find((message) => message.id === 2);
      expect((response?.result as { isError?: boolean }).isError).not.toBe(true);
      expect(getResponseText(response)).toContain('title: Installed Copy');
      expect(getResponseText(response)).toContain('url: https://example.com/');
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  }, 10000);

  it('navigates successfully after readiness polling', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          navigate: {
            'https://example.com/next': {
              finalUrl: 'https://example.com/next',
              readyStates: ['loading', 'interactive'],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/next' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('pageIndex: 0');
    expect(text).toContain('url: https://example.com/next');
    expect(text).toContain('status: navigated');
  });

  it('returns a handled error when navigation readiness times out', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          navigate: {
            'https://example.com/slow': {
              finalUrl: 'https://example.com/',
              readyStates: new Array(60).fill('loading'),
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/slow' },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 2);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: navigation did not complete');
  }, 8000);

  it('returns handled errors for missing URL, malformed URL, invalid page index, and out-of-range page index', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Example Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: { url: 'file:///tmp/example' } },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { pageIndex: 1.5, url: 'https://example.com/next' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { pageIndex: 9, url: 'https://example.com/next' },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'Browser MCP failed: url is required'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'Browser MCP failed: url must be an absolute http or https URL'
    );
    expect(getResponseText(responses.find((message) => message.id === 4))).toContain(
      'Browser MCP failed: pageIndex must be a non-negative integer'
    );
    expect(getResponseText(responses.find((message) => message.id === 5))).toContain(
      'page index 9 is out of range'
    );
  });

  it('surfaces Page.navigate CDP failures as handled errors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/start',
          navigate: {
            'https://example.com/fail': {
              finalUrl: 'https://example.com/start',
              errorText: 'net::ERR_ABORTED',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/fail' },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 2);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: navigation failed for URL: https://example.com/fail: net::ERR_ABORTED'
    );
  });

  it('treats redirects as successful navigation', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/start',
          navigate: {
            'https://example.com/redirect': {
              finalUrl: 'https://example.com/final',
              readyStates: ['loading', 'interactive'],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/redirect' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('status: navigated');
    expect(text).toContain('url: https://example.com/final');
  });

  it('clicks matching elements and reports selector failures', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#submit': {},
            '#disabled': { disabled: true },
            '#throws': { error: 'click exploded' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#submit' } },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#missing' } },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#disabled' } },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#throws' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #submit'
    );

    const selectorMiss = responses.find((message) => message.id === 3);
    expect((selectorMiss?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(selectorMiss)).toContain(
      'element index 0 is out of range for selector: #missing'
    );

    const disabledError = responses.find((message) => message.id === 4);
    expect((disabledError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(disabledError)).toContain('element is disabled for selector: #disabled');

    const pageSideError = responses.find((message) => message.id === 5);
    expect((pageSideError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(pageSideError)).toContain('click exploded');
  });

  it('clicks the requested zero-based match and rejects out-of-range nth', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Click Page',
          currentUrl: 'https://example.com/',
          click: {
            '.menu-item': [{ label: 'first' }, { label: 'second' }],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '.menu-item', nth: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '.menu-item', nth: 3 } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 20))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 20))).toContain('nth: 1');
    expect(getResponseText(responses.find((message) => message.id === 21))).toContain(
      'Browser MCP failed: element index 3 is out of range for selector: .menu-item'
    );
  });

  it('reports detached and hidden click targets as handled errors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#hidden': { hidden: true },
            '#detached': { detached: true },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#hidden' } },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#detached' } },
        },
      ]
    );

    const hiddenError = responses.find((message) => message.id === 2);
    expect((hiddenError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(hiddenError)).toContain(
      'element is hidden or not interactable for selector: #hidden'
    );

    const detachedError = responses.find((message) => message.id === 3);
    expect((detachedError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(detachedError)).toContain('element is detached for selector: #detached');
  });

  it('uses a mouse sequence when the target requires it', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#menu-trigger': { requireMouseSequence: true },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#menu-trigger' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #menu-trigger'
    );
  });

  it('preserves mouse sequence preparation without dispatching a synthetic click event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#click-event': {
              requireMouseSequence: true,
              forbidSyntheticClickEvent: true,
              requireNativeClick: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#click-event' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #click-event'
    );
  });

  it('preserves native click activation after the mouse sequence', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#native-click': {
              requireMouseSequence: true,
              requireNativeClick: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#native-click' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #native-click');
  });

  it('does not force activation when mousedown cancels the interaction', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#cancel-mousedown': {
              requireMouseSequence: true,
              cancelMouseDown: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#cancel-mousedown' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #cancel-mousedown');
  });

  it('rechecks connectivity before native activation after the mouse sequence', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#detached-during-click': {
              requireMouseSequence: true,
              requireNativeClick: true,
              detachAfterMouseDown: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#detached-during-click' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #detached-during-click');
  });

  it('falls back to click when mouse sequence dispatch fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#fallback': { mouseSequenceError: 'mouse dispatch exploded' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#fallback' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #fallback'
    );
  });

  it('clicks with element-relative offsets and richer click options', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Click Page',
          currentUrl: 'https://example.com/',
          click: {
            '#offset-target': {
              requireMouseSequence: true,
              expectedOffset: { x: 12, y: 8 },
              expectedButton: 'right',
              expectedClickCount: 2,
            },
            '#double-left': {
              requireMouseSequence: true,
              expectedButton: 'left',
              expectedClickCount: 2,
              requireDoubleClickEvent: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 70,
          method: 'tools/call',
          params: {
            name: 'browser_click',
            arguments: {
              selector: '#offset-target',
              offsetX: 12,
              offsetY: 8,
              button: 'right',
              clickCount: 2,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 700,
          method: 'tools/call',
          params: {
            name: 'browser_click',
            arguments: {
              selector: '#double-left',
              clickCount: 2,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 70));
    expect(text).toContain('status: clicked');
    expect(text).toContain('offsetX: 12');
    expect(text).toContain('offsetY: 8');
    expect(text).toContain('button: right');
    expect(text).toContain('clickCount: 2');

    const doubleText = getResponseText(responses.find((message) => message.id === 700));
    expect(doubleText).toContain('status: clicked');
    expect(doubleText).toContain('button: left');
    expect(doubleText).toContain('clickCount: 2');
  });

  it('presses a key combination with browser_press_key', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Keyboard Page',
          currentUrl: 'https://example.com/',
          keyboard: {
            expectedKey: 'k',
            expectedModifiers: ['Meta'],
            expectedRepeat: 2,
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 71,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'k',
              modifiers: ['Meta'],
              repeat: 2,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 71));
    expect(text).toContain('status: key-pressed');
    expect(text).toContain('key: k');
    expect(text).toContain('modifiers: Meta');
    expect(text).toContain('repeat: 2');
  });

  it('supports common special keys with browser_press_key', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Special Key Page',
          currentUrl: 'https://example.com/',
          keyboard: {
            expectedKey: 'Enter',
            expectedRepeat: 1,
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 711,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'Enter',
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 711));
    expect(text).toContain('status: key-pressed');
    expect(text).toContain('key: Enter');
  });

  it('rejects unsupported modifiers for browser_press_key', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Invalid Modifier Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 712,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'k',
              modifiers: ['Cmd'],
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 712);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'modifiers must only contain: Alt, Control, Meta, Shift'
    );
  });


  it('rejects excessive clickCount and repeat values', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Limits Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 713,
          method: 'tools/call',
          params: {
            name: 'browser_click',
            arguments: {
              selector: '#submit',
              clickCount: 26,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 714,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'k',
              repeat: 26,
            },
          },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 713);
    expect((clickResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(clickResponse)).toContain('clickCount must be less than or equal to 25');

    const keyResponse = responses.find((message) => message.id === 714);
    expect((keyResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(keyResponse)).toContain('repeat must be less than or equal to 25');
  });

  it('scrolls an element into view with browser_scroll', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Scroll Page',
          currentUrl: 'https://example.com/',
          scroll: {
            '#results': {
              expectedBehavior: 'into-view',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 72,
          method: 'tools/call',
          params: {
            name: 'browser_scroll',
            arguments: {
              selector: '#results',
              behavior: 'into-view',
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 72));
    expect(text).toContain('status: scrolled');
    expect(text).toContain('selector: #results');
    expect(text).toContain('behavior: into-view');
  });

  it('scrolls an iframe page by offset with browser_scroll', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Iframe Scroll Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#preview-frame',
              query: {
                '#preview-frame': {
                  exists: true,
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 73,
          method: 'tools/call',
          params: {
            name: 'browser_scroll',
            arguments: {
              frameSelector: '#preview-frame',
              behavior: 'by-offset',
              deltaX: 5,
              deltaY: 40,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 73));
    expect(text).toContain('status: scrolled');
    expect(text).toContain('behavior: by-offset');
    expect(text).toContain('deltaX: 5');
    expect(text).toContain('deltaY: 40');
  });

  it('requires real mouse movement for hover-only targets and reports hover failures', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Hover Page',
          currentUrl: 'https://example.com/',
          hover: {
            '.draft-card': { requireCdpMouseMove: true },
            '.missing-bounds': { zeroSized: true },
          },
          query: {
            '.draft-card': {
              exists: true,
              connected: true,
              rect: {
                x: 100,
                y: 40,
                width: 120,
                height: 48,
                top: 40,
                right: 220,
                bottom: 88,
                left: 100,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.missing-bounds': {
              exists: true,
              connected: true,
              rect: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_hover',
            arguments: { selector: '.draft-card' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_hover',
            arguments: { selector: '.missing-bounds' },
          },
        },
      ]
    );

    const hoverResponse = responses.find((message) => message.id === 2);
    expect((hoverResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(hoverResponse)).toContain('status: hovered');
    expect(getResponseText(hoverResponse)).toContain('selector: .draft-card');

    const hoverError = responses.find((message) => message.id === 3);
    expect((hoverError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(hoverError)).toContain(
      'element is hidden or not interactable for selector: .missing-bounds'
    );
  });

  it('queries element diagnostics and validates query fields', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              innerText: 'Edit',
              textContent: 'Edit',
              rect: {
                x: 123,
                y: 45,
                width: 48,
                height: 24,
                top: 45,
                right: 171,
                bottom: 69,
                left: 123,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.missing-button': {
              exists: false,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.edit-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.edit-button',
              fields: ['display', 'visibility', 'opacity'],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.missing-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.edit-button', fields: 'display' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.edit-button', fields: ['displayMode'] },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'exists: true'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'boundingClientRect: {"x":123'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'display: block'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).not.toContain(
      'innerText:'
    );

    const missingResponse = responses.find((message) => message.id === 4);
    expect((missingResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(missingResponse)).toContain('exists: false');

    expect(getResponseText(responses.find((message) => message.id === 5))).toContain(
      'Browser MCP failed: fields must be an array of strings'
    );
    expect(getResponseText(responses.find((message) => message.id === 6))).toContain(
      'Browser MCP failed: unknown query field: displayMode'
    );
  });

  it('reports count, nth-aware fields, href, and onclick for multi-match selectors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.hover-action': [
              {
                exists: true,
                connected: true,
                innerText: 'Open',
                textContent: 'Open',
                display: 'block',
                visibility: 'visible',
                opacity: '1',
                href: 'https://example.com/open',
                onclick: 'openCard()',
              },
              {
                exists: true,
                connected: true,
                innerText: 'Archive',
                textContent: 'Archive',
                display: 'block',
                visibility: 'visible',
                opacity: '0.95',
                href: 'https://example.com/archive',
                onclick: 'archiveCard()',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 30,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 1,
              fields: ['count', 'exists', 'innerText', 'href', 'onclick'],
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 30));
    expect(text).toContain('count: 2');
    expect(text).toContain('exists: true');
    expect(text).toContain('innerText: Archive');
    expect(text).toContain('href: https://example.com/archive');
    expect(text).toContain('onclick: archiveCard()');
    expect(text).toContain('nth: 1');
  });

  it('keeps count and exists available when nth is out of range, but rejects target fields', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.hover-action': [
              {
                exists: true,
                connected: true,
                innerText: 'Open',
                textContent: 'Open',
                display: 'block',
                visibility: 'visible',
                opacity: '1',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 31,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 3,
              fields: ['count', 'exists'],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 32,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 3,
              fields: ['count', 'innerText'],
            },
          },
        },
      ]
    );

    const countOnly = responses.find((message) => message.id === 31);
    expect((countOnly?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(countOnly)).toContain('count: 1');
    expect(getResponseText(countOnly)).toContain('exists: false');

    expect(getResponseText(responses.find((message) => message.id === 32))).toContain(
      'Browser MCP failed: element index 3 is out of range for selector: .hover-action'
    );
  });

  it('waits for selector visibility with opacity threshold', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Page',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                { exists: false },
                {
                  exists: true,
                  connected: true,
                  display: 'block',
                  visibility: 'visible',
                  opacity: '0.95',
                  rect: {
                    x: 10,
                    y: 10,
                    width: 40,
                    height: 20,
                    top: 10,
                    right: 50,
                    bottom: 30,
                    left: 10,
                  },
                },
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 40,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible', opacityGt: 0.9 },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 40))).toContain(
      'status: satisfied'
    );
  });

  it('waits for page text includes and returns timeout summaries', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Timeout',
          currentUrl: 'https://example.com/',
          wait: {
            pageTextSequence: ['loading', 'loading', 'loaded archive menu'],
            selectorSnapshots: {
              '.hover-action': [
                {
                  exists: true,
                  connected: true,
                  display: 'block',
                  visibility: 'visible',
                  opacity: '0.2',
                  rect: {
                    x: 10,
                    y: 10,
                    width: 40,
                    height: 20,
                    top: 10,
                    right: 50,
                    bottom: 30,
                    left: 10,
                  },
                },
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 41,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'text', includes: 'archive menu' },
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 42,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 30,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible', opacityGt: 0.9 },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 41))).toContain(
      'status: satisfied'
    );
    expect(getResponseText(responses.find((message) => message.id === 42))).toContain(
      'Browser MCP failed: wait condition timed out'
    );
    expect(getResponseText(responses.find((message) => message.id === 42))).toContain(
      'opacity=0.2'
    );
  });

  it('waits for selector text includes', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Text',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Archive',
                    textContent: 'Archive',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 45,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'text', includes: 'Archive' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 45))).toContain(
      'status: satisfied'
    );
  });

  it('lets nth become valid later during polling and rejects unsupported page-level wait kinds', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Nth',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Archive',
                    textContent: 'Archive',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                    rect: {
                      x: 10,
                      y: 10,
                      width: 40,
                      height: 20,
                      top: 10,
                      right: 50,
                      bottom: 30,
                      left: 10,
                    },
                  },
                ],
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 43,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              nth: 1,
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible' },
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 44,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              timeoutMs: 100,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 43))).toContain(
      'status: satisfied'
    );
    expect(getResponseText(responses.find((message) => message.id === 44))).toContain(
      'Browser MCP failed: page-level wait only supports text conditions in Phase 1'
    );
  });

  it('defaults browser_eval to readonly and enforces readwrite gating', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Eval Page',
          currentUrl: 'https://example.com/',
          eval: {
            'JSON.stringify({ hovered: true, label: "Archive" })': {
              result: { hovered: true, label: 'Archive' },
            },
            'document.body.dataset.test = "1"': {
              error: 'EvalError: Possible side-effect in debug-evaluate',
            },
            'throw new Error("boom")': {
              error: 'boom',
            },
            Infinity: {
              unserializableValue: 'Infinity',
            },
            window: {
              nonSerializable: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 50,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'JSON.stringify({ hovered: true, label: "Archive" })' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 51,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 52,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"', mode: 'readwrite' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 53,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'throw new Error("boom")' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 54,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'Infinity' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 55,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'window' },
          },
        },
      ],
      { childEnv: { ...process.env, CCS_BROWSER_EVAL_MODE: 'readonly' } }
    );

    expect(getResponseText(responses.find((message) => message.id === 50))).toContain(
      'mode: readonly'
    );
    expect(getResponseText(responses.find((message) => message.id === 50))).toContain(
      'value: {"hovered":true,"label":"Archive"}'
    );
    expect(getResponseText(responses.find((message) => message.id === 51))).toContain(
      'Browser MCP failed: EvalError: Possible side-effect in debug-evaluate'
    );
    expect(getResponseText(responses.find((message) => message.id === 52))).toContain(
      'Browser MCP failed: browser_eval readwrite mode is disabled by CCS_BROWSER_EVAL_MODE=readonly'
    );
    expect(getResponseText(responses.find((message) => message.id === 53))).toContain(
      'Browser MCP failed: boom'
    );
    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'value: "Infinity"'
    );
    expect(getResponseText(responses.find((message) => message.id === 55))).toContain(
      'Browser MCP failed: evaluation result is not JSON-serializable'
    );
  });

  it('allows readwrite browser_eval when configured', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Eval Page',
          currentUrl: 'https://example.com/',
          eval: {
            'document.body.dataset.test = "1"': {
              result: 'ok',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 54,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"', mode: 'readwrite' },
          },
        },
      ],
      { childEnv: { ...process.env, CCS_BROWSER_EVAL_MODE: 'readwrite' } }
    );

    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'mode: readwrite'
    );
    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'value: "ok"'
    );
  });

  it('hides browser_eval when eval mode is disabled', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Eval Disabled Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 56,
          method: 'tools/list',
          params: {},
        },
        {
          jsonrpc: '2.0',
          id: 57,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: '1 + 1' },
          },
        },
      ],
      { childEnv: { ...process.env, CCS_BROWSER_EVAL_MODE: 'disabled' } }
    );

    const tools = (responses.find((message) => message.id === 56)?.result as { tools?: Array<{ name?: string }> })
      ?.tools || [];
    expect(tools.some((tool) => tool.name === 'browser_eval')).toBe(false);
    expect((responses.find((message) => message.id === 57)?.error as { message?: string })?.message).toBe(
      'Unknown tool: browser_eval'
    );
  });

  it('queries inside an iframe selected by frameSelector', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Frame Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#details-frame',
              query: {
                '.save-button': {
                  exists: true,
                  connected: true,
                  innerText: 'Save',
                  textContent: 'Save',
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 55,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.save-button',
              frameSelector: '#details-frame',
              fields: ['exists', 'innerText'],
            },
          },
        },
      ]
    );

    expect(
      getMockFrame(
        {
          frames: [{ selector: '#details-frame' }],
          id: 'x',
          title: 'x',
          currentUrl: 'https://example.com/',
        },
        '#details-frame'
      )
    ).toBeDefined();
    expect(getResponseText(responses.find((message) => message.id === 55))).toContain(
      'innerText: Save'
    );
  });

  it('queries through open shadow roots when pierceShadow is true', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Shadow Page',
          currentUrl: 'https://example.com/',
          shadowRoots: [
            {
              hostSelector: 'app-toolbar',
              query: {
                'button[action="archive"]': {
                  exists: true,
                  connected: true,
                  innerText: 'Archive',
                  textContent: 'Archive',
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 56,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: 'button[action="archive"]',
              pierceShadow: true,
              fields: ['exists', 'innerText'],
            },
          },
        },
      ]
    );

    expect(
      getMockShadowRoot({
        shadowRoots: [{ hostSelector: 'app-toolbar' }],
        id: 'x',
        title: 'x',
        currentUrl: 'https://example.com/',
      })
    ).toBeDefined();
    expect(getResponseText(responses.find((message) => message.id === 56))).toContain(
      'innerText: Archive'
    );
  });

});
