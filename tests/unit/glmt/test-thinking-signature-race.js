#!/usr/bin/env node
'use strict';

/**
 * Regression test for thinking signature race condition
 * Ensures signature not generated before content accumulated
 *
 * Issue: In streaming mode, thinking blocks appeared in UI but were blank
 * Root cause: _createSignatureDeltaEvent called before block.content accumulated
 * Fix: Guard against empty content, return null if block.content is empty
 */

const GlmtTransformer = require('../../../dist/glmt/glmt-transformer').default;
const { DeltaAccumulator } = require('../../../dist/glmt/delta-accumulator');
const { ResponseBuilder } = require('../../../dist/glmt/pipeline');

const responseBuilder = new ResponseBuilder(false);

// Test runner
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
    console.log('\n=== Thinking Signature Race Condition Tests ===\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✓ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log('\n=== Results ===');
    console.log(`Passed: ${this.passed}/${this.tests.length}`);
    console.log(`Failed: ${this.failed}/${this.tests.length}`);

    process.exit(this.failed > 0 ? 1 : 0);
  }
}

const runner = new TestRunner();

// Helper function for assertions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Signature not generated for empty thinking block
runner.test('Signature not generated for empty thinking block', () => {
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Start thinking block but add no content
  accumulator.messageStarted = true;
  const block = accumulator.startBlock('thinking');

  // Try to generate signature for empty block
  const signatureEvent = responseBuilder.createSignatureDeltaEvent(block);

  // Should return null for empty block (fix for race condition)
  assert(signatureEvent === null, 'Expected null for empty thinking block');
});

// Test 2: Signature generated correctly after content accumulated
runner.test('Signature generated correctly after content accumulated', () => {
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Start thinking block and add content
  accumulator.messageStarted = true;
  const block = accumulator.startBlock('thinking');
  accumulator.addDelta('First thinking delta. ');
  accumulator.addDelta('Second thinking delta.');

  // Generate signature
  const signatureEvent = responseBuilder.createSignatureDeltaEvent(block);

  // Should return valid signature event
  assert(signatureEvent !== null, 'Expected signature event for non-empty block');
  assert(signatureEvent.event === 'content_block_delta', 'Expected content_block_delta event');
  assert(signatureEvent.data.delta.type === 'thinking_signature_delta', 'Expected thinking_signature_delta type');
  assert(typeof signatureEvent.data.delta.signature === 'string', 'Expected signature string');
  assert(signatureEvent.data.delta.signature.length > 0, 'Expected signature length > 0');
});

// Test 3: transformDelta skips signature for empty thinking blocks
runner.test('transformDelta skips signature for empty thinking blocks (thinking→text transition)', () => {
  const transformer = new GlmtTransformer({ verbose: false });
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Simulate thinking block with no content
  accumulator.messageStarted = true;
  const block = accumulator.startBlock('thinking');

  // Transition to text (would normally generate signature)
  const openaiEvent = {
    event: 'message',
    data: {
      choices: [{
        delta: { content: 'Text response after empty thinking' }
      }]
    }
  };

  const events = transformer.transformDelta(openaiEvent, accumulator);

  // Signature event should not be present
  const signatureEvents = events.filter(e =>
    e.data?.delta?.type === 'thinking_signature_delta'
  );
  assert(signatureEvents.length === 0, 'Expected 0 signature events for empty thinking block');

  // Should still have content_block_stop event
  const stopEvents = events.filter(e => e.event === 'content_block_stop');
  assert(stopEvents.length > 0, 'Expected content_block_stop event');
});

// Test 4: transformDelta generates signature for non-empty thinking blocks
runner.test('transformDelta generates signature for non-empty thinking blocks', () => {
  const transformer = new GlmtTransformer({ verbose: false });
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Start thinking block with content
  accumulator.messageStarted = true;
  const block = accumulator.startBlock('thinking');

  // Add reasoning content
  const reasoningEvent = {
    event: 'message',
    data: {
      choices: [{
        delta: { reasoning_content: 'This is actual thinking content. ' }
      }]
    }
  };
  transformer.transformDelta(reasoningEvent, accumulator);

  // Add more content
  const moreReasoningEvent = {
    event: 'message',
    data: {
      choices: [{
        delta: { reasoning_content: 'More thinking here.' }
      }]
    }
  };
  transformer.transformDelta(moreReasoningEvent, accumulator);

  // Now transition to text (should generate signature)
  const textEvent = {
    event: 'message',
    data: {
      choices: [{
        delta: { content: 'Final text response' }
      }]
    }
  };

  const events = transformer.transformDelta(textEvent, accumulator);

  // Signature event should be present
  const signatureEvents = events.filter(e =>
    e.data?.delta?.type === 'thinking_signature_delta'
  );
  assert(signatureEvents.length === 1, 'Expected 1 signature event for non-empty thinking block');

  // Verify signature structure
  const sig = signatureEvents[0].data.delta.signature;
  assert(typeof sig === 'string', 'Expected signature string');
  assert(sig.length > 0, 'Expected signature length > 0');
});

// Test 5: Loop detection handles empty thinking blocks
runner.test('Loop detection handles empty thinking blocks without signature', () => {
  const transformer = new GlmtTransformer({ verbose: false });
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Create scenario where loop is detected with empty thinking block
  accumulator.messageStarted = true;

  // First thinking block (empty)
  accumulator.startBlock('thinking');
  accumulator.stopCurrentBlock();

  // Second thinking block (empty)
  accumulator.startBlock('thinking');
  accumulator.stopCurrentBlock();

  // Third thinking block (empty) - triggers loop
  accumulator.startBlock('thinking');

  // Simulate loop detection in transformDelta
  const openaiEvent = {
    event: 'message',
    data: {
      choices: [{
        delta: { reasoning_content: '' }
      }]
    }
  };

  // This would trigger loop detection logic
  accumulator.checkForLoop(); // Returns true after 3 blocks

  const currentBlock = accumulator.getCurrentBlock();
  if (currentBlock && currentBlock.type === 'thinking') {
    const signatureEvent = responseBuilder.createSignatureDeltaEvent(currentBlock);
    // Should return null for empty block
    assert(signatureEvent === null, 'Expected null signature for empty thinking block during loop detection');
  }
});

// Test 6: finalizeDelta handles empty thinking blocks
runner.test('finalizeDelta handles empty thinking blocks without signature', () => {
  const transformer = new GlmtTransformer({ verbose: false });
  const accumulator = new DeltaAccumulator({ thinking: true });

  // Start thinking block with no content
  accumulator.messageStarted = true;
  accumulator.startBlock('thinking');

  // Finalize (end of message)
  const events = transformer.finalizeDelta(accumulator);

  // Should not include signature event for empty block
  const signatureEvents = events.filter(e =>
    e.data?.delta?.type === 'thinking_signature_delta'
  );
  assert(signatureEvents.length === 0, 'Expected 0 signature events for empty thinking block in finalizeDelta');

  // Should still include content_block_stop
  const stopEvents = events.filter(e => e.event === 'content_block_stop');
  assert(stopEvents.length === 1, 'Expected content_block_stop event in finalizeDelta');
});

// Run all tests
runner.run();
