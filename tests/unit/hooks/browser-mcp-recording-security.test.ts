import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';
import { runMcpRequests } from './browser-mcp-test-harness';
import type { MockPageState } from './browser-mcp-test-harness';

describe('ccs-browser MCP server - recording security', () => {
  it('filters sensitive text targets and printable key presses in injected recorder code', () => {
    const source = readFileSync('lib/mcp/ccs-browser-server.cjs', 'utf8');
    const sensitiveAttributePatternMatch = source.match(
      /const sensitiveAttributePattern = \/(.+)\/i;/
    );

    expect(source).toContain("sensitiveInputTypes = new Set(['password', 'hidden'])");
    expect(source).toContain('sensitiveAutocompleteValues');
    expect(source).toContain('autocompleteTokens.some((token) => sensitiveAutocompleteValues.has(token))');
    expect(source).toContain('isSensitiveTextTarget(target)');
    expect(source).toContain("typeof event.key !== 'string' || event.key.length !== 1");
    expect(sensitiveAttributePatternMatch).not.toBeNull();

    const sensitiveAttributePattern = new RegExp(sensitiveAttributePatternMatch![1], 'i');
    expect(sensitiveAttributePattern.test('verification_code')).toBe(true);
    expect(sensitiveAttributePattern.test('security-code')).toBe(true);
    expect(sensitiveAttributePattern.test('pin')).toBe(true);
    expect(sensitiveAttributePattern.test('auth_token')).toBe(true);
    expect(sensitiveAttributePattern.test('author')).toBe(false);
  });

  it('tears down page recording hooks when stopping or clearing', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Recording Page',
        currentUrl: 'https://example.com/recording',
        recording: {
          events: [{ kind: 'click', selector: '#submit', timestamp: 1710000000000 }],
        },
      },
    ];

    await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'browser_start_recording', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'browser_stop_recording', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'browser_clear_recording', arguments: {} },
      },
    ]);

    expect(pages[0].recording?.installed).toBe(false);
    expect(pages[0].recording?.teardownCalls).toBe(1);

    await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'browser_start_recording', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'browser_clear_recording', arguments: {} },
      },
    ]);

    expect(pages[0].recording?.installed).toBe(false);
    expect(pages[0].recording?.teardownCalls).toBe(2);
  });
});
