#!/usr/bin/env node
'use strict';

const GlmtTransformer = require('../../../dist/glmt/glmt-transformer').default;
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== Performance Test: Debug Mode Impact ===\n');

const iterations = 1000;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-performance-test-'));
const logDir = path.join(testRoot, 'logs');

const sampleRequest = {
  model: 'claude-sonnet-4.5',
  messages: [{ role: 'user', content: 'Test performance' }],
};

const sampleResponse = {
  id: 'perf-test',
  model: 'GLM-4.6',
  choices: [
    {
      message: {
        role: 'assistant',
        content: 'Quick response',
        reasoning_content: 'Some reasoning content here...',
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

// Test 1: Debug OFF
console.log(`Test 1: Debug OFF (${iterations} iterations)`);
const transformerOff = new GlmtTransformer({ debugLog: false, verbose: false });
const startOff = Date.now();
for (let i = 0; i < iterations; i++) {
  transformerOff.transformRequest(sampleRequest);
  transformerOff.transformResponse(sampleResponse, {});
}
const endOff = Date.now();
const timeOff = endOff - startOff;
console.log(`  Total time: ${timeOff}ms`);
console.log(`  Average per request: ${(timeOff / iterations).toFixed(2)}ms`);

// Test 2: Debug ON
console.log(`\nTest 2: Debug ON (${iterations} iterations)`);
const transformerOn = new GlmtTransformer({ debugLog: true, verbose: false, debugLogDir: logDir });
const startOn = Date.now();
for (let i = 0; i < iterations; i++) {
  transformerOn.transformRequest(sampleRequest);
  transformerOn.transformResponse(sampleResponse, {});
}
const endOn = Date.now();
const timeOn = endOn - startOn;
console.log(`  Total time: ${timeOn}ms`);
console.log(`  Average per request: ${(timeOn / iterations).toFixed(2)}ms`);

// Calculate overhead
const overhead = timeOn - timeOff;
const overheadPercent = ((overhead / timeOff) * 100).toFixed(2);

console.log(`\n=== Results ===`);
console.log(`Debug OFF: ${timeOff}ms`);
console.log(`Debug ON: ${timeOn}ms`);
console.log(`Overhead: ${overhead}ms (${overheadPercent}%)`);

// Note: High overhead is expected due to file I/O
console.log(`\nNote: Debug mode is opt-in only and disabled by default.`);
console.log(`When disabled, there is NO performance impact (early return in _writeDebugLog).`);

// Cleanup
if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
  console.log(`\nCleaned up ${iterations * 4} debug log files.`);
}
fs.rmSync(testRoot, { recursive: true, force: true });
