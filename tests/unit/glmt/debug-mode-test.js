#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const GlmtTransformer = require('../../../dist/glmt/glmt-transformer').default;

/**
 * Manual test for debug mode file logging
 */

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-debug-mode-test-'));
const logDir = path.join(testRoot, 'logs');

process.on('exit', () => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

// Clean up any existing logs
console.log('Cleaning up existing logs...');
if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
}

console.log('\n=== Test 1: Debug Mode OFF (default) ===');
{
  const transformer = new GlmtTransformer({ verbose: false, debugLogDir: logDir });
  console.log(`Debug logging: ${transformer.debugLog}`);

  const input = {
    model: 'claude-sonnet-4.5',
    messages: [{ role: 'user', content: 'Test without debug' }],
  };

  const { openaiRequest } = transformer.transformRequest(input);

  const openaiResponse = {
    id: 'test-1',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Response without debug',
          reasoning_content: 'Some reasoning...',
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };

  transformer.transformResponse(openaiResponse, {});

  // Check that no logs were created
  const logExists = fs.existsSync(logDir);
  console.log(`Log directory exists: ${logExists}`);
  if (logExists) {
    console.log('ERROR: Logs created when debug mode is OFF!');
    process.exit(1);
  } else {
    console.log('✓ No logs created (correct)');
  }
}

console.log('\n=== Test 2: Debug Mode ON (via config) ===');
{
  const transformer = new GlmtTransformer({ verbose: true, debugLog: true, debugLogDir: logDir });
  console.log(`Debug logging: ${transformer.debugLog}`);
  console.log(`Log directory: ${transformer.debugLogDir}`);

  const input = {
    model: 'claude-sonnet-4.5',
    messages: [{ role: 'user', content: 'Test with debug' }],
  };

  const { openaiRequest } = transformer.transformRequest(input);

  const openaiResponse = {
    id: 'test-2',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Response with debug',
          reasoning_content: 'Detailed reasoning process for debugging...',
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };

  transformer.transformResponse(openaiResponse, {});

  // Check that logs were created
  const logExists = fs.existsSync(logDir);
  console.log(`\nLog directory exists: ${logExists}`);

  if (!logExists) {
    console.log('ERROR: No logs created when debug mode is ON!');
    process.exit(1);
  }

  const files = fs.readdirSync(logDir);
  console.log(`Files created: ${files.length}`);
  console.log(`Files:`, files);

  if (files.length !== 4) {
    console.log(`ERROR: Expected 4 files, got ${files.length}`);
    process.exit(1);
  }

  // Check file names
  const hasRequestAnthropic = files.some((f) => f.includes('request-anthropic'));
  const hasRequestOpenai = files.some((f) => f.includes('request-openai'));
  const hasResponseOpenai = files.some((f) => f.includes('response-openai'));
  const hasResponseAnthropic = files.some((f) => f.includes('response-anthropic'));

  console.log(`\nFile types found:`);
  console.log(`  request-anthropic: ${hasRequestAnthropic ? '✓' : '✗'}`);
  console.log(`  request-openai: ${hasRequestOpenai ? '✓' : '✗'}`);
  console.log(`  response-openai: ${hasResponseOpenai ? '✓' : '✗'}`);
  console.log(`  response-anthropic: ${hasResponseAnthropic ? '✓' : '✗'}`);

  if (!hasRequestAnthropic || !hasRequestOpenai || !hasResponseOpenai || !hasResponseAnthropic) {
    console.log('ERROR: Missing expected file types!');
    process.exit(1);
  }

  // Check file contents
  const responseOpenaiFile = files.find((f) => f.includes('response-openai'));
  const responseOpenaiPath = path.join(logDir, responseOpenaiFile);
  const responseOpenaiData = JSON.parse(fs.readFileSync(responseOpenaiPath, 'utf8'));

  console.log(`\nChecking response-openai.json for reasoning_content...`);
  if (responseOpenaiData.choices[0].message.reasoning_content) {
    console.log('✓ reasoning_content found in response-openai.json');
    console.log(
      `  Length: ${responseOpenaiData.choices[0].message.reasoning_content.length} chars`
    );
  } else {
    console.log('ERROR: reasoning_content NOT found in response-openai.json!');
    process.exit(1);
  }

  const responseAnthropicFile = files.find((f) => f.includes('response-anthropic'));
  const responseAnthropicPath = path.join(logDir, responseAnthropicFile);
  const responseAnthropicData = JSON.parse(fs.readFileSync(responseAnthropicPath, 'utf8'));

  console.log(`\nChecking response-anthropic.json for thinking block...`);
  const thinkingBlock = responseAnthropicData.content.find((b) => b.type === 'thinking');
  if (thinkingBlock) {
    console.log('✓ Thinking block found in response-anthropic.json');
    console.log(`  Length: ${thinkingBlock.thinking.length} chars`);
  } else {
    console.log('ERROR: Thinking block NOT found in response-anthropic.json!');
    process.exit(1);
  }

  console.log('\n✓ All checks passed for debug mode ON');
}

console.log('\n=== Test 3: Debug Mode via CCS_DEBUG=1 ===');
{
  // Clean up
  fs.rmSync(logDir, { recursive: true, force: true });

  process.env.CCS_DEBUG = '1';
  const transformer = new GlmtTransformer({ verbose: false, debugLogDir: logDir });
  console.log(`Debug logging: ${transformer.debugLog}`);

  const input = {
    model: 'claude-sonnet-4.5',
    messages: [{ role: 'user', content: 'Test with env var' }],
  };

  transformer.transformRequest(input);

  const openaiResponse = {
    id: 'test-3',
    model: 'GLM-4.6',
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Response',
          reasoning_content: 'Reasoning...',
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };

  transformer.transformResponse(openaiResponse, {});

  const files = fs.readdirSync(logDir);
  console.log(`Files created: ${files.length}`);

  if (files.length === 4) {
    console.log('✓ Debug mode enabled via CCS_DEBUG=1');
  } else {
    console.log(`ERROR: Expected 4 files, got ${files.length}`);
    process.exit(1);
  }

  delete process.env.CCS_DEBUG;
}

console.log('\n=== Test 4: Error Handling (No Write Permission) ===');
{
  // Create a read-only directory to test error handling
  const readOnlyDir = path.join(os.tmpdir(), 'ccs-readonly-test');
  if (fs.existsSync(readOnlyDir)) {
    fs.chmodSync(readOnlyDir, 0o755);
    fs.rmSync(readOnlyDir, { recursive: true, force: true });
  }
  fs.mkdirSync(readOnlyDir, { recursive: true });
  fs.chmodSync(readOnlyDir, 0o444); // Read-only

  const transformer = new GlmtTransformer({
    debugLog: true,
    debugLogDir: readOnlyDir,
    verbose: false,
  });

  console.log('Testing graceful error handling with read-only directory...');

  const input = {
    model: 'claude-sonnet-4.5',
    messages: [{ role: 'user', content: 'Test error handling' }],
  };

  try {
    transformer.transformRequest(input);
    console.log('✓ No crash on write error (graceful handling)');
  } catch (error) {
    console.log('ERROR: Transformer crashed on write error!');
    console.log(error);
    process.exit(1);
  } finally {
    // Clean up
    fs.chmodSync(readOnlyDir, 0o755);
    fs.rmSync(readOnlyDir, { recursive: true, force: true });
  }
}

// Clean up test logs
console.log('\n=== Cleaning up test logs ===');
if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
  console.log(`Removed ${logDir}`);
}

console.log('\n=== ALL TESTS PASSED ===');
