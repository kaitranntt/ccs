import { describe, expect, it } from 'bun:test';
import { runMcpRequests, getResponseText, createReplayStep } from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - recording and replay', () => {
  it('starts, stops, reads, and clears a recording session', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Recording Page',
          currentUrl: 'https://example.com/recording',
          recording: {
            events: [
              {
                kind: 'click',
                selector: '#submit',
                button: 'left',
                clickCount: 1,
                offsetX: 12,
                offsetY: 8,
                timestamp: 1710000000000,
              },
            ],
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1001, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1002, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1003, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1004, method: 'tools/call', params: { name: 'browser_clear_recording', arguments: {} } },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1001))).toContain('status: recording');
    expect(getResponseText(responses.find((message) => message.id === 1002))).toContain('status: stopped');
    expect(getResponseText(responses.find((message) => message.id === 1003))).toContain('type: click');
    expect(getResponseText(responses.find((message) => message.id === 1004))).toContain('status: cleared');
  });

  it('rejects invalid recording lifecycle operations', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Recording Page',
          currentUrl: 'https://example.com/recording',
        },
      ],
      [
        { jsonrpc: '2.0', id: 1011, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1012, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1013, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1014, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1015, method: 'tools/call', params: { name: 'browser_clear_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1016, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1012))).toContain('recording already active');
    expect(getResponseText(responses.find((message) => message.id === 1014))).toContain('no active recording');
    expect(getResponseText(responses.find((message) => message.id === 1016))).toContain('no recording available');
  });

  it('routes recording start by pageId and rejects page conflicts', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'First', currentUrl: 'https://example.com/1' },
        { id: 'page-2', title: 'Second', currentUrl: 'https://example.com/2' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1017,
          method: 'tools/call',
          params: { name: 'browser_start_recording', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 1018,
          method: 'tools/call',
          params: { name: 'browser_clear_recording', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 1019,
          method: 'tools/call',
          params: { name: 'browser_start_recording', arguments: { pageIndex: 0, pageId: 'page-1' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1017))).toContain('pageIndex: 1');
    expect(getResponseText(responses.find((message) => message.id === 1019))).toContain('pageIndex and pageId cannot be used together');
  });

  it('cleans up recording state when stop finalization fails', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Broken Stop Recording Page',
        currentUrl: 'https://example.com/broken-stop-recording',
        recording: {
          finalizeError: 'recording finalize failed',
        },
      },
    ];

    const stopResponses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 1019_1,
          method: 'tools/call',
          params: { name: 'browser_start_recording', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 1019_2,
          method: 'tools/call',
          params: { name: 'browser_stop_recording', arguments: {} },
        },
      ]
    );

    expect(getResponseText(stopResponses.find((message) => message.id === 1019_2))).toContain(
      'recording finalize failed'
    );
    expect(pages[0].recording?.installed).toBe(false);
    expect(pages[0].recording?.teardownCalls).toBe(1);

    const restartResponses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1019_3,
        method: 'tools/call',
        params: { name: 'browser_start_recording', arguments: {} },
      },
    ]);

    expect(getResponseText(restartResponses.find((message) => message.id === 1019_3))).toContain(
      'status: recording'
    );
  });

  it('rolls back recording state when recorder injection fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Broken Recording Page',
          currentUrl: 'https://example.com/broken-recording',
          recording: {
            injectionError: 'recording injection failed',
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1020, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1020_1, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1020))).toContain('recording injection failed');
    expect(getResponseText(responses.find((message) => message.id === 1020_1))).toContain('no recording available');
  });

  it('normalizes type, press_key, scroll, and warnings in a recording result', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Normalize Page',
          currentUrl: 'https://example.com/normalize',
          recording: {
            events: [
              { kind: 'type', selector: '#email', text: 'walker@example.com', timestamp: 1710000000100 },
              { kind: 'press_key', key: 'Enter', modifiers: ['Shift'], timestamp: 1710000000200 },
              { kind: 'scroll', selector: '#results', deltaX: 0, deltaY: 320, timestamp: 1710000000300 },
            ],
            warnings: [{ message: 'cross-origin frame events were skipped' }],
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1021, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1022, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1023, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1023));
    expect(text).toContain('type: type');
    expect(text).toContain('selector: #email');
    expect(text).toContain('type: press_key');
    expect(text).toContain('type: scroll');
    expect(text).toContain('cross-origin frame events were skipped');
  });

  it('normalizes drag_element and pointer_action recordings', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Drag Recording Page',
          currentUrl: 'https://example.com/drag-recording',
          recording: {
            events: [
              {
                kind: 'drag_element',
                selector: '#card-a',
                targetSelector: '#lane-b',
                timestamp: 1710000000400,
              },
              {
                kind: 'pointer_action',
                actions: [
                  { type: 'move', x: 10, y: 20 },
                  { type: 'down', button: 'left' },
                  { type: 'up', button: 'left' },
                ],
                timestamp: 1710000000500,
              },
            ],
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1031, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1032, method: 'tools/call', params: { name: 'browser_stop_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1033, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1033));
    expect(text).toContain('type: drag_element');
    expect(text).toContain('selector: #card-a');
    expect(text).toContain('targetSelector: "#lane-b"');
    expect(text).toContain('type: pointer_action');
    expect(text).toContain('actions:');
  });

  it('stops recording with a warning when the target page becomes unavailable', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Closing Page',
          currentUrl: 'https://example.com/closing',
          recording: {
            events: [{ kind: 'click', selector: '#submit', timestamp: 1710000000600 }],
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 1034, method: 'tools/call', params: { name: 'browser_start_recording', arguments: {} } },
        { jsonrpc: '2.0', id: 1035, method: 'tools/call', params: { name: 'browser_close_page', arguments: { pageId: 'page-1' } } },
        { jsonrpc: '2.0', id: 1036, method: 'tools/call', params: { name: 'browser_get_recording', arguments: {} } },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1036));
    expect(text).toContain('status: stopped');
    expect(text).toContain('recording stopped because target page was closed');
  });

  it('starts a replay, reports progress, and completes basic steps', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Replay Page',
        currentUrl: 'https://example.com/replay',
        click: {
          '#submit': {},
        },
        query: {
          '#submit': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 100,
              height: 40,
              top: 30,
              right: 120,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
        type: {
          '#email': { kind: 'input', inputType: 'email', value: '' },
        },
        scroll: {
          '#results': { expectedBehavior: 'by-offset', expectedDeltaX: 0, expectedDeltaY: 240 },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1101,
        method: 'tools/call',
        params: {
          name: 'browser_start_replay',
          arguments: {
            steps: [
              createReplayStep({
                type: 'click',
                pageId: 'page-1',
                selector: '#submit',
                nth: 0,
                args: { button: 'left', clickCount: 1, offsetX: 12, offsetY: 8 },
              }),
              createReplayStep({
                type: 'type',
                pageId: 'page-1',
                selector: '#email',
                nth: 0,
                args: { text: 'walker@example.com' },
              }),
              createReplayStep({
                type: 'scroll',
                pageId: 'page-1',
                selector: '#results',
                args: { deltaX: 0, deltaY: 240 },
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1102,
        method: 'tools/call',
        params: { name: 'browser_get_replay', arguments: {} },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1101))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1102))).toContain('completedSteps: 3');
    expect(getResponseText(responses.find((message) => message.id === 1102))).toContain('status: completed');
  });

  it('rejects invalid replay payloads before execution starts', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Replay Page', currentUrl: 'https://example.com/replay' }],
      [
        {
          jsonrpc: '2.0',
          id: 1111,
          method: 'tools/call',
          params: { name: 'browser_start_replay', arguments: { steps: [] } },
        },
        {
          jsonrpc: '2.0',
          id: 1112,
          method: 'tools/call',
          params: {
            name: 'browser_start_replay',
            arguments: {
              steps: [createReplayStep({ type: 'unknown-step', pageId: 'page-1' })],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1113,
          method: 'tools/call',
          params: {
            name: 'browser_start_replay',
            arguments: {
              steps: [createReplayStep({ type: 'click', pageId: 'page-2', selector: '#submit', args: {} })],
              pageId: 'page-1',
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 1111))).toContain('steps must be a non-empty array');
    expect(getResponseText(responses.find((message) => message.id === 1112))).toContain('unsupported replay step type');
    expect(getResponseText(responses.find((message) => message.id === 1113))).toContain('replay step pageId mismatch');
  });

  it('fails replay on the first failing step and reports failedStepIndex', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Replay Failure Page',
          currentUrl: 'https://example.com/replay-failure',
          click: {
            '#submit': {},
          },
          query: {
            '#submit': {
              exists: true,
              connected: true,
              rect: {
                x: 20,
                y: 30,
                width: 100,
                height: 40,
                top: 30,
                right: 120,
                bottom: 70,
                left: 20,
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
          id: 1114,
          method: 'tools/call',
          params: {
            name: 'browser_start_replay',
            arguments: {
              steps: [
                createReplayStep({ type: 'click', pageId: 'page-1', selector: '#submit', args: {} }),
                createReplayStep({ type: 'click', pageId: 'page-1', selector: '#missing', args: {} }),
              ],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1115,
          method: 'tools/call',
          params: { name: 'browser_get_replay', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 1115));
    expect(text).toContain('status: failed');
    expect(text).toContain('failedStepIndex: 1');
    expect(text).toContain('element index 0 is out of range for selector: #missing');
  });

  it('cancels a replay before later steps run', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Replay Cancel Page',
        currentUrl: 'https://example.com/replay-cancel',
        click: {
          '#submit': {},
        },
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 30,
              width: 40,
              height: 40,
              top: 30,
              right: 60,
              bottom: 70,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#submit': {
            exists: true,
            connected: true,
            rect: {
              x: 120,
              y: 30,
              width: 100,
              height: 40,
              top: 30,
              right: 220,
              bottom: 70,
              left: 120,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1116,
        method: 'tools/call',
        params: {
          name: 'browser_start_replay',
          arguments: {
            steps: [
              createReplayStep({
                type: 'pointer_action',
                pageId: 'page-1',
                args: {
                  actions: [
                    { type: 'move', selector: '#handle' },
                    { type: 'pause', durationMs: 400 },
                  ],
                },
              }),
              createReplayStep({
                type: 'click',
                pageId: 'page-1',
                selector: '#submit',
                args: {},
              }),
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 1117,
        method: 'tools/call',
        params: { name: 'browser_cancel_replay', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 1118,
        method: 'tools/call',
        params: { name: 'browser_get_replay', arguments: {} },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1116))).toContain(
      'status: running'
    );
    const text = getResponseText(responses.find((message) => message.id === 1118));
    expect(text).toContain('status: canceled');
    expect(text).not.toContain('completedSteps: 2');
  });

  it('replays drag_element and pointer_action steps successfully', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Replay Drag Page',
        currentUrl: 'https://example.com/replay-drag',
        query: {
          '#card-a': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 40,
              width: 100,
              height: 60,
              top: 40,
              right: 120,
              bottom: 100,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#lane-b': {
            exists: true,
            connected: true,
            rect: {
              x: 240,
              y: 60,
              width: 120,
              height: 80,
              top: 60,
              right: 360,
              bottom: 140,
              left: 240,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1121,
        method: 'tools/call',
        params: {
          name: 'browser_start_replay',
          arguments: {
            steps: [
              createReplayStep({
                type: 'drag_element',
                pageId: 'page-1',
                selector: '#card-a',
                args: { targetSelector: '#lane-b' },
              }),
              createReplayStep({
                type: 'pointer_action',
                pageId: 'page-1',
                args: {
                  actions: [
                    { type: 'move', x: 10, y: 20 },
                    { type: 'down', button: 'left' },
                    { type: 'up', button: 'left' },
                  ],
                },
              }),
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 1121))).toContain('status: completed');
    expect(getResponseText(responses.find((message) => message.id === 1121))).toContain('completedSteps: 2');
  });

});
