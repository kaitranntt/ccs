import { describe, expect, it } from 'bun:test';
import { runMcpRequests, getResponseText } from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - session and interception', () => {
  it('lists browser tools including navigate, click, type, and screenshot', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Example Page', currentUrl: 'https://example.com/' }],
      [{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]
    );

    const tools = (
      responses.find((message) => message.id === 2)?.result as {
        tools: Array<{
          name: string;
          description?: string;
          inputSchema?: { properties?: Record<string, { type?: string; minimum?: number }> };
        }>;
      }
    ).tools;

    expect(tools.map((tool) => tool.name)).toEqual([
      'browser_get_session_info',
      'browser_get_url_and_title',
      'browser_get_visible_text',
      'browser_get_dom_snapshot',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_scroll',
      'browser_select_page',
      'browser_open_page',
      'browser_close_page',
      'browser_add_intercept_rule',
      'browser_remove_intercept_rule',
      'browser_list_intercept_rules',
      'browser_list_requests',
      'browser_set_download_behavior',
      'browser_list_downloads',
      'browser_cancel_download',
      'browser_set_file_input',
      'browser_drag_files',
      'browser_drag_element',
      'browser_pointer_action',
      'browser_start_recording',
      'browser_stop_recording',
      'browser_get_recording',
      'browser_clear_recording',
      'browser_start_replay',
      'browser_get_replay',
      'browser_cancel_replay',
      'browser_start_orchestration',
      'browser_get_orchestration',
      'browser_cancel_orchestration',
      'browser_export_artifact',
      'browser_import_artifact',
      'browser_list_artifacts',
      'browser_delete_artifact',
      'browser_take_screenshot',
      'browser_wait_for',
      'browser_eval',
      'browser_hover',
      'browser_query',
      'browser_take_element_screenshot',
      'browser_wait_for_event',
    ]);

    const clickTool = tools.find((tool) => tool.name === 'browser_click');
    expect(clickTool?.description).toContain('mouse event chain');
    expect(clickTool?.description).not.toContain('synthetic element.click()');
    expect(clickTool?.inputSchema?.properties?.offsetX).toMatchObject({ type: 'number' });
    expect(clickTool?.inputSchema?.properties?.offsetY).toMatchObject({ type: 'number' });
    expect(clickTool?.inputSchema?.properties?.button).toMatchObject({ type: 'string' });
    expect(clickTool?.inputSchema?.properties?.clickCount).toMatchObject({
      type: 'integer',
      minimum: 1,
    });

    const keyTool = tools.find((tool) => tool.name === 'browser_press_key');
    expect(keyTool?.inputSchema?.properties?.key).toMatchObject({ type: 'string' });
    expect(keyTool?.inputSchema?.properties?.modifiers).toMatchObject({ type: 'array' });

    const scrollTool = tools.find((tool) => tool.name === 'browser_scroll');
    expect(scrollTool?.inputSchema?.properties?.deltaX).toMatchObject({ type: 'number' });
    expect(scrollTool?.inputSchema?.properties?.deltaY).toMatchObject({ type: 'number' });

    const selectTool = tools.find((tool) => tool.name === 'browser_select_page');
    expect(selectTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(selectTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const openTool = tools.find((tool) => tool.name === 'browser_open_page');
    expect(openTool?.inputSchema?.properties?.url).toMatchObject({ type: 'string' });

    const closeTool = tools.find((tool) => tool.name === 'browser_close_page');
    expect(closeTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(closeTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const addRuleTool = tools.find((tool) => tool.name === 'browser_add_intercept_rule');
    expect(addRuleTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlIncludes).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.method).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.resourceType).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlPattern).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlRegex).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.headerMatchers).toMatchObject({ type: 'array' });
    expect(addRuleTool?.inputSchema?.properties?.priority).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.action).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.statusCode).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.responseHeaders).toMatchObject({ type: 'array' });
    expect(addRuleTool?.inputSchema?.properties?.headers).toBeUndefined();
    expect(addRuleTool?.inputSchema?.properties?.body).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.contentType).toMatchObject({ type: 'string' });

    const removeRuleTool = tools.find((tool) => tool.name === 'browser_remove_intercept_rule');
    expect(removeRuleTool?.inputSchema?.properties?.ruleId).toMatchObject({ type: 'string' });

    const listRulesTool = tools.find((tool) => tool.name === 'browser_list_intercept_rules');
    expect(listRulesTool?.inputSchema).toMatchObject({ type: 'object' });

    const listRequestsTool = tools.find((tool) => tool.name === 'browser_list_requests');
    expect(listRequestsTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(listRequestsTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(listRequestsTool?.inputSchema?.properties?.limit).toMatchObject({ type: 'integer' });

    const setDownloadTool = tools.find((tool) => tool.name === 'browser_set_download_behavior');
    expect(setDownloadTool?.inputSchema?.properties?.behavior).toMatchObject({ type: 'string' });
    expect(setDownloadTool?.inputSchema?.properties?.downloadPath).toMatchObject({
      type: 'string',
    });
    expect(setDownloadTool?.inputSchema?.properties?.eventsEnabled).toMatchObject({
      type: 'boolean',
    });

    const listDownloadsTool = tools.find((tool) => tool.name === 'browser_list_downloads');
    expect(listDownloadsTool?.inputSchema?.properties?.limit).toMatchObject({ type: 'integer' });
    expect(listDownloadsTool?.inputSchema?.properties?.pageId).toBeUndefined();

    const cancelDownloadTool = tools.find((tool) => tool.name === 'browser_cancel_download');
    expect(cancelDownloadTool?.inputSchema?.properties?.downloadId).toMatchObject({
      type: 'string',
    });
    expect(cancelDownloadTool?.inputSchema?.properties?.guid).toMatchObject({ type: 'string' });

    const uploadTool = tools.find((tool) => tool.name === 'browser_set_file_input');
    expect(uploadTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.files).toMatchObject({ type: 'array' });
    expect(uploadTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(uploadTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.nth).toMatchObject({ type: 'integer' });
    expect(uploadTool?.inputSchema?.properties?.frameSelector).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.pierceShadow).toMatchObject({ type: 'boolean' });

    const dragFilesTool = tools.find((tool) => tool.name === 'browser_drag_files');
    expect(dragFilesTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.files).toMatchObject({ type: 'array' });
    expect(dragFilesTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(dragFilesTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.nth).toMatchObject({ type: 'integer' });
    expect(dragFilesTool?.inputSchema?.properties?.frameSelector).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.pierceShadow).toMatchObject({ type: 'boolean' });

    const dragElementTool = tools.find((tool) => tool.name === 'browser_drag_element');
    expect(dragElementTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(dragElementTool?.inputSchema?.properties?.targetSelector).toMatchObject({
      type: 'string',
    });
    expect(dragElementTool?.inputSchema?.properties?.targetX).toMatchObject({ type: 'number' });
    expect(dragElementTool?.inputSchema?.properties?.targetY).toMatchObject({ type: 'number' });
    expect(dragElementTool?.inputSchema?.properties?.steps).toMatchObject({ type: 'integer' });

    const pointerTool = tools.find((tool) => tool.name === 'browser_pointer_action');
    expect(pointerTool?.inputSchema?.properties?.actions).toMatchObject({ type: 'array' });

    const startRecordingTool = tools.find((tool) => tool.name === 'browser_start_recording');
    expect(startRecordingTool?.inputSchema?.properties?.pageIndex).toMatchObject({
      type: 'integer',
    });
    expect(startRecordingTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const stopRecordingTool = tools.find((tool) => tool.name === 'browser_stop_recording');
    expect(stopRecordingTool?.inputSchema).toMatchObject({ type: 'object' });

    const getRecordingTool = tools.find((tool) => tool.name === 'browser_get_recording');
    expect(getRecordingTool?.inputSchema).toMatchObject({ type: 'object' });

    const clearRecordingTool = tools.find((tool) => tool.name === 'browser_clear_recording');
    expect(clearRecordingTool?.inputSchema).toMatchObject({ type: 'object' });

    const startReplayTool = tools.find((tool) => tool.name === 'browser_start_replay');
    expect(startReplayTool?.inputSchema?.properties?.steps).toMatchObject({ type: 'array' });
    expect(startReplayTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(startReplayTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const getReplayTool = tools.find((tool) => tool.name === 'browser_get_replay');
    expect(getReplayTool?.inputSchema).toMatchObject({ type: 'object' });

    const cancelReplayTool = tools.find((tool) => tool.name === 'browser_cancel_replay');
    expect(cancelReplayTool?.inputSchema).toMatchObject({ type: 'object' });

    const startOrchestrationTool = tools.find(
      (tool) => tool.name === 'browser_start_orchestration'
    );
    expect(startOrchestrationTool?.inputSchema?.properties?.blocks).toMatchObject({
      type: 'array',
    });
    expect(startOrchestrationTool?.inputSchema?.properties?.pageIndex).toMatchObject({
      type: 'integer',
    });
    expect(startOrchestrationTool?.inputSchema?.properties?.pageId).toMatchObject({
      type: 'string',
    });

    const getOrchestrationTool = tools.find((tool) => tool.name === 'browser_get_orchestration');
    expect(getOrchestrationTool?.inputSchema).toMatchObject({ type: 'object' });

    const cancelOrchestrationTool = tools.find(
      (tool) => tool.name === 'browser_cancel_orchestration'
    );
    expect(cancelOrchestrationTool?.inputSchema).toMatchObject({ type: 'object' });

    const exportArtifactTool = tools.find((tool) => tool.name === 'browser_export_artifact');
    expect(exportArtifactTool?.inputSchema?.properties?.kind).toMatchObject({ type: 'string' });
    expect(exportArtifactTool?.inputSchema?.properties?.name).toMatchObject({ type: 'string' });

    const importArtifactTool = tools.find((tool) => tool.name === 'browser_import_artifact');
    expect(importArtifactTool?.inputSchema?.properties?.path).toMatchObject({ type: 'string' });

    const listArtifactsTool = tools.find((tool) => tool.name === 'browser_list_artifacts');
    expect(listArtifactsTool?.inputSchema).toMatchObject({ type: 'object' });

    const deleteArtifactTool = tools.find((tool) => tool.name === 'browser_delete_artifact');
    expect(deleteArtifactTool?.inputSchema?.properties?.name).toMatchObject({ type: 'string' });

    const queryTool = tools.find((tool) => tool.name === 'browser_query');
    expect(queryTool?.inputSchema?.properties?.fields).toMatchObject({
      type: 'array',
    });

    for (const tool of tools.filter((candidate) => candidate.inputSchema?.properties?.pageIndex)) {
      expect(tool.inputSchema?.properties?.pageIndex).toMatchObject({
        type: 'integer',
        minimum: 0,
      });
    }
  });

  it('marks the selected page in browser_get_session_info', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 801,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 802,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 802));
    expect(text).toContain('selected: true');
    expect(text).toContain('1. Docs');
  });

  it('uses the selected page when pageIndex is omitted', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          visibleText: 'Home text',
        },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          visibleText: 'Docs text',
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 811,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 812,
          method: 'tools/call',
          params: { name: 'browser_get_visible_text', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 812));
    expect(text).toContain('Docs text');
  });

  it('opens a page when Chrome DevTools requires PUT for /json/new', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 820,
          method: 'tools/call',
          params: {
            name: 'browser_open_page',
            arguments: { url: 'https://example.com/new' },
          },
        },
      ],
      { requirePutForNewPage: true }
    );

    const openText = getResponseText(responses.find((message) => message.id === 820));
    expect(openText).toContain('status: opened');
    expect(openText).toContain('url: https://example.com/new');
  });

  it('omits non-browser popup targets from session info', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Omnibox Popup',
          currentUrl: 'chrome://omnibox-popup.top-chrome/',
        },
        { id: 'page-2', title: 'Home', currentUrl: 'https://example.com/' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 8201,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 8201));
    expect(text).toContain('0. Home');
    expect(text).toContain('selected: true');
    expect(text).not.toContain('Omnibox Popup');
    expect(text).not.toContain('chrome://omnibox-popup.top-chrome/');
  });

  it('opens a page and makes it selected', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 821,
          method: 'tools/call',
          params: {
            name: 'browser_open_page',
            arguments: { url: 'https://example.com/new' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 822,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const openText = getResponseText(responses.find((message) => message.id === 821));
    expect(openText).toContain('status: opened');
    expect(openText).toContain('url: https://example.com/new');

    const listText = getResponseText(responses.find((message) => message.id === 822));
    expect(listText).toContain('https://example.com/new');
    expect(listText).toContain('selected: true');
  });

  it('closes the selected page and falls back deterministically', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 831,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 832,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 833,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const closeText = getResponseText(responses.find((message) => message.id === 832));
    expect(closeText).toContain('status: closed');

    const listText = getResponseText(responses.find((message) => message.id === 833));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
    expect(listText).not.toContain('Docs');
  });

  it('keeps the selected page when closing a different page', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          visibleText: 'Home text',
        },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          visibleText: 'Docs text',
        },
        {
          id: 'page-3',
          title: 'Pricing',
          currentUrl: 'https://example.com/pricing',
          visibleText: 'Pricing text',
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 834,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 835,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-3' } },
        },
        {
          jsonrpc: '2.0',
          id: 836,
          method: 'tools/call',
          params: { name: 'browser_get_visible_text', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 837,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const visibleText = getResponseText(responses.find((message) => message.id === 836));
    expect(visibleText).toContain('Home text');

    const listText = getResponseText(responses.find((message) => message.id === 837));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
    expect(listText).not.toContain('Pricing');
  });

  it('reconciles a stale selected page when browser_get_session_info is called', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 841,
          method: 'tools/call',
          params: { name: 'browser_open_page', arguments: { url: 'https://example.com/new' } },
        },
        {
          jsonrpc: '2.0',
          id: 842,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 843,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 843));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
  });

  it('closes a page by pageId', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 851,
          method: 'tools/call',
          params: { name: 'browser_open_page', arguments: { url: 'https://example.com/new' } },
        },
        {
          jsonrpc: '2.0',
          id: 852,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 853,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const closeText = getResponseText(responses.find((message) => message.id === 852));
    expect(closeText).toContain('pageId: page-2');
    expect(closeText).toContain('status: closed');

    const listText = getResponseText(responses.find((message) => message.id === 853));
    expect(listText).toContain('0. Home');
    expect(listText).not.toContain('https://example.com/new');
  });

  it('adds an interception rule and lists it by bound pageId', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 901,
          method: 'tools/call',
          params: {
            name: 'browser_select_page',
            arguments: { pageIndex: 1 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 902,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 903,
          method: 'tools/call',
          params: {
            name: 'browser_list_intercept_rules',
            arguments: {},
          },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 903));
    expect(listText).toContain('pageId: page-2');
    expect(listText).toContain('urlIncludes: /api');
    expect(listText).toContain('method: GET');
    expect(listText).toContain('action: continue');
  });

  it('keeps an existing rule bound to the original page after selected page changes', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 911,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 912,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'POST', action: 'fail' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 913,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 914,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 914));
    expect(listText).toContain('pageId: page-1');
    expect(listText).toContain('method: POST');
    expect(listText).toContain('action: fail');
  });

  it('keeps richer matching rules bound to the original page after selected page changes', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1003,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 1004,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 7,
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1005,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 1006,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 1006));
    expect(listText).toContain('pageId: page-2');
    expect(listText).toContain('resourceType: XHR');
    expect(listText).toContain('priority: 7');
  });

  it('removes an interception rule by ruleId', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 921,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 922,
          method: 'tools/call',
          params: {
            name: 'browser_remove_intercept_rule',
            arguments: { ruleId: 'rule-1' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 923,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const removeText = getResponseText(responses.find((message) => message.id === 922));
    expect(removeText).toContain('ruleId: rule-1');
    expect(removeText).toContain('status: removed');

    const listText = getResponseText(responses.find((message) => message.id === 923));
    expect(listText).toBe('status: empty');
  });

  it('records recent requests with matched rule action summaries', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            pausedRequests: [
              {
                requestId: 'req-1',
                url: 'https://example.com/api/users',
                method: 'GET',
                resourceType: 'XHR',
              },
              {
                requestId: 'req-2',
                url: 'https://example.com/assets/app.js',
                method: 'GET',
                resourceType: 'Script',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 931,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'fail' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 932,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 932));
    expect(listText).toContain('requestId: req-1');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(listText).toContain('action: fail');
    expect(listText).toContain('requestId: req-2');
    expect(listText).toContain('action: continue');
  });

  it('removes rules and recent requests bound to a page after that page is closed', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          intercept: {
            pausedRequests: [
              { requestId: 'req-closed', url: 'https://example.com/api/docs', method: 'GET' },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 941,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 942,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 943,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 944,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 945,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 946,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const preCloseRequestsText = getResponseText(responses.find((message) => message.id === 943));
    expect(preCloseRequestsText).toContain('requestId: req-closed');

    const listRulesText = getResponseText(responses.find((message) => message.id === 945));
    expect(listRulesText).not.toContain('pageId: page-2');

    const postCloseRequestsText = getResponseText(responses.find((message) => message.id === 946));
    expect(postCloseRequestsText).not.toContain('requestId: req-closed');
    expect(postCloseRequestsText).not.toContain('pageId: page-2');
  });

  it('rejects browser_add_intercept_rule when pageIndex and pageId are both provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 951,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              pageIndex: 0,
              pageId: 'page-1',
              urlIncludes: '/api',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 951);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: pageIndex and pageId cannot be used together'
    );
  });

  it('rejects browser_add_intercept_rule when action is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 952,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              action: 'mock',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 952);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: action must be one of: continue, fail'
    );
  });

  it('rejects intercept rules when urlPattern and urlRegex are both provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 981,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlPattern: 'https://example.com/api/*',
              urlRegex: '^https://example\\.com/api/',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 981);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: urlPattern and urlRegex cannot be used together'
    );
  });

  it('rejects intercept rules when priority is not an integer', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 982,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              priority: 1.5,
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 982);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: priority must be an integer');
  });

  it('rejects intercept rules when headerMatchers is not an array', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 983,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: 'x',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 983);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: headerMatchers must be an array'
    );
  });

  it('rejects intercept rules when a header matcher is missing name', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 984,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ valueIncludes: 'staging' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 984);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: headerMatchers.name is required'
    );
  });

  it('rejects intercept rules when a header matcher has no value matcher', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 985,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 985);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: headerMatchers entry must include valueIncludes or valueRegex'
    );
  });

  it('rejects intercept rules when no matching condition is provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 986,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              priority: 10,
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 986);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: at least one matching condition is required'
    );
  });

  it('adds a resourceType interception rule and lists its richer matching summary', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 987,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 10,
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 988,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 988));
    expect(listText).toContain('resourceType: XHR');
    expect(listText).toContain('priority: 10');
  });

  it('prefers the higher-priority matched rule over an earlier lower-priority rule', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-priority',
              url: 'https://example.com/api/orders',
              method: 'GET',
              resourceType: 'XHR',
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
          id: 989,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              action: 'fulfill',
              statusCode: 201,
              body: 'low',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 990,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 10,
              action: 'fulfill',
              statusCode: 202,
              body: 'high',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 991,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 991));
    expect(listText).toContain('requestId: req-priority');
    expect(listText).toContain('matchedRuleId: rule-2');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(202);
  });

  it('keeps creation order when matched rules have the same priority', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-same-priority',
              url: 'https://example.com/api/orders',
              method: 'GET',
              resourceType: 'XHR',
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
          id: 9911,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              priority: 5,
              action: 'fulfill',
              statusCode: 201,
              body: 'first',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9912,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 5,
              action: 'fulfill',
              statusCode: 202,
              body: 'second',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9913,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 9913));
    expect(listText).toContain('requestId: req-same-priority');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(201);
  });

  it('matches urlPattern rules with wildcard syntax', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-pattern',
              url: 'https://example.com/api/v1/users',
              method: 'GET',
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
          id: 992,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlPattern: 'https://example.com/api/*',
              action: 'fail',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 993,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 993));
    expect(listText).toContain('requestId: req-pattern');
    expect(listText).toContain('action: fail');
    expect(pages[0]?.intercept?.failedRequests?.[0]?.requestId).toBe('req-pattern');
  });

  it('matches urlRegex rules', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-regex',
              url: 'https://example.com/api/users',
              method: 'GET',
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
          id: 994,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlRegex: '^https://example\\.com/api/(users|teams)$',
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 995,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 995));
    expect(listText).toContain('requestId: req-regex');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.continuedRequestIds).toContain('req-regex');
  });

  it('matches headerMatchers using valueIncludes and case-insensitive header names', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-header-includes',
              url: 'https://example.com/api/header-includes',
              method: 'GET',
              requestHeaders: {
                'X-Env': 'staging-us',
              },
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
          id: 996,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env', valueIncludes: 'staging' }],
              action: 'fulfill',
              statusCode: 207,
              body: 'matched-includes',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 997,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 997));
    expect(listText).toContain('requestId: req-header-includes');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(207);
  });

  it('matches headerMatchers using valueRegex', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-header-regex',
              url: 'https://example.com/api/header-regex',
              method: 'GET',
              requestHeaders: {
                'x-tenant': 'acme-prod',
              },
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
          id: 998,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'X-Tenant', valueRegex: '^acme-' }],
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 999,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 999));
    expect(listText).toContain('requestId: req-header-regex');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.continuedRequestIds).toContain('req-header-regex');
  });

  it('adds a fulfill interception rule and lists its response summary', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 961,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              method: 'GET',
              action: 'fulfill',
              statusCode: 202,
              contentType: 'application/json',
              body: '{"ok":true}',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 962,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 962));
    expect(listText).toContain('action: fulfill');
    expect(listText).toContain('statusCode: 202');
    expect(listText).toContain('contentType: application/json');
  });

  it('fulfills a paused request with the configured mock response', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-fulfill-1',
              url: 'https://example.com/api/mock/users',
              method: 'GET',
              resourceType: 'XHR',
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
          id: 963,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              method: 'GET',
              action: 'fulfill',
              statusCode: 200,
              contentType: 'application/json',
              body: '{"users":[1]}',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 964,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 964));
    expect(listText).toContain('requestId: req-fulfill-1');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(listText).toContain('action: fulfill');
    expect(pages[0]?.intercept?.fulfilledRequests).toEqual([
      expect.objectContaining({
        requestId: 'req-fulfill-1',
        responseCode: 200,
      }),
    ]);
  });

  it('passes custom response headers to Fetch.fulfillRequest', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-fulfill-2',
              url: 'https://example.com/api/mock/headers',
              method: 'GET',
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
          id: 965,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock/headers',
              action: 'fulfill',
              statusCode: 201,
              responseHeaders: [
                { name: 'Cache-Control', value: 'no-store' },
                { name: 'X-Mocked-By', value: 'ccs-browser' },
              ],
              body: 'ok',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 966,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 966));
    expect(listText).toContain('action: fulfill');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Cache-Control', value: 'no-store' }),
        expect.objectContaining({ name: 'X-Mocked-By', value: 'ccs-browser' }),
      ])
    );
  });

  it('allows fulfill rules with an empty response body', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 967,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/empty',
              action: 'fulfill',
              statusCode: 204,
              contentType: 'text/plain',
              body: '',
            },
          },
        },
      ]
    );

    const addText = getResponseText(responses.find((message) => message.id === 967));
    expect(addText).toContain('action: fulfill');
    expect(addText).toContain('statusCode: 204');
  });

  it('rejects fulfill rules when statusCode is out of range', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 968,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              statusCode: 99,
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 968);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: statusCode must be an integer between 100 and 599'
    );
  });

  it('rejects fulfill rules when responseHeaders is not an array', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 969,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              responseHeaders: 'x',
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 969);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: responseHeaders must be an array'
    );
  });

  it('rejects fulfill rules when a responseHeaders entry is missing name', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 970,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              responseHeaders: [{ value: 'x' }],
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 970);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: responseHeaders.name is required'
    );
  });

  it('rejects fulfill rules when body is not a string', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 971,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              body: 123,
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 971);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: body must be a string');
  });

  it('rejects intercept rules when urlRegex is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1001,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlRegex: '[',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 1001);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: urlRegex must be a valid regular expression'
    );
  });

  it('rejects intercept rules when headerMatchers.valueRegex is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1002,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env', valueRegex: '[' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 1002);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: headerMatchers.valueRegex must be a valid regular expression'
    );
  });

  it('rejects intercept rules that match sensitive request headers', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1003,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'Cookie', valueRegex: '^session=' }],
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1004,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'authorization', valueIncludes: 'Bearer ' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    for (const id of [1003, 1004]) {
      const response = responses.find((message) => message.id === id);
      expect((response?.result as { isError?: boolean }).isError).toBe(true);
      expect(getResponseText(response)).toContain(
        'Browser MCP failed: headerMatchers.name cannot target sensitive request header'
      );
    }
  });

  it('removes fulfill rules and request summaries after the bound page is closed', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        {
          id: 'page-2',
          title: 'Mocked',
          currentUrl: 'https://example.com/mocked',
          intercept: {
            pausedRequests: [
              {
                requestId: 'req-fulfill-close',
                url: 'https://example.com/api/mock/close',
                method: 'GET',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 972,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 973,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock/close',
              action: 'fulfill',
              statusCode: 200,
              body: 'done',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 974,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 975,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 976,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 977,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    expect(getResponseText(responses.find((message) => message.id === 974))).toContain(
      'requestId: req-fulfill-close'
    );
    expect(getResponseText(responses.find((message) => message.id === 976))).not.toContain(
      'pageId: page-2'
    );
    expect(getResponseText(responses.find((message) => message.id === 977))).not.toContain(
      'requestId: req-fulfill-close'
    );
  });

  it('returns only the requested number of recent requests', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            pausedRequests: [
              {
                requestId: 'req-1',
                url: 'https://example.com/api/one',
                method: 'GET',
                resourceType: 'XHR',
              },
              {
                requestId: 'req-2',
                url: 'https://example.com/api/two',
                method: 'GET',
                resourceType: 'XHR',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 953,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 954,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: { limit: 1 } },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 954));
    expect(listText).toContain('requestId: req-2');
    expect(listText).not.toContain('requestId: req-1');
  });

  it('fails browser_add_intercept_rule when Fetch.enable fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            enableError: 'Fetch.enable blocked',
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 955,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 956,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const addResponse = responses.find((message) => message.id === 955);
    expect((addResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(addResponse)).toContain('Browser MCP failed: Fetch.enable blocked');

    const listText = getResponseText(responses.find((message) => message.id === 956));
    expect(listText).toBe('status: empty');
  });
});
