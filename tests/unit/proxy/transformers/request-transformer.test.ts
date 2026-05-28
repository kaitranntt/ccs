import { describe, expect, it } from 'bun:test';
import { ProxyRequestTransformer } from '../../../../src/proxy/transformers/request-transformer';

describe('ProxyRequestTransformer', () => {
  it('translates Anthropic messages into OpenAI-compatible chat payloads', () => {
    const transformer = new ProxyRequestTransformer();
    const result = transformer.transform({
      model: 'claude-sonnet-4.5',
      stream: true,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Find release notes' }] },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'search', input: { q: 'release' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'v7.69.1' }],
        },
      ],
      thinking: { type: 'enabled', budget_tokens: 9000 },
      max_tokens: 1024,
      temperature: 0.2,
      top_p: 0.9,
      stop_sequences: ['STOP'],
      metadata: { trace: 'abc' },
    });

    expect(result.stream).toBe(true);
    expect(result.reasoning_effort).toBe('high');
    expect(result.reasoning).toBeUndefined();
    expect(result.max_tokens).toBe(1024);
    expect(result.temperature).toBe(0.2);
    expect(result.top_p).toBe(0.9);
    expect(result.stop).toEqual(['STOP']);
    expect(result.metadata).toEqual({ trace: 'abc' });
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Find release notes' });
    expect(result.messages[1]?.tool_calls?.[0]?.function.name).toBe('search');
    expect(result.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_1',
      content: 'v7.69.1',
    });
  });

  it('accepts Claude Code system messages in the messages array', () => {
    const transformer = new ProxyRequestTransformer();
    const result = transformer.transform({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'system', content: [{ type: 'text', text: 'answer tersely' }] },
        { role: 'user', content: 'which model is this?' },
      ],
    });

    expect(result.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'system', content: 'answer tersely' },
      { role: 'user', content: 'which model is this?' },
    ]);
  });

  it('translates base64 image blocks into OpenAI image_url parts', () => {
    const transformer = new ProxyRequestTransformer();
    const result = transformer.transform({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'ZmFrZS1pbWFnZS1ieXRlcw==',
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==',
            },
          },
        ],
      },
    ]);
  });

  it('drops malformed optional fields but preserves the translated core request', () => {
    const transformer = new ProxyRequestTransformer();
    const result = transformer.transform({
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 'bad',
      temperature: 'bad',
      top_p: 'bad',
      stop_sequences: ['A', 1],
      metadata: 'bad',
    });

    expect(result.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(result.max_tokens).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.top_p).toBeUndefined();
    expect(result.stop).toEqual(['A']);
    expect(result.metadata).toBeUndefined();
  });
});
