import { describe, expect, it } from 'bun:test';
import { SSEParser } from '../../../src/glmt/sse-parser';

describe('SSEParser', () => {
  it('merges multi-line data fields into one JSON payload', () => {
    const parser = new SSEParser({ throwOnMalformedJson: true });
    const events = parser.parse(
      [
        'event: message',
        'data: {"choices":[',
        'data: {"delta":{"content":"Hello"}}',
        'data: ]}',
        '',
        '',
      ].join('\n')
    );

    expect(events).toHaveLength(1);
    expect(
      (events[0]?.data as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]
        ?.delta?.content
    ).toBe('Hello');
  });

  it('keeps incomplete events buffered until the separator arrives', () => {
    const parser = new SSEParser({ throwOnMalformedJson: true });
    expect(parser.parse('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toEqual([]);
    const events = parser.parse('\n\n');

    expect(events).toHaveLength(1);
    expect(
      (events[0]?.data as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]
        ?.delta?.content
    ).toBe('Hi');
  });

  it('accepts standalone carriage-return line endings', () => {
    const parser = new SSEParser({ throwOnMalformedJson: true });
    const events = parser.parse(
      ['event: message', 'data: {"choices":[{"delta":{"content":"Legacy"}}]}', '', ''].join('\r')
    );

    expect(events).toHaveLength(1);
    expect(
      (events[0]?.data as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]
        ?.delta?.content
    ).toBe('Legacy');
  });


  it('does not split events when CRLF is split across chunks', () => {
    const parser = new SSEParser({ throwOnMalformedJson: true });

    expect(parser.parse('data: {"choices":[\r')).toEqual([]);
    const events = parser.parse('\ndata: {"delta":{"content":"Hello"}}\r\ndata: ]}\r\n\r\n');

    expect(events).toHaveLength(1);
    expect(
      (events[0]?.data as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]
        ?.delta?.content
    ).toBe('Hello');
  });
});
