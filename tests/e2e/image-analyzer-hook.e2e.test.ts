/**
 * E2E Tests for Image Analyzer Hook
 *
 * ⚠️  NOT RUN IN NORMAL CI/CD - This is an E2E test file (.e2e.ts)
 *
 * Run manually with: bun test tests/integration/hooks/image-analyzer-hook.e2e.ts --bail
 *
 * Tests the image-analyzer-transformer.cjs hook with:
 * - Generated test fixtures with predictable content
 * - Mock CLIProxy server for reliable, fast tests
 * - Direct hook invocation via stdin
 *
 * Uses a mock HTTP server that returns predictable responses to verify
 * the hook correctly formats requests and parses responses.
 *
 * Use --bail flag to exit on first failure (recommended for long tests).
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const HOOK_PATH = path.join(__dirname, '../../lib/hooks/image-analyzer-transformer.cjs');
const TEST_DIR = '/tmp/ccs-hook-tests';
const MOCK_PORT = 59876; // Use a unique port for mock server
const CLIPROXY_API_KEY = 'test-api-key-12345';

// Default provider models for testing (matches DEFAULT_IMAGE_ANALYSIS_CONFIG)
const DEFAULT_PROVIDER_MODELS = 'agy:gemini-2.5-flash,gemini:gemini-2.5-flash,codex:gpt-5.1-codex-mini,kiro:kiro-claude-haiku-4-5,ghcp:claude-haiku-4.5,claude:claude-haiku-4-5-20251001';
const DEFAULT_PROVIDER = 'agy'; // Default test provider

// ============================================================================
// MOCK SERVER
// ============================================================================

interface MockServerRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

let mockServer: http.Server | null = null;
let lastRequest: MockServerRequest | null = null;
let mockResponse: { content: string; statusCode: number } = {
  content: 'This is a test image showing a red pixel.',
  statusCode: 200,
};

/**
 * Start mock CLIProxy server
 */
function startMockServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer((req, res) => {
      // Health check endpoint - always return 200
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        // Capture request for verification
        lastRequest = {
          method: req.method || 'GET',
          path: req.url || '/',
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        };

        // Return mock response in Anthropic format
        if (mockResponse.statusCode !== 200) {
          res.writeHead(mockResponse.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Mock error' } }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            content: [{ type: 'text', text: mockResponse.content }],
          })
        );
      });
    });

    mockServer.on('error', reject);
    mockServer.listen(MOCK_PORT, '127.0.0.1', () => {
      resolve();
    });
  });
}

/**
 * Stop mock CLIProxy server
 */
function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => {
        mockServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Reset mock server state between tests
 */
function resetMockState(): void {
  lastRequest = null;
  mockResponse = {
    content: 'This is a test image showing a red pixel.',
    statusCode: 200,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Invoke the hook with JSON input
 */
function invokeHook(
  input: object,
  env: Record<string, string> = {}
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      CCS_CLIPROXY_API_KEY: CLIPROXY_API_KEY,
      CCS_CLIPROXY_PORT: String(MOCK_PORT),
      // Default provider config for tests (can be overridden)
      CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: DEFAULT_PROVIDER_MODELS,
      CCS_CURRENT_PROVIDER: DEFAULT_PROVIDER,
      ...env,
    },
    timeout: 10000, // 10 second timeout per test
  });

  return {
    code: result.status ?? -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Create a minimal valid PNG file (1x1 red pixel)
 */
function createTestPng(filepath: string): void {
  // 1x1 PNG with a red pixel (RGB: 255, 0, 0)
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk (red pixel)
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
    0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(filepath, png);
}

/**
 * Create a minimal valid JPEG file
 */
function createTestJpeg(filepath: string): void {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14,
    0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
  ]);
  fs.writeFileSync(filepath, jpeg);
}

/**
 * Create a test text file
 */
function createTestTextFile(filepath: string, content: string): void {
  fs.writeFileSync(filepath, content, 'utf8');
}

/**
 * Create a large file exceeding 10MB
 */
