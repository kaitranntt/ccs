import { describe, expect, it } from 'bun:test';
import {
  bundledServerPath,
  runMcpRequests,
  getResponseText,
  getMockDropzoneState,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  tmpdir,
  join,
} from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - advanced interactions', () => {
  it('drags local files onto normal, frame, and shadow dropzones', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-drag-files-'));
    const invoicePath = join(tempDir, 'invoice.pdf');
    const receiptPath = join(tempDir, 'receipt.png');
    writeFileSync(invoicePath, 'invoice');
    writeFileSync(receiptPath, 'receipt');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Uploads',
        currentUrl: 'https://example.com/uploads',
        dropzones: {
          '#dropzone': { accepted: true },
          '#cancel-dropzone': { acceptedByCancel: true },
        },
        frames: [
          {
            selector: '#upload-frame',
            dropzones: {
              '#frame-dropzone': { accepted: true },
            },
          },
        ],
        shadowRoots: [
          {
            hostSelector: 'upload-panel',
            dropzones: {
              '#shadow-dropzone': { accepted: true },
            },
          },
        ],
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 901,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#dropzone', files: [invoicePath, receiptPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 902,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: {
              selector: '#frame-dropzone',
              files: [invoicePath],
              frameSelector: '#upload-frame',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 903,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: {
              selector: '#shadow-dropzone',
              files: [receiptPath],
              pierceShadow: true,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 904,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: {
              selector: '#cancel-dropzone',
              files: [invoicePath],
            },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: tempDir } }
    );

    expect(getResponseText(responses.find((message) => message.id === 901))).toContain(
      'status: files-dropped'
    );
    expect(getMockDropzoneState(pages[0]!, '#dropzone')?.receivedEventTypes).toEqual([
      'dragenter',
      'dragover',
      'drop',
    ]);
    expect(getMockDropzoneState(pages[0]!, '#dropzone')?.receivedFiles).toEqual([
      { name: 'invoice.pdf', size: 7, type: 'application/pdf' },
      { name: 'receipt.png', size: 7, type: 'image/png' },
    ]);
    expect(
      getMockDropzoneState(pages[0]!, '#frame-dropzone', { frameSelector: '#upload-frame' })
        ?.receivedFiles
    ).toEqual([{ name: 'invoice.pdf', size: 7, type: 'application/pdf' }]);
    expect(
      getMockDropzoneState(pages[0]!, '#shadow-dropzone', { pierceShadow: true })?.receivedFiles
    ).toEqual([{ name: 'receipt.png', size: 7, type: 'image/png' }]);
    expect(getResponseText(responses.find((message) => message.id === 904))).toContain(
      'status: files-dropped'
    );
    expect(getMockDropzoneState(pages[0]!, '#cancel-dropzone')?.receivedFiles).toEqual([
      { name: 'invoice.pdf', size: 7, type: 'application/pdf' },
    ]);
  });

  it('rejects browser_drag_files for missing files, page conflicts, missing targets, and rejected drops', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-drag-files-'));
    const okPath = join(tempDir, 'ok.txt');
    const missingPath = join(tempDir, 'missing.txt');
    writeFileSync(okPath, 'ok');

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Uploads',
          currentUrl: 'https://example.com/uploads',
          dropzones: {
            '#reject-dropzone': { accepted: false },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 904,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#reject-dropzone', files: [missingPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 905,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: {
              pageIndex: 0,
              pageId: 'page-1',
              selector: '#reject-dropzone',
              files: [okPath],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 906,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#missing-dropzone', files: [okPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 907,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#reject-dropzone', files: [okPath] },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: tempDir } }
    );

    expect(getResponseText(responses.find((message) => message.id === 904))).toContain(
      'file does not exist'
    );
    expect(getResponseText(responses.find((message) => message.id === 905))).toContain(
      'pageIndex and pageId cannot be used together'
    );
    expect(getResponseText(responses.find((message) => message.id === 906))).toContain(
      'element not found for selector: #missing-dropzone'
    );
    expect(getResponseText(responses.find((message) => message.id === 907))).toContain(
      'drop target rejected files'
    );
  });

  it('drags an element to another element and to explicit coordinates', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Drag Page',
        currentUrl: 'https://example.com/drag',
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
      {
        id: 'page-2',
        title: 'Second Drag Page',
        currentUrl: 'https://example.com/drag-2',
        query: {
          '#card-a': {
            exists: true,
            connected: true,
            rect: {
              x: 10,
              y: 20,
              width: 40,
              height: 20,
              top: 20,
              right: 50,
              bottom: 40,
              left: 10,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#lane-b': {
            exists: true,
            connected: true,
            rect: {
              x: 110,
              y: 80,
              width: 60,
              height: 30,
              top: 80,
              right: 170,
              bottom: 110,
              left: 110,
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
        id: 908,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { selector: '#card-a', targetSelector: '#lane-b', steps: 3 },
        },
      },
      {
        jsonrpc: '2.0',
        id: 909,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { selector: '#card-a', targetX: 420, targetY: 180, steps: 2 },
        },
      },
      {
        jsonrpc: '2.0',
        id: 916,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { pageId: 'page-2', selector: '#card-a', targetSelector: '#lane-b', steps: 1 },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 908))).toContain(
      'status: dragged'
    );
    expect(getResponseText(responses.find((message) => message.id === 908))).toContain(
      'targetSelector: #lane-b'
    );
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain(
      'status: dragged'
    );
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain(
      'targetX: 420'
    );
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain(
      'targetY: 180'
    );
    expect(getResponseText(responses.find((message) => message.id === 916))).toContain(
      'pageIndex: 1'
    );
    expect(getResponseText(responses.find((message) => message.id === 916))).toContain(
      'targetSelector: #lane-b'
    );
    expect(pages[0]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 70, y: 70, button: 'none' },
      { type: 'mousePressed', x: 70, y: 70, button: 'left' },
      { type: 'mouseMoved', x: 147, y: 80, button: 'left' },
      { type: 'mouseMoved', x: 223, y: 90, button: 'left' },
      { type: 'mouseMoved', x: 300, y: 100, button: 'left' },
      { type: 'mouseReleased', x: 300, y: 100, button: 'left' },
      { type: 'mouseMoved', x: 70, y: 70, button: 'none' },
      { type: 'mousePressed', x: 70, y: 70, button: 'left' },
      { type: 'mouseMoved', x: 245, y: 125, button: 'left' },
      { type: 'mouseMoved', x: 420, y: 180, button: 'left' },
      { type: 'mouseReleased', x: 420, y: 180, button: 'left' },
    ]);
    expect(pages[1]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 30, y: 30, button: 'none' },
      { type: 'mousePressed', x: 30, y: 30, button: 'left' },
      { type: 'mouseMoved', x: 140, y: 95, button: 'left' },
      { type: 'mouseReleased', x: 140, y: 95, button: 'left' },
    ]);
  });

  it('rejects invalid browser_drag_element target combinations, page conflicts, and missing elements', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Drag Failures',
          currentUrl: 'https://example.com/drag',
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
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 910,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: {
              selector: '#card-a',
              targetSelector: '#lane-b',
              targetX: 400,
              targetY: 200,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 911,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { selector: '#missing-source', targetX: 400, targetY: 200 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 912,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { selector: '#card-a', targetSelector: '#missing-target' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 917,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: {
              pageIndex: 0,
              pageId: 'page-1',
              selector: '#card-a',
              targetX: 400,
              targetY: 200,
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 910))).toContain(
      'targetSelector and targetX/targetY cannot be used together'
    );
    expect(getResponseText(responses.find((message) => message.id === 911))).toContain(
      'source element not found'
    );
    expect(getResponseText(responses.find((message) => message.id === 912))).toContain(
      'target element not found'
    );
    expect(getResponseText(responses.find((message) => message.id === 917))).toContain(
      'pageIndex and pageId cannot be used together'
    );
  });

  it('runs minimal pointer sequences with browser_pointer_action', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Pointer Page',
        currentUrl: 'https://example.com/pointer',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 30,
              y: 50,
              width: 40,
              height: 20,
              top: 50,
              right: 70,
              bottom: 70,
              left: 30,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
      {
        id: 'page-2',
        title: 'Second Pointer Page',
        currentUrl: 'https://example.com/pointer-2',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 100,
              y: 200,
              width: 20,
              height: 20,
              top: 200,
              right: 120,
              bottom: 220,
              left: 100,
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
        id: 913,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [
              { type: 'move', selector: '#handle' },
              { type: 'down' },
              { type: 'move', x: 220, y: 160 },
              { type: 'pause', durationMs: 5 },
              { type: 'up' },
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 918,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            pageId: 'page-2',
            actions: [{ type: 'move', selector: '#handle' }, { type: 'down' }, { type: 'up' }],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 913))).toContain(
      'status: pointer-actions-completed'
    );
    expect(getResponseText(responses.find((message) => message.id === 918))).toContain(
      'pageIndex: 1'
    );
    expect(getResponseText(responses.find((message) => message.id === 918))).toContain(
      'status: pointer-actions-completed'
    );
    expect(pages[0]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 50, y: 60, button: 'none' },
      { type: 'mousePressed', x: 50, y: 60, button: 'left' },
      { type: 'mouseMoved', x: 220, y: 160, button: 'left' },
      { type: 'mouseReleased', x: 220, y: 160, button: 'left' },
    ]);
    expect(pages[1]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 110, y: 210, button: 'none' },
      { type: 'mousePressed', x: 110, y: 210, button: 'left' },
      { type: 'mouseReleased', x: 110, y: 210, button: 'left' },
    ]);
  });

  it('rejects invalid browser_pointer_action sequences and page conflicts', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Pointer Failures',
        currentUrl: 'https://example.com/pointer',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 30,
              y: 50,
              width: 40,
              height: 20,
              top: 50,
              right: 70,
              bottom: 70,
              left: 30,
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
        id: 914,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [{ type: 'up' }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 915,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [{ type: 'move', selector: '#missing-handle' }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 919,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            pageIndex: 0,
            pageId: 'page-1',
            actions: [{ type: 'move', x: 10, y: 10 }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 920,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [
              { type: 'move', selector: '#handle' },
              { type: 'down', button: 'left' },
              { type: 'up', button: 'right' },
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 914))).toContain(
      'pointer state error'
    );
    expect(getResponseText(responses.find((message) => message.id === 915))).toContain(
      'drag coordinates unavailable'
    );
    expect(getResponseText(responses.find((message) => message.id === 919))).toContain(
      'pageIndex and pageId cannot be used together'
    );
    expect(getResponseText(responses.find((message) => message.id === 920))).toContain(
      'pointer state error'
    );
  });

  it('rejects mutating browser tools when the selected page becomes stale', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-stale-selection-'));
    const patchedServerPath = join(tempDir, 'ccs-browser-server.cjs');
    writeFileSync(
      patchedServerPath,
      readFileSync(bundledServerPath, 'utf8').replace(
        "let selectedPageId = '';",
        "let selectedPageId = 'page-2';"
      )
    );

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Primary Page',
          currentUrl: 'https://example.com/primary',
          query: {
            '#handle': {
              exists: true,
              connected: true,
              rect: {
                x: 30,
                y: 50,
                width: 40,
                height: 20,
                top: 50,
                right: 70,
                bottom: 70,
                left: 30,
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
          id: 923,
          method: 'tools/call',
          params: {
            name: 'browser_pointer_action',
            arguments: {
              actions: [{ type: 'move', selector: '#handle' }],
            },
          },
        },
      ],
      { serverPath: patchedServerPath }
    );

    expect(getResponseText(responses.find((message) => message.id === 923))).toContain(
      'Selected page is no longer available; specify pageIndex or pageId explicitly.'
    );
  });

  it('waits for a matching navigation event with browser_wait_for_event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            navigations: [{ url: 'https://example.com/checkout' }],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 69,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'navigation', urlIncludes: '/checkout' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 69))).toContain(
      'status: observed'
    );
  });

  it('ignores child-frame navigations when waiting for a page navigation event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            navigations: [
              { url: 'https://example.com/embedded-checkout', parentId: 'frame-1' },
              { url: 'https://example.com/checkout' },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 58,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'navigation', urlIncludes: '/checkout' },
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 58));
    expect(text).toContain('status: observed');
    expect(text).toContain('"url":"https://example.com/checkout"');
    expect(text).not.toContain('embedded-checkout');
  });

  it('filters download events by the selected page frame when pageIndex is provided', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'First Page',
          currentUrl: 'https://example.com/one',
          events: {
            downloads: [
              {
                url: 'https://example.com/first-report.csv',
                suggestedFilename: 'first-report.csv',
                frameId: 'frame-page-1',
              },
            ],
          },
        },
        {
          id: 'page-2',
          title: 'Second Page',
          currentUrl: 'https://example.com/two',
          events: {
            downloads: [
              {
                url: 'https://example.com/second-report.csv',
                suggestedFilename: 'second-report.csv',
                frameId: 'frame-page-2',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 59,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              pageIndex: 1,
              timeoutMs: 1000,
              event: { kind: 'download', suggestedFilenameIncludes: 'second-report' },
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 59));
    expect(text).toContain('status: observed');
    expect(text).toContain('"suggestedFilename":"second-report.csv"');
    expect(text).not.toContain('first-report.csv');
  });

  it('matches download events from child frames within the selected page', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Framed Page',
          currentUrl: 'https://example.com/frame-host',
          frameTree: {
            frame: { id: 'frame-page-1' },
            childFrames: [{ frame: { id: 'frame-page-1-child' } }],
          },
          events: {
            downloads: [
              {
                url: 'https://example.com/embedded-report.csv',
                suggestedFilename: 'embedded-report.csv',
                frameId: 'frame-page-1-child',
              },
            ],
          },
        },
        {
          id: 'page-2',
          title: 'Other Page',
          currentUrl: 'https://example.com/other',
          events: {
            downloads: [
              {
                url: 'https://example.com/other-report.csv',
                suggestedFilename: 'other-report.csv',
                frameId: 'frame-page-2',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 60,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              pageIndex: 0,
              timeoutMs: 1000,
              event: { kind: 'download', suggestedFilenameIncludes: 'embedded-report' },
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 60));
    expect(text).toContain('status: observed');
    expect(text).toContain('"suggestedFilename":"embedded-report.csv"');
    expect(text).not.toContain('other-report.csv');
  });

  it('refreshes frame ids when a download comes from a newly attached child frame', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Dynamic Frame Page',
          currentUrl: 'https://example.com/dynamic',
          frameTreeSequence: [
            { frame: { id: 'frame-page-1' } },
            {
              frame: { id: 'frame-page-1' },
              childFrames: [{ frame: { id: 'frame-page-1-late-child' } }],
            },
          ],
          events: {
            downloads: [
              {
                url: 'https://example.com/late-report.csv',
                suggestedFilename: 'late-report.csv',
                frameId: 'frame-page-1-late-child',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 61,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              pageIndex: 0,
              timeoutMs: 1000,
              event: { kind: 'download', suggestedFilenameIncludes: 'late-report' },
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 61));
    expect(text).toContain('status: observed');
    expect(text).toContain('"suggestedFilename":"late-report.csv"');
  });

  it('captures element screenshots using the post-scroll visible clip and reports failures', async () => {
    const screenshotPlan: MockPageState['screenshot'] = {
      data: 'ZWxlbWVudC1zaG90',
      requireScrolledMeasurement: true,
      expectedClip: {
        x: 0,
        y: 12,
        width: 50,
        height: 28,
        scale: 1,
      },
    };
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Element Screenshot Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              innerText: 'Edit',
              textContent: 'Edit',
              rect: {
                x: -14,
                y: 12,
                width: 64,
                height: 28,
                top: 12,
                right: 50,
                bottom: 40,
                left: -14,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.zero-sized': {
              exists: true,
              connected: true,
              rect: {
                x: 10,
                y: 10,
                width: 0,
                height: 0,
                top: 10,
                right: 10,
                bottom: 10,
                left: 10,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
          screenshot: screenshotPlan,
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.edit-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.missing-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.zero-sized' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('selector: .edit-button');
    expect(text).toContain('format: png');
    expect(text).toContain('data: ZWxlbWVudC1zaG90');

    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'Browser MCP failed: element not found for selector: .missing-button'
    );
    expect(getResponseText(responses.find((message) => message.id === 4))).toContain(
      'Browser MCP failed: element has empty bounds for selector: .zero-sized'
    );

    const emptyPayloadResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Element Screenshot Empty Payload Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              rect: {
                x: 220,
                y: 80,
                width: 64,
                height: 28,
                top: 80,
                right: 284,
                bottom: 108,
                left: 220,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
          screenshot: { data: '' },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.edit-button' },
          },
        },
      ]
    );

    expect(getResponseText(emptyPayloadResponses.find((message) => message.id === 2))).toContain(
      'Browser MCP failed: screenshot capture failed'
    );

    const iframeScreenshotResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Iframe Screenshot Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#details-frame',
              query: {
                '#details-frame': {
                  exists: true,
                  connected: true,
                  rect: {
                    x: 40,
                    y: 100,
                    width: 300,
                    height: 200,
                    top: 100,
                    right: 340,
                    bottom: 300,
                    left: 40,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
                '.save-button': {
                  exists: true,
                  connected: true,
                  rect: {
                    x: 10,
                    y: 20,
                    width: 60,
                    height: 24,
                    top: 20,
                    right: 70,
                    bottom: 44,
                    left: 10,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
          screenshot: {
            data: 'aWZyYW1lLXNob3Q=',
            requireScrolledMeasurement: true,
            expectedClip: {
              x: 50,
              y: 120,
              width: 60,
              height: 24,
              scale: 1,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.save-button', frameSelector: '#details-frame' },
          },
        },
      ]
    );

    expect(
      getResponseText(iframeScreenshotResponses.find((message) => message.id === 5))
    ).toContain('data: aWZyYW1lLXNob3Q=');
  });

  it('captures screenshots and reports empty payload failures', async () => {
    const screenshotPlan: MockPageState['screenshot'] = { data: 'c2NyZWVuc2hvdA==' };
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          screenshot: screenshotPlan,
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_screenshot',
            arguments: { fullPage: true },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('pageIndex: 0');
    expect(text).toContain('format: png');
    expect(text).toContain('fullPage: true');
    expect(text).toContain('data: c2NyZWVuc2hvdA==');
    expect(screenshotPlan.lastCaptureBeyondViewport).toBe(true);

    const errorResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          screenshot: { data: '' },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_screenshot',
            arguments: {},
          },
        },
      ]
    );

    const errorResponse = errorResponses.find((message) => message.id === 2);
    expect((errorResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(errorResponse)).toContain(
      'Browser MCP failed: screenshot capture failed'
    );
  });

  it('reports a clear error before screenshot capture when the selected page has a zero viewport', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Popup Target',
          currentUrl: 'https://example.com/',
          viewport: { width: 0, height: 0 },
          screenshot: { data: 'c2NyZWVuc2hvdA==' },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_take_screenshot',
            arguments: {},
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 3);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: page has no drawable viewport for screenshot'
    );
  });

  it('types into supported editable targets with explicit focus and final-value verification, and rejects unsupported targets', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          type: {
            'input[name="email"]': {
              kind: 'input',
              inputType: 'email',
              value: 'old@example.com',
              expectedValueWhenAppend: 'old@example.comhi@example.com',
              requireFocus: true,
            },
            '#notes': {
              kind: 'textarea',
              value: 'old note',
              expectedValueWhenClearFirst: '',
              requireFocus: true,
            },
            '#editor': {
              kind: 'contenteditable',
              value: 'old content',
              expectedValueWhenAppend: 'old contentrich text',
              requireFocus: true,
            },
            '#color': { kind: 'unsupported', inputType: 'color', value: '#ff0000' },
            '#plain': { kind: 'noneditable', value: 'plain' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: 'input[name="email"]', text: 'hi@example.com' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#notes', text: '', clearFirst: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#editor', text: 'rich text' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#color', text: 'ignored' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#plain', text: 'ignored' },
          },
        },
      ]
    );

    const typed = getResponseText(responses.find((message) => message.id === 2));
    expect(typed).toContain('status: typed');
    expect(typed).toContain('selector: input[name="email"]');
    expect(typed).toContain('typedLength: 29');

    const clearFirst = getResponseText(responses.find((message) => message.id === 3));
    expect(clearFirst).toContain('status: typed');
    expect(clearFirst).toContain('selector: #notes');
    expect(clearFirst).toContain('typedLength: 0');

    const contenteditable = getResponseText(responses.find((message) => message.id === 4));
    expect(contenteditable).toContain('status: typed');
    expect(contenteditable).toContain('selector: #editor');
    expect(contenteditable).toContain('typedLength: 20');

    const unsupported = responses.find((message) => message.id === 5);
    expect((unsupported?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(unsupported)).toContain(
      'element is not text-editable for selector: #color'
    );

    const nonEditable = responses.find((message) => message.id === 6);
    expect((nonEditable?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(nonEditable)).toContain(
      'element is not text-editable for selector: #plain'
    );
  });
});
