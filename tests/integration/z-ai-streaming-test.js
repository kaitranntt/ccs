#!/usr/bin/env node
'use strict';

const https = require('https');

const API_KEY = process.env.Z_AI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const MODEL = 'GLM-4.6';

if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.log('[SKIP] Z.AI API key not found');
  console.log('[INFO] Set Z_AI_API_KEY or ANTHROPIC_AUTH_TOKEN to run this external smoke test');
  process.exit(0);
}

// Test request with reasoning
const requestBody = JSON.stringify({
  model: MODEL,
  messages: [
    {
      role: 'user',
      content:
        'Solve this math problem step by step: What is 27 * 453? Show your reasoning process.',
    },
  ],
  stream: true,
  reasoning: true,
  reasoning_effort: 'medium',
  max_tokens: 4096,
  do_sample: true,
});

const options = {
  hostname: 'api.z.ai',
  port: 443,
  path: '/api/coding/paas/v4/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
    'Content-Length': Buffer.byteLength(requestBody),
    'User-Agent': 'CCS-GLMT-StreamingTest/1.0',
  },
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('Z.AI STREAMING BEHAVIOR TEST');
console.log('═══════════════════════════════════════════════════════════════');
console.log('[TEST] Initiating streaming request to Z.AI');
console.log('[TEST] Model:', MODEL);
console.log('[TEST] Stream: true');
console.log('[TEST] Reasoning: true');
console.log('[TEST] Reasoning Effort: medium');
console.log('[TEST] API Key:', API_KEY.substring(0, 10) + '...');
console.log('');

const startTime = Date.now();
let firstByteTime = null;

const req = https.request(options, (res) => {
  console.log('[HTTP] Status:', res.statusCode);
  console.log('[HTTP] Content-Type:', res.headers['content-type']);
  console.log('');

  if (res.statusCode !== 200) {
    let errorBody = '';
    res.on('data', (chunk) => (errorBody += chunk));
    res.on('end', () => {
      console.error('[ERROR] Request failed:', res.statusCode, res.statusMessage);
      console.error('[ERROR] Response:', errorBody);
      process.exit(1);
    });
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SSE EVENTS (analyzing streaming behavior)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let buffer = '';
  let eventCount = 0;
  let reasoningEventCount = 0;
  let reasoningInDelta = false;
  let reasoningInMessage = false;
  let totalReasoningChunks = [];
  let textEventCount = 0;

  res.on('data', (chunk) => {
    if (!firstByteTime) {
      firstByteTime = Date.now();
      console.log('[TIMING] Time to first byte:', firstByteTime - startTime, 'ms');
      console.log('');
    }

    buffer += chunk.toString();
    const lines = buffer.split('\n');

    // Keep incomplete line in buffer
    buffer = lines.pop() || '';

    lines.forEach((line) => {
      if (line.startsWith('data: ')) {
        eventCount++;
        const data = line.substring(6);

        if (data === '[DONE]') {
          console.log(`[EVENT ${eventCount}] [DONE]`);
          console.log('');
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          const message = choice?.message;

          // Check for reasoning_content in delta
          if (delta?.reasoning_content) {
            reasoningInDelta = true;
            reasoningEventCount++;
            totalReasoningChunks.push(delta.reasoning_content);

            console.log(`[EVENT ${eventCount}] *** REASONING IN DELTA ***`);
            console.log('  Delta keys:', Object.keys(delta).join(', '));
            console.log('  Reasoning chunk length:', delta.reasoning_content.length);
            console.log(
              '  Reasoning chunk preview:',
              JSON.stringify(delta.reasoning_content.substring(0, 80))
            );
            console.log('');
          }

          // Check for reasoning_content in message (complete)
          if (message?.reasoning_content) {
            reasoningInMessage = true;
            console.log(`[EVENT ${eventCount}] *** REASONING IN MESSAGE (COMPLETE) ***`);
            console.log('  Message keys:', Object.keys(message).join(', '));
            console.log('  Reasoning total length:', message.reasoning_content.length);
            console.log(
              '  Reasoning preview:',
              message.reasoning_content.substring(0, 100).replace(/\n/g, ' ')
            );
            console.log('');
          }

          // Check for text content in delta
          if (delta?.content) {
            textEventCount++;
            if (textEventCount <= 3 || eventCount % 10 === 0) {
              console.log(`[EVENT ${eventCount}] Text delta`);
              console.log('  Content:', JSON.stringify(delta.content));
              console.log('');
            }
          }

          // Show finish_reason
          if (choice?.finish_reason) {
            console.log(`[EVENT ${eventCount}] Finish reason: ${choice.finish_reason}`);
            console.log('');
          }

          // Show usage stats
          if (parsed.usage) {
            console.log(`[EVENT ${eventCount}] Usage:`, JSON.stringify(parsed.usage));
            console.log('');
          }
        } catch (e) {
          console.log(`[EVENT ${eventCount}] [PARSE ERROR]`, e.message);
          console.log('  Raw:', data.substring(0, 100));
          console.log('');
        }
      }
    });
  });

  res.on('end', () => {
    const totalTime = Date.now() - startTime;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('[TIMING]');
    console.log('  Time to first byte:', firstByteTime - startTime, 'ms');
    console.log('  Total duration:', totalTime, 'ms');
    console.log('');
    console.log('[EVENTS]');
    console.log('  Total events:', eventCount);
    console.log('  Text content events:', textEventCount);
    console.log('  Reasoning events:', reasoningEventCount);
    console.log('');
    console.log('[REASONING BEHAVIOR]');
    console.log('  Reasoning in delta (incremental):', reasoningInDelta);
    console.log('  Reasoning in message (complete):', reasoningInMessage);
    if (totalReasoningChunks.length > 0) {
      const totalReasoningLength = totalReasoningChunks.join('').length;
      console.log('  Total reasoning chunks:', totalReasoningChunks.length);
      console.log('  Total reasoning length:', totalReasoningLength);
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SCENARIO DETERMINATION');
    console.log('═══════════════════════════════════════════════════════════════');

    if (reasoningInDelta) {
      console.log('');
      console.log('[✓] SCENARIO A: Incremental Streaming');
      console.log('    reasoning_content appears in delta objects');
      console.log('    Multiple events contain reasoning chunks');
      console.log('    RECOMMENDATION: Proceed with full streaming implementation');
    } else if (reasoningInMessage) {
      console.log('');
      console.log('[!] SCENARIO B: Complete at End');
      console.log('    reasoning_content only in final message object');
      console.log('    No intermediate reasoning chunks');
      console.log('    RECOMMENDATION: Hybrid streaming (text streams, reasoning buffered)');
    } else {
      console.log('');
      console.log('[X] SCENARIO C: No Streaming Support');
      console.log('    No reasoning_content in streaming mode');
      console.log('    RECOMMENDATION: Keep buffered mode only');
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
  });
});

req.on('error', (error) => {
  console.error('[ERROR]', error.message);
  process.exit(1);
});

req.write(requestBody);
req.end();
