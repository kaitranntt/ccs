#!/usr/bin/env node
'use strict';

const GlmtTransformer = require('../../dist/glmt/glmt-transformer').default;
const { DeltaAccumulator } = require('../../dist/glmt/delta-accumulator');

/**
 * Token Counting Validation Tests
 *
 * Verifies:
 * 1. message_delta includes both input_tokens and output_tokens
 * 2. Token counts with simple prompts (no tools)
 * 3. Token counts with tool calls
 * 4. Token counts with thinking blocks + tools
 * 5. Deferred finalization waits for usage data
 * 6. Finalization happens when BOTH finish_reason AND usage are received
 * 7. Graceful degradation if usage never arrives
 * 8. No regressions in existing features
 */

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n=== Token Counting Validation Tests ===\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✓ ${name}`);
        this.passed++;
      } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        if (error.stack) {
          console.error(`  Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`);
        }
        this.failed++;
      }
    }

    console.log(`\n=== Results ===`);
    console.log(`Passed: ${this.passed}/${this.tests.length}`);
    console.log(`Failed: ${this.failed}/${this.tests.length}`);

    return this.failed === 0;
  }
}

// Assertion helpers
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}\n` +
        `  Expected: ${JSON.stringify(expected)}\n` +
        `  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message || 'Expected true');
  }
}

function assertExists(value, message) {
  if (value === undefined || value === null) {
    throw new Error(message || 'Value should exist');
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(
      `${message || 'Deep equality failed'}\n` +
        `  Expected: ${expectedStr}\n` +
        `  Actual: ${actualStr}`
    );
  }
}

const runner = new TestRunner();

// ========================================
// Test 1: message_delta includes input_tokens and output_tokens
// ========================================
runner.test('message_delta includes both input_tokens and output_tokens', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();

  // Simulate usage data
  accumulator.updateUsage({
    prompt_tokens: 150,
    completion_tokens: 75,
  });
  accumulator.finishReason = 'stop';

  const events = transformer.finalizeDelta(accumulator);

  // Find message_delta event
  const messageDelta = events.find((e) => e.event === 'message_delta');
  assertExists(messageDelta, 'message_delta event should exist');
  assertExists(messageDelta.data.usage, 'usage should exist in message_delta');
  assertEqual(messageDelta.data.usage.input_tokens, 150, 'input_tokens should be 150');
  assertEqual(messageDelta.data.usage.output_tokens, 75, 'output_tokens should be 75');
});

// ========================================
// Test 2: Token counting with simple prompts (no tools)
// ========================================
runner.test('token counting with simple prompt (no tools)', () => {
  const transformer = new GlmtTransformer();
  const openaiResponse = {
    id: 'chatcmpl-123',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Simple response',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };

  const result = transformer.transformResponse(openaiResponse, {});

  assertExists(result.usage, 'usage should exist');
  assertEqual(result.usage.input_tokens, 10, 'input_tokens should be 10');
  assertEqual(result.usage.output_tokens, 5, 'output_tokens should be 5');
});

// ========================================
// Test 3: Token counting with tool calls
// ========================================
runner.test('token counting with tool calls', () => {
  const transformer = new GlmtTransformer();
  const openaiResponse = {
    id: 'chatcmpl-456',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"London"}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 25,
      total_tokens: 75,
    },
  };

  const result = transformer.transformResponse(openaiResponse, {});

  assertExists(result.usage, 'usage should exist');
  assertEqual(result.usage.input_tokens, 50, 'input_tokens should be 50');
  assertEqual(result.usage.output_tokens, 25, 'output_tokens should be 25');
  assertEqual(result.stop_reason, 'tool_use', 'stop_reason should be tool_use');
  assertTrue(
    result.content.some((b) => b.type === 'tool_use'),
    'should have tool_use block'
  );
});

// ========================================
// Test 4: Token counting with thinking blocks + tools
// ========================================
runner.test('token counting with thinking blocks and tool calls', () => {
  const transformer = new GlmtTransformer();
  const openaiResponse = {
    id: 'chatcmpl-789',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          reasoning_content: 'Let me analyze this request...',
          content: 'I need to call a tool',
          tool_calls: [
            {
              id: 'call_2',
              type: 'function',
              function: {
                name: 'calculate',
                arguments: '{"expression":"2+2"}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 80,
      total_tokens: 180,
    },
  };

  const result = transformer.transformResponse(openaiResponse, {});

  assertExists(result.usage, 'usage should exist');
  assertEqual(result.usage.input_tokens, 100, 'input_tokens should be 100');
  assertEqual(result.usage.output_tokens, 80, 'output_tokens should be 80');
  assertTrue(
    result.content.some((b) => b.type === 'thinking'),
    'should have thinking block'
  );
  assertTrue(
    result.content.some((b) => b.type === 'tool_use'),
    'should have tool_use block'
  );
});

// ========================================
// Test 5: Deferred finalization waits for usage data
// ========================================
runner.test('deferred finalization waits for usage data', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();

  // Simulate finish_reason arriving first
  accumulator.finishReason = 'stop';
  accumulator.messageStarted = true;

  // Usage hasn't arrived yet - should NOT finalize
  assertEqual(accumulator.usageReceived, false, 'usageReceived should be false initially');

  // Simulate transformDelta with finish_reason but no usage
  const openaiEvent1 = {
    event: 'data',
    data: {
      choices: [
        {
          delta: {},
          finish_reason: 'stop',
        },
      ],
    },
  };

  const events1 = transformer.transformDelta(openaiEvent1, accumulator);

  // Should NOT have message_stop event yet
  const hasMessageStop1 = events1.some((e) => e.event === 'message_stop');
  assertEqual(hasMessageStop1, false, 'should NOT finalize without usage');
  assertEqual(accumulator.finalized, false, 'accumulator should NOT be finalized');

  // Now usage arrives
  const openaiEvent2 = {
    event: 'data',
    data: {
      usage: {
        prompt_tokens: 200,
        completion_tokens: 100,
      },
    },
  };

  const events2 = transformer.transformDelta(openaiEvent2, accumulator);

  // Should NOW finalize since we have both finish_reason AND usage
  const hasMessageStop2 = events2.some((e) => e.event === 'message_stop');
  assertEqual(hasMessageStop2, true, 'should finalize when usage arrives');
  assertEqual(accumulator.finalized, true, 'accumulator should be finalized');
  assertEqual(accumulator.usageReceived, true, 'usageReceived should be true');
});

// ========================================
// Test 6: Finalization happens when BOTH finish_reason AND usage received
// ========================================
runner.test('finalization waits for BOTH finish_reason AND usage', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();
  accumulator.messageStarted = true;

  // Test case A: Usage arrives first
  const openaiEvent1 = {
    event: 'data',
    data: {
      usage: {
        prompt_tokens: 50,
        completion_tokens: 30,
      },
    },
  };

  const events1 = transformer.transformDelta(openaiEvent1, accumulator);
  assertEqual(accumulator.usageReceived, true, 'usage should be received');
  assertEqual(accumulator.finalized, false, 'should NOT finalize with only usage');

  // Test case B: finish_reason arrives second
  const openaiEvent2 = {
    event: 'data',
    data: {
      choices: [
        {
          delta: {},
          finish_reason: 'stop',
        },
      ],
    },
  };

  const events2 = transformer.transformDelta(openaiEvent2, accumulator);
  assertEqual(accumulator.finishReason, 'stop', 'finish_reason should be set');
  assertEqual(accumulator.finalized, true, 'should finalize when both present');

  const messageDelta = events2.find((e) => e.event === 'message_delta');
  assertExists(messageDelta, 'message_delta should exist');
  assertEqual(messageDelta.data.usage.input_tokens, 50, 'input_tokens in message_delta');
  assertEqual(messageDelta.data.usage.output_tokens, 30, 'output_tokens in message_delta');
});

// ========================================
// Test 7: Graceful degradation if usage never arrives
// ========================================
runner.test('graceful degradation when usage never arrives', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();
  accumulator.messageStarted = true;

  // finish_reason arrives
  accumulator.finishReason = 'stop';

  // Simulate [DONE] event without usage
  const doneEvent = {
    event: 'done',
  };

  const events = transformer.transformDelta(doneEvent, accumulator);

  // Should finalize with zero tokens (graceful degradation)
  assertEqual(accumulator.finalized, true, 'should finalize on [DONE]');
  const messageDelta = events.find((e) => e.event === 'message_delta');
  assertExists(messageDelta, 'message_delta should exist');
  assertEqual(messageDelta.data.usage.input_tokens, 0, 'input_tokens should be 0');
  assertEqual(messageDelta.data.usage.output_tokens, 0, 'output_tokens should be 0');
});

// ========================================
// Test 8: No regression - thinking blocks still work
// ========================================
runner.test('no regression: thinking blocks still work', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();

  // Start message
  const event1 = {
    event: 'data',
    data: {
      model: 'GLM-4.6',
      choices: [
        {
          delta: { role: 'assistant' },
        },
      ],
    },
  };
  transformer.transformDelta(event1, accumulator);

  // Thinking delta
  const event2 = {
    event: 'data',
    data: {
      choices: [
        {
          delta: {
            reasoning_content: 'Analyzing the problem...',
          },
        },
      ],
    },
  };
  const events2 = transformer.transformDelta(event2, accumulator);

  // Check thinking block was created
  const hasThinkingStart = events2.some(
    (e) => e.event === 'content_block_start' && e.data.content_block.type === 'thinking'
  );
  assertEqual(hasThinkingStart, true, 'thinking block should start');

  const hasThinkingDelta = events2.some(
    (e) => e.event === 'content_block_delta' && e.data.delta.type === 'thinking_delta'
  );
  assertEqual(hasThinkingDelta, true, 'thinking delta should be emitted');
});

// ========================================
// Test 9: No regression - tool calls execute correctly
// ========================================
runner.test('no regression: tool calls execute correctly', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();
  accumulator.messageStarted = true;

  // Tool call delta
  const event = {
    event: 'data',
    data: {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"q":"test"}',
                },
              },
            ],
          },
        },
      ],
    },
  };

  const events = transformer.transformDelta(event, accumulator);

  const toolUseStart = events.find(
    (e) => e.event === 'content_block_start' && e.data.content_block.type === 'tool_use'
  );
  assertExists(toolUseStart, 'tool_use block should start');
  assertEqual(toolUseStart.data.content_block.name, 'search', 'tool name should be search');

  const inputJsonDelta = events.find(
    (e) => e.event === 'content_block_delta' && e.data.delta.type === 'input_json_delta'
  );
  assertExists(inputJsonDelta, 'input_json_delta should be emitted');
});

// ========================================
// Test 10: No regression - streaming still works
// ========================================
runner.test('no regression: streaming still works', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();

  // Message start
  const event1 = {
    event: 'data',
    data: {
      model: 'GLM-4.6',
      choices: [{ delta: { role: 'assistant' } }],
    },
  };
  const events1 = transformer.transformDelta(event1, accumulator);
  assertTrue(
    events1.some((e) => e.event === 'message_start'),
    'message_start event'
  );

  // Text delta
  const event2 = {
    event: 'data',
    data: {
      choices: [{ delta: { content: 'Hello' } }],
    },
  };
  const events2 = transformer.transformDelta(event2, accumulator);
  assertTrue(
    events2.some((e) => e.event === 'content_block_start'),
    'content_block_start'
  );
  assertTrue(
    events2.some((e) => e.event === 'content_block_delta'),
    'content_block_delta'
  );

  // More text
  const event3 = {
    event: 'data',
    data: {
      choices: [{ delta: { content: ' world' } }],
    },
  };
  const events3 = transformer.transformDelta(event3, accumulator);
  const textDelta = events3.find((e) => e.data?.delta?.type === 'text_delta');
  assertExists(textDelta, 'text_delta should exist');
  assertEqual(textDelta.data.delta.text, ' world', 'delta text should be " world"');
});

// ========================================
// Test 11: No regression - buffered mode still works
// ========================================
runner.test('no regression: buffered mode (non-streaming) works', () => {
  const transformer = new GlmtTransformer();

  const openaiResponse = {
    id: 'chatcmpl-buffered',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          reasoning_content: 'Thinking step by step...',
          content: 'Final answer',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 15,
      total_tokens: 35,
    },
  };

  const result = transformer.transformResponse(openaiResponse, {});

  assertEqual(result.type, 'message', 'type should be message');
  assertEqual(result.role, 'assistant', 'role should be assistant');
  assertTrue(
    result.content.some((b) => b.type === 'thinking'),
    'has thinking'
  );
  assertTrue(
    result.content.some((b) => b.type === 'text'),
    'has text'
  );
  assertEqual(result.usage.input_tokens, 20, 'input_tokens');
  assertEqual(result.usage.output_tokens, 15, 'output_tokens');
});

// ========================================
// Test 12: usageReceived flag is set correctly
// ========================================
runner.test('usageReceived flag is set when usage data arrives', () => {
  const accumulator = new DeltaAccumulator();

  assertEqual(accumulator.usageReceived, false, 'initial value should be false');

  accumulator.updateUsage({
    prompt_tokens: 100,
    completion_tokens: 50,
  });

  assertEqual(accumulator.usageReceived, true, 'should be true after updateUsage');
  assertEqual(accumulator.inputTokens, 100, 'inputTokens should be 100');
  assertEqual(accumulator.outputTokens, 50, 'outputTokens should be 50');
});

// ========================================
// Test 13: Double finalization protection
// ========================================
runner.test('double finalization protection works', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();
  accumulator.messageStarted = true;
  accumulator.finishReason = 'stop';
  accumulator.updateUsage({ prompt_tokens: 10, completion_tokens: 5 });

  // First finalization
  const events1 = transformer.finalizeDelta(accumulator);
  assertTrue(events1.length > 0, 'should return events on first finalization');
  assertEqual(accumulator.finalized, true, 'should be finalized');

  // Second finalization attempt
  const events2 = transformer.finalizeDelta(accumulator);
  assertEqual(events2.length, 0, 'should return empty array on second call');
});

// ========================================
// Test 14: Token counts in streaming with thinking + text + tools
// ========================================
runner.test('streaming: token counts with thinking + text + tools', () => {
  const transformer = new GlmtTransformer();
  const accumulator = new DeltaAccumulator();

  // Message start
  transformer.transformDelta(
    {
      event: 'data',
      data: {
        model: 'GLM-4.6',
        choices: [{ delta: { role: 'assistant' } }],
      },
    },
    accumulator
  );

  // Thinking
  transformer.transformDelta(
    {
      event: 'data',
      data: {
        choices: [{ delta: { reasoning_content: 'Thinking...' } }],
      },
    },
    accumulator
  );

  // Text
  transformer.transformDelta(
    {
      event: 'data',
      data: {
        choices: [{ delta: { content: 'Answer' } }],
      },
    },
    accumulator
  );

  // Tool call
  transformer.transformDelta(
    {
      event: 'data',
      data: {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'tool', arguments: '{}' },
                },
              ],
            },
          },
        ],
      },
    },
    accumulator
  );

  // Usage arrives
  transformer.transformDelta(
    {
      event: 'data',
      data: {
        usage: { prompt_tokens: 300, completion_tokens: 200 },
      },
    },
    accumulator
  );

  // finish_reason arrives
  const finalEvents = transformer.transformDelta(
    {
      event: 'data',
      data: {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    },
    accumulator
  );

  // Verify message_delta has correct tokens
  const messageDelta = finalEvents.find((e) => e.event === 'message_delta');
  assertExists(messageDelta, 'message_delta should exist');
  assertEqual(messageDelta.data.usage.input_tokens, 300, 'input_tokens should be 300');
  assertEqual(messageDelta.data.usage.output_tokens, 200, 'output_tokens should be 200');
  assertEqual(messageDelta.data.delta.stop_reason, 'tool_use', 'stop_reason should be tool_use');
});

// Run all tests
runner
  .run()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
