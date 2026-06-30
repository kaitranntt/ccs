import { describe, expect, it } from 'bun:test';
import { createAnthropicProxyResponse } from '../../../../src/proxy/transformers/sse-stream-transformer';

describe('proxy SSE stream transformer', () => {
  it('converts OpenAI JSON into Anthropic message JSON', async () => {
    const response = new Response(
      JSON.stringify({
        id: 'chatcmpl_1',
        model: 'claude-sonnet-4.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Here is the result.',
              reasoning_content: 'Need to call the tool first.',
              tool_calls: [
                {
                  id: 'toolu_2',
                  type: 'function',
                  function: { name: 'search', arguments: '{"q":"proxy"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const transformed = await createAnthropicProxyResponse(response);
    const body = (await transformed.json()) as {
      type: string;
      stop_reason: string;
      content: Array<{ type: string; thinking?: string; name?: string }>;
    };

    expect(body.type).toBe('message');
    expect(body.stop_reason).toBe('tool_use');
    expect(body.content.map((block) => block.type)).toEqual(['thinking', 'text', 'tool_use']);
    expect(body.content[0]?.thinking).toContain('Need to call the tool first');
    expect(body.content[2]?.name).toBe('search');
  });

  it('converts OpenAI SSE chunks into Anthropic SSE events', async () => {
    const openAISse = [
      'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","created":1,"model":"claude-sonnet-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","created":1,"model":"claude-sonnet-4.5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const transformed = await createAnthropicProxyResponse(
      new Response(openAISse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const body = await transformed.text();
    expect(body).toContain('event: message_start');
    expect(body).toContain('event: content_block_start');
    expect(body).toContain('"type":"text_delta"');
    expect(body).toContain('event: message_stop');
  });

  // Helper: extract all JSON `data:` payloads from an Anthropic SSE response body,
  // skipping the `[DONE]` sentinel and any non-JSON lines.
  function parseSseDataEvents(text: string): Record<string, unknown>[] {
    const events: Record<string, unknown>[] = [];
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice('data: '.length).trim();
      if (raw.length === 0 || raw === '[DONE]') continue;
      try {
        events.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // skip non-JSON data lines
      }
    }
    return events;
  }

  it('emits thinking.signature as a non-empty string — JSON (Anthropic contract)', async () => {
    // Anthropic requires a thinking block's `signature` to be a non-empty opaque
    // STRING. This test asserts that contract; it is intentionally RED on the
    // current code, which fabricates the signature as an object via
    // generateThinkingSignature(). After the fix it becomes a regression guard.
    const response = new Response(
      JSON.stringify({
        id: 'chatcmpl_sig_json',
        model: 'gpt-5.x',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Final answer.',
              reasoning_content: 'Step-by-step reasoning before answering.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const transformed = await createAnthropicProxyResponse(response);
    const body = (await transformed.json()) as {
      content: Array<{ type: string; signature?: unknown }>;
    };

    const thinkingBlock = body.content.find((block) => block.type === 'thinking');
    expect(
      thinkingBlock,
      `no thinking block found; content = ${JSON.stringify(body.content)}`
    ).toBeDefined();

    const signature = thinkingBlock?.signature;
    expect(
      typeof signature,
      `expected non-empty string signature, received ${JSON.stringify(signature)}`
    ).toBe('string');
    expect((signature as string).length).toBeGreaterThan(0);
  });

  it('emits thinking signature as a non-empty string — SSE (Anthropic contract)', async () => {
    // Streaming counterpart of the contract test above: mirrors the failed
    // prod path where reasoning_content streams in and ccs closes the thinking
    // block with a fabricated signature via createSignatureDeltaEvent().
    const openAISse = [
      'data: {"id":"chatcmpl_sig_stream","object":"chat.completion.chunk","created":1,"model":"gpt-5.x","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Planning the verification step by step."},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_sig_stream","object":"chat.completion.chunk","created":1,"model":"gpt-5.x","choices":[{"index":0,"delta":{"content":"Final answer."},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_sig_stream","object":"chat.completion.chunk","created":1,"model":"gpt-5.x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const transformed = await createAnthropicProxyResponse(
      new Response(openAISse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const body = await transformed.text();
    const payloads = parseSseDataEvents(body);

    // ccs emits the thinking signature through createSignatureDeltaEvent,
    // which produces a content_block_delta with delta.type === 'thinking_signature_delta'.
    const signatureDelta = payloads.find((payload) => {
      const delta = (payload as { delta?: { type?: string } }).delta;
      return delta?.type === 'thinking_signature_delta';
    });
    expect(
      signatureDelta,
      `no thinking_signature_delta event in stream; payloads = ${JSON.stringify(payloads)}`
    ).toBeDefined();

    const signature = (signatureDelta as { delta?: { signature?: unknown } }).delta?.signature;
    // Anthropic contract: streaming thinking signature MUST be a non-empty opaque string.
    expect(
      typeof signature,
      `expected non-empty string signature, received ${JSON.stringify(signature)}`
    ).toBe('string');
    expect((signature as string).length).toBeGreaterThan(0);
  });
});
