import { describe, expect, it } from 'bun:test';
import { mkdirSync, realpathSync } from 'node:fs';
import { delimiter } from 'node:path';
import {
  runMcpRequests,
  getResponseText,
  mkdtempSync,
  writeFileSync,
  tmpdir,
  join,
} from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - downloads and file inputs', () => {
  it('applies browser-scoped download behavior, records download summaries, and cancels an in-progress download', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Reports',
        currentUrl: 'https://example.com/reports',
        browser: {},
        events: {
          downloads: [
            {
              guid: 'download-guid-1',
              url: 'https://example.com/files/report.csv',
              suggestedFilename: 'report.csv',
              progress: [{ receivedBytes: 5, totalBytes: 10, state: 'inProgress' }],
            },
          ],
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 57,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', eventsEnabled: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 58,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 59,
          method: 'tools/call',
          params: {
            name: 'browser_cancel_download',
            arguments: { guid: 'download-guid-1' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 60,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 57))).toContain(
      'scope: browser'
    );
    expect(getResponseText(responses.find((message) => message.id === 58))).toContain(
      'suggestedFilename: report.csv'
    );
    expect(getResponseText(responses.find((message) => message.id === 60))).toContain(
      'status: canceled'
    );
    expect(pages[0]?.browser?.setDownloadBehaviorCalls?.[0]?.behavior).toBe('allow');
    expect(pages[0]?.browser?.canceledDownloadGuids).toContain('download-guid-1');
  });

  it('rejects browser_set_download_behavior when behavior is deny and downloadPath is provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Reports', currentUrl: 'https://example.com/reports' }],
      [
        {
          jsonrpc: '2.0',
          id: 61,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: {
              behavior: 'deny',
              downloadPath: '/tmp/blocked-downloads',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 61);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: downloadPath is only allowed when behavior=accept'
    );
  });

  it('restricts caller-provided download paths to configured safe roots', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-download-root-'));
    const allowedPath = join(tempDir, 'reports');
    const outsidePath = join(tmpdir(), 'ccs-browser-outside-downloads');
    const sensitiveRoot = join(tempDir, '.aws');
    const sensitiveDownloadPath = join(sensitiveRoot, 'reports');

    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Reports', currentUrl: 'https://example.com/reports', browser: {} }],
      [
        {
          jsonrpc: '2.0',
          id: 615,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', downloadPath: allowedPath },
          },
        },
        {
          jsonrpc: '2.0',
          id: 616,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', downloadPath: outsidePath },
          },
        },
        {
          jsonrpc: '2.0',
          id: 619,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', downloadPath: sensitiveDownloadPath },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_DOWNLOAD_ROOTS: `${sensitiveRoot}${delimiter}${tempDir}` } }
    );

    expect(getResponseText(responses.find((message) => message.id === 615))).toContain(
      `downloadPath: ${realpathSync(allowedPath)}`
    );
    const rejectedResponse = responses.find((message) => message.id === 616);
    expect((rejectedResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(rejectedResponse)).toContain(
      'downloadPath must be inside the browser session download directory or a CCS_BROWSER_DOWNLOAD_ROOTS entry'
    );
    expect(getResponseText(responses.find((message) => message.id === 619))).toContain(
      'downloadPath cannot include hidden or sensitive path segment: .aws'
    );
  });

  it('rejects browser_cancel_download for completed downloads', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Reports',
        currentUrl: 'https://example.com/reports',
        browser: {},
        events: {
          downloads: [
            {
              guid: 'download-guid-complete',
              url: 'https://example.com/files/report.csv',
              suggestedFilename: 'report.csv',
              progress: [{ receivedBytes: 10, totalBytes: 10, state: 'completed' }],
            },
          ],
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 610,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', eventsEnabled: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 611,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 612,
          method: 'tools/call',
          params: {
            name: 'browser_cancel_download',
            arguments: { guid: 'download-guid-complete' },
          },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 611))).toContain(
      'status: completed'
    );
    const response = responses.find((message) => message.id === 612);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: download is not cancelable in status: completed'
    );
    expect(pages[0]?.browser?.canceledDownloadGuids).toBeUndefined();
  });

  it('waits for a matching download event with browser_wait_for_event after Phase 8 changes', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            downloads: [
              {
                guid: 'download-guid-2',
                url: 'https://example.com/files/export.zip',
                suggestedFilename: 'export.zip',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 62,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'download', suggestedFilenameIncludes: 'export.zip' },
            },
          },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 62))).toContain(
      'status: observed'
    );
  });

  it('sets files on selected-page, frameSelector, and pierceShadow file inputs', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const invoicePath = join(tempDir, 'invoice.pdf');
    const receiptPath = join(tempDir, 'receipt.png');
    writeFileSync(invoicePath, 'invoice');
    writeFileSync(receiptPath, 'receipt');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Root Uploads',
        currentUrl: 'https://example.com/root',
        fileInputs: {
          '#root-upload': { kind: 'file', multiple: true },
        },
        frames: [
          {
            selector: '#upload-frame',
            fileInputs: {
              '#frame-upload': { kind: 'file', multiple: true },
            },
          },
        ],
        shadowRoots: [
          {
            hostSelector: 'upload-panel',
            fileInputs: {
              '#shadow-upload': { kind: 'file' },
            },
          },
        ],
      },
      {
        id: 'page-2',
        title: 'Selected Uploads',
        currentUrl: 'https://example.com/selected',
        fileInputs: {
          '#selected-upload': { kind: 'file', multiple: true },
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 63,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 64,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#selected-upload', files: [invoicePath, receiptPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 65,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: {
              pageIndex: 0,
              selector: '#frame-upload',
              files: [invoicePath],
              frameSelector: '#upload-frame',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 66,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: {
              pageIndex: 0,
              selector: '#shadow-upload',
              files: [receiptPath],
              pierceShadow: true,
            },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: tempDir } }
    );

    expect(getResponseText(responses.find((message) => message.id === 64))).toContain(
      'pageIndex: 1'
    );
    expect(getResponseText(responses.find((message) => message.id === 65))).toContain(
      'frameSelector: #upload-frame'
    );
    expect(getResponseText(responses.find((message) => message.id === 66))).toContain(
      'pierceShadow: true'
    );

    expect(
      (pages[1]?.fileInputs?.['#selected-upload'] as MockFileInputState).assignedFiles
    ).toEqual([realpathSync(invoicePath), realpathSync(receiptPath)]);
    expect(
      (pages[0]?.frames?.[0]?.fileInputs?.['#frame-upload'] as MockFileInputState).assignedFiles
    ).toEqual([realpathSync(invoicePath)]);
    expect(
      (pages[0]?.shadowRoots?.[0]?.fileInputs?.['#shadow-upload'] as MockFileInputState)
        .assignedFiles
    ).toEqual([realpathSync(receiptPath)]);
  });

  it('uses pageId for browser_set_file_input when provided', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const assetPath = join(tempDir, 'asset.txt');
    writeFileSync(assetPath, 'asset');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Selected Uploads',
        currentUrl: 'https://example.com/selected',
        fileInputs: {
          '#selected-upload': { kind: 'file' },
        },
      },
      {
        id: 'page-2',
        title: 'Explicit Uploads',
        currentUrl: 'https://example.com/explicit',
        fileInputs: {
          '#pageid-upload': { kind: 'file' },
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 67,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageId: 'page-1' } },
        },
        {
          jsonrpc: '2.0',
          id: 68,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { pageId: 'page-2', selector: '#pageid-upload', files: [assetPath] },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: tempDir } }
    );

    expect(getResponseText(responses.find((message) => message.id === 68))).toContain(
      'pageIndex: 1'
    );
    expect((pages[1]?.fileInputs?.['#pageid-upload'] as MockFileInputState).assignedFiles).toEqual([
      realpathSync(assetPath),
    ]);
    expect(
      (pages[0]?.fileInputs?.['#selected-upload'] as MockFileInputState).assignedFiles
    ).toBeUndefined();
  });

  it('rejects file uploads outside configured roots and sensitive files inside configured roots', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-root-'));
    const outsideDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-outside-'));
    const outsidePath = join(outsideDir, 'secret.txt');
    const sensitiveDir = join(tempDir, '.ssh');
    const sensitivePath = join(sensitiveDir, 'id_rsa');
    const sensitiveRootPath = join(sensitiveDir, 'public.txt');
    writeFileSync(outsidePath, 'outside');
    mkdirSync(sensitiveDir, { recursive: true });
    writeFileSync(sensitivePath, 'private-key');
    writeFileSync(sensitiveRootPath, 'not-a-key');

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Upload Guard',
          currentUrl: 'https://example.com/',
          fileInputs: {
            '#real-file-input': { kind: 'file' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 617,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#real-file-input', files: [outsidePath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 618,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#real-file-input', files: [sensitivePath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 620,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#real-file-input', files: [sensitiveRootPath] },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: `${sensitiveDir}${delimiter}${tempDir}` } }
    );

    expect(getResponseText(responses.find((message) => message.id === 617))).toContain(
      'file must be inside the browser session download directory or a CCS_BROWSER_UPLOAD_ROOTS entry'
    );
    expect(getResponseText(responses.find((message) => message.id === 618))).toContain(
      'file cannot include hidden or sensitive path segment: .ssh'
    );
    expect(getResponseText(responses.find((message) => message.id === 620))).toContain(
      'file cannot include hidden or sensitive path segment: .ssh'
    );
  });

  it('rejects browser_set_file_input when target is not a file input, local file is missing, or page selectors conflict', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const okPath = join(tempDir, 'ok.txt');
    const missingPath = join(tempDir, 'missing.txt');
    writeFileSync(okPath, 'ok');

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Upload Errors',
          currentUrl: 'https://example.com/',
          fileInputs: {
            '#real-file-input': { kind: 'file' },
            '#not-file-input': { kind: 'nonfile' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 69,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#not-file-input', files: [okPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 70,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#real-file-input', files: [missingPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 71,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: {
              pageIndex: 0,
              pageId: 'page-1',
              selector: '#real-file-input',
              files: [okPath],
            },
          },
        },
      ],
      { childEnv: { CCS_BROWSER_UPLOAD_ROOTS: tempDir } }
    );

    expect(getResponseText(responses.find((message) => message.id === 69))).toContain(
      'element is not a file input for selector: #not-file-input'
    );
    expect(getResponseText(responses.find((message) => message.id === 70))).toContain(
      `file does not exist: ${missingPath}`
    );
    expect(getResponseText(responses.find((message) => message.id === 71))).toContain(
      'pageIndex and pageId cannot be used together'
    );
  });
});