function createLargeFile(filepath: string, sizeMB: number): void {
  const bufferSize = 1024 * 1024; // 1MB
  const totalBuffers = sizeMB;
  const buffer = Buffer.alloc(bufferSize, 'A');
  const stream = fs.createWriteStream(filepath);

  for (let i = 0; i < totalBuffers; i++) {
    stream.write(buffer);
  }
  stream.end();
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Image Analyzer Hook', () => {
  let testPngPath: string;
  let testJpegPath: string;
  let testTextPath: string;

  beforeAll(async () => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Start mock server
    await startMockServer();
    console.log(`[Test Setup] Mock CLIProxy started on port ${MOCK_PORT}`);

    // Create test files
    testPngPath = path.join(TEST_DIR, 'test-image.png');
    testJpegPath = path.join(TEST_DIR, 'test-image.jpg');
    testTextPath = path.join(TEST_DIR, 'test-file.txt');

    createTestPng(testPngPath);
    createTestJpeg(testJpegPath);
    createTestTextFile(testTextPath, 'This is a test file.');
  });

  afterAll(async () => {
    // Stop mock server
    await stopMockServer();

    // Clean up test files
    const filesToClean = [testPngPath, testJpegPath, testTextPath];
    for (const f of filesToClean) {
      if (f && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmdirSync(TEST_DIR);
      } catch {
        // Ignore if not empty
      }
    }
  });

  // ==========================================================================
  // GROUP A: FILE DETECTION AND FILTERING
  // ==========================================================================

  describe('File Detection and Filtering', () => {
    it('should pass through non-Read tools', () => {
      const result = invokeHook({
        tool_name: 'Write',
        tool_input: { file_path: testPngPath, content: 'test' },
      });

      expect(result.code).toBe(0);
    });

    it('should pass through Read tool for non-image files (.txt)', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: testTextPath },
      });

      expect(result.code).toBe(0);
    });

    it('should pass through Read tool for .ts files', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.ts' },
      });

      expect(result.code).toBe(0);
    });

    it('should pass through Read tool for .md files', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.md' },
      });

      expect(result.code).toBe(0);
    });

    it('should pass through Read tool for .json files', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.json' },
      });

      expect(result.code).toBe(0);
    });

    it('should pass through files that do not exist', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/nonexistent-file-12345.png' },
      });

      // Should pass through to let native Read handle the error
      expect(result.code).toBe(0);
    });
  });

  // ==========================================================================
  // GROUP B: ENVIRONMENT VARIABLE CONTROLS
  // ==========================================================================

  describe('Environment Variable Controls', () => {
    it('should skip when CCS_IMAGE_ANALYSIS_SKIP=1', () => {
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_SKIP: '1' }
      );

      expect(result.code).toBe(0);
    });

    it('should skip when CCS_IMAGE_ANALYSIS_ENABLED=0', () => {
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '0' }
      );

      expect(result.code).toBe(0);
    });

    it('should skip for account profile type', () => {
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_PROFILE_TYPE: 'account' }
      );

      expect(result.code).toBe(0);
    });

    it('should skip for default profile type', () => {
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_PROFILE_TYPE: 'default' }
      );

      expect(result.code).toBe(0);
    });
  });

  // ==========================================================================
  // GROUP C: INPUT VALIDATION
  // ==========================================================================

  describe('Input Validation', () => {
    it('should handle missing file_path gracefully', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: {},
      });

      expect(result.code).toBe(0);
    });

    it('should handle empty file_path', () => {
      const result = invokeHook({
        tool_name: 'Read',
        tool_input: { file_path: '' },
      });

      expect(result.code).toBe(0);
    });

    it('should handle malformed JSON input', () => {
      const hookProcess = spawnSync('node', [HOOK_PATH], {
        input: 'not valid json',
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          CCS_CLIPROXY_API_KEY: CLIPROXY_API_KEY,
          CCS_CLIPROXY_PORT: String(MOCK_PORT),
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: DEFAULT_PROVIDER_MODELS,
          CCS_CURRENT_PROVIDER: DEFAULT_PROVIDER,
        },
      });

      // Should pass through silently (exit 0) — can't determine file type from malformed input
      expect(hookProcess.status).toBe(0);
    });
  });

  // ==========================================================================
  // GROUP D: FILE SIZE LIMITS
  // ==========================================================================

  describe('File Size Limits', () => {
    it('should reject files larger than 10MB', () => {
      // Create 11MB file
      const largePath = path.join(TEST_DIR, 'large-test.png');
      createLargeFile(largePath, 11);

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: largePath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      // Should block with error
      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('File too large');

      // Cleanup
      if (fs.existsSync(largePath)) fs.unlinkSync(largePath);
    });
  });

  // ==========================================================================
  // GROUP E: MOCK CLIPROXY INTEGRATION (FAST, RELIABLE)
  // ==========================================================================

  describe('CLIProxy Integration (Mock Server)', () => {
    beforeAll(() => {
      resetMockState();
    });

    it('should block when CLIProxy is unavailable to prevent context overflow', async () => {
      // Force hook to use a port that's definitely not running
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        {
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_PROFILE_TYPE: 'cliproxy',
          CCS_CLIPROXY_PORT: '59999', // Non-existent port
          CCS_DEBUG: '1',
        }
      );

      // Should block (exit 2) when CLIProxy not available to prevent context overflow
      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'CLIProxy unavailable'
      );
    });

    it('should analyze PNG via mock CLIProxy and return analysis', () => {
      resetMockState();
      mockResponse = {
        content: 'This image shows a small red square, likely a single pixel or very minimal graphic.',
        statusCode: 200,
      };

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      // Should block with analysis (exit 2)
      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('red square');
    });

    it('should analyze JPEG via mock CLIProxy', () => {
      resetMockState();
      mockResponse = {
        content: 'A minimalist white image, possibly a blank canvas or placeholder.',
        statusCode: 200,
      };

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testJpegPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('white image');
    });

    it('should include API key in request header', () => {
      resetMockState();

      invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      // Verify API key was sent
      expect(lastRequest).not.toBeNull();
      expect(lastRequest?.headers['x-api-key']).toBe(CLIPROXY_API_KEY);
    });

    it('should send correct request format to CLIProxy', () => {
      resetMockState();

      invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        {
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_PROFILE_TYPE: 'cliproxy',
          CCS_CURRENT_PROVIDER: 'agy',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-flash',
        }
      );

      // Verify request format
      expect(lastRequest).not.toBeNull();
      expect(lastRequest?.method).toBe('POST');
      expect(lastRequest?.path).toBe('/v1/messages');

      const body = lastRequest?.body as {
        model: string;
        max_tokens: number;
        messages: Array<{
          role: string;
          content: Array<{
            type: string;
            text?: string;
            source?: { type: string; media_type: string; data: string };
          }>;
        }>;
      };
      expect(body.model).toBe('gemini-2.5-flash');
      expect(body.max_tokens).toBe(4096);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');

      // Should have text prompt and image content
      const content = body.messages[0].content;
      expect(content.some((c) => c.type === 'text')).toBe(true);
      expect(content.some((c) => c.type === 'image')).toBe(true);

      // Verify image is base64 encoded
      const imageContent = content.find((c) => c.type === 'image');
      expect(imageContent?.source?.type).toBe('base64');
      expect(imageContent?.source?.media_type).toBe('image/png');
      expect(imageContent?.source?.data).toBeDefined();
    });

    it('should use correct media type for JPEG', () => {
      resetMockState();

      invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testJpegPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      const body = lastRequest?.body as {
        messages: Array<{
          content: Array<{
            type: string;
            source?: { media_type: string };
          }>;
        }>;
      };
      const imageContent = body.messages[0].content.find((c) => c.type === 'image');
      expect(imageContent?.source?.media_type).toBe('image/jpeg');
    });

    it('should respect debug mode and output debug messages', () => {
      resetMockState();

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy', CCS_DEBUG: '1' }
      );

      // Should output debug info to stderr
      expect(result.stderr).toContain('[CCS Hook]');
      expect(result.stderr).toContain('Starting image analysis');
    });

    it('should handle API error response gracefully (pass through)', () => {
      resetMockState();
      mockResponse = {
        content: '',
        statusCode: 500,
      };

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      // On API error, hook blocks with error message (exit 2)
      // This ensures Claude knows the analysis failed rather than silently passing through
      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Error');
    });

    it('should use model from provider_models mapping', () => {
      resetMockState();

      invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        {
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_PROFILE_TYPE: 'cliproxy',
          CCS_CURRENT_PROVIDER: 'codex',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'codex:gpt-5.1-codex-mini,agy:gemini-2.5-flash',
        }
      );

      const body = lastRequest?.body as { model: string };
      expect(body.model).toBe('gpt-5.1-codex-mini'); // Model from provider_models
    });

    it('should skip when provider is not in provider_models', () => {
      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        {
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_PROFILE_TYPE: 'cliproxy',
          CCS_CURRENT_PROVIDER: 'unknown-provider',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-flash',
        }
      );

      expect(result.code).toBe(0); // Skip - provider not in map
    });
  });

  // ==========================================================================
  // GROUP F: OUTPUT FORMAT VALIDATION
  // ==========================================================================

  describe('Output Format Validation', () => {
    it('should output valid JSON structure on success', () => {
      resetMockState();

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);

      // Validate structure
      expect(output.decision).toBe('block');
      expect(output.reason).toBeDefined();
      expect(output.systemMessage).toBeDefined();
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toBeDefined();
    });

    it('should include filename in output', () => {
      resetMockState();

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('test-image.png');
    });

    it('should include model name in output', () => {
      resetMockState();

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: testPngPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('gemini-2.5-flash');
    });

    it('should output valid JSON structure on file read error', () => {
      // Create and immediately delete file to trigger error
      const errorPath = path.join(TEST_DIR, 'error-test.png');
      createTestPng(errorPath);

      // Make file unreadable (simulate permission error)
      fs.chmodSync(errorPath, 0o000);

      const result = invokeHook(
        {
          tool_name: 'Read',
          tool_input: { file_path: errorPath },
        },
        { CCS_IMAGE_ANALYSIS_ENABLED: '1', CCS_PROFILE_TYPE: 'cliproxy' }
      );

      // Restore permissions and cleanup
      fs.chmodSync(errorPath, 0o644);
      fs.unlinkSync(errorPath);

      // Should output error in JSON format
      expect(result.code).toBe(2);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe('block');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Error');
    });
  });
});
