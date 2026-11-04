/**
 * Unit tests for JSONL Parser
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseUsageEntry,
  parseJsonlFile,
  parseProjectDirectory,
  scanProjectsDirectory,
  findProjectDirectories,
  countJsonlFiles,
  getDefaultProjectsDir,
  type RawUsageEntry,
} from '../../src/web-server/jsonl-parser';
import { getDefaultClaudeConfigDir } from '../../src/utils/claude-config-path';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const VALID_ASSISTANT_ENTRY = JSON.stringify({
  type: 'assistant',
  sessionId: 'test-session-123',
  timestamp: '2025-12-09T10:00:00.000Z',
  version: '2.0.60',
  cwd: '/home/user/project',
  message: {
    model: 'claude-sonnet-4-5',
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
    },
  },
});

const ASSISTANT_ENTRY_NO_CACHE = JSON.stringify({
  type: 'assistant',
  sessionId: 'test-session-456',
  timestamp: '2025-12-09T11:00:00.000Z',
  message: {
    model: 'gemini-2.5-pro',
    usage: {
      input_tokens: 2000,
      output_tokens: 1000,
    },
  },
});

const USER_ENTRY = JSON.stringify({
  type: 'user',
  sessionId: 'test-session-123',
  timestamp: '2025-12-09T09:59:00.000Z',
  message: {
    role: 'user',
    content: 'Hello world',
  },
});

const ASSISTANT_NO_USAGE = JSON.stringify({
  type: 'assistant',
  sessionId: 'test-session-123',
  timestamp: '2025-12-09T10:01:00.000Z',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'response' }],
  },
});

const FILE_HISTORY_ENTRY = JSON.stringify({
  type: 'file-history-snapshot',
  messageId: 'some-uuid',
  snapshot: {},
});

function responseLine(options: {
  sessionId: string;
  messageId: string;
  requestId?: string;
  timestamp?: string;
  inputTokens?: number;
  cacheReadTokens?: number;
  outputTokens?: number;
}): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: options.sessionId,
    requestId: options.requestId,
    timestamp: options.timestamp ?? '2025-12-09T10:00:00.000Z',
    message: {
      id: options.messageId,
      model: 'claude-sonnet-4-5',
      usage: {
        input_tokens: options.inputTokens ?? 2,
        cache_read_input_tokens: options.cacheReadTokens ?? 20000,
        output_tokens: options.outputTokens ?? 400,
      },
    },
  });
}

// ============================================================================
// parseUsageEntry Tests
// ============================================================================

describe('parseUsageEntry', () => {
  test('parses valid assistant entry with full usage data', () => {
    const result = parseUsageEntry(VALID_ASSISTANT_ENTRY, '/home/user/project');

    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(1000);
    expect(result!.outputTokens).toBe(500);
    expect(result!.cacheCreationTokens).toBe(200);
    expect(result!.cacheReadTokens).toBe(100);
    expect(result!.model).toBe('claude-sonnet-4-5');
    expect(result!.sessionId).toBe('test-session-123');
    expect(result!.timestamp).toBe('2025-12-09T10:00:00.000Z');
    expect(result!.version).toBe('2.0.60');
  });

  test('parses assistant entry without cache tokens (defaults to 0)', () => {
    const result = parseUsageEntry(ASSISTANT_ENTRY_NO_CACHE, '/home/user/project');

    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(2000);
    expect(result!.outputTokens).toBe(1000);
    expect(result!.cacheCreationTokens).toBe(0);
    expect(result!.cacheReadTokens).toBe(0);
    expect(result!.model).toBe('gemini-2.5-pro');
  });

  test('returns null for user entries', () => {
    const result = parseUsageEntry(USER_ENTRY, '/home/user/project');
    expect(result).toBeNull();
  });

  test('returns null for assistant entries without usage data', () => {
    const result = parseUsageEntry(ASSISTANT_NO_USAGE, '/home/user/project');
    expect(result).toBeNull();
  });

  test('returns null for file-history-snapshot entries', () => {
    const result = parseUsageEntry(FILE_HISTORY_ENTRY, '/home/user/project');
    expect(result).toBeNull();
  });

  test('returns null for empty lines', () => {
    expect(parseUsageEntry('', '/test')).toBeNull();
    expect(parseUsageEntry('   ', '/test')).toBeNull();
    expect(parseUsageEntry('\n', '/test')).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseUsageEntry('{invalid json}', '/test')).toBeNull();
    expect(parseUsageEntry('not json at all', '/test')).toBeNull();
  });

  test('strips UTF-8 BOM from line before parsing', () => {
    // UTF-8 BOM character (\uFEFF) can appear at start of files
    const bomEntry = '\uFEFF' + VALID_ASSISTANT_ENTRY;
    const result = parseUsageEntry(bomEntry, '/test');

    expect(result).not.toBeNull();
    expect(result!.model).toBe('claude-sonnet-4-5');
    expect(result!.inputTokens).toBe(1000);
  });

  test('includes project path in result', () => {
    const result = parseUsageEntry(VALID_ASSISTANT_ENTRY, '/custom/project/path');
    expect(result!.projectPath).toBe('/home/user/project');
  });

  test('falls back to the decoded project path when cwd is missing', () => {
    const withoutCwd = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      cwd: undefined,
    });

    const result = parseUsageEntry(withoutCwd, '/custom/project/path');
    expect(result!.projectPath).toBe('/custom/project/path');
  });

  test('parses string target when present', () => {
    const withTarget = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      target: 'droid',
    });
    const result = parseUsageEntry(withTarget, '/test');
    expect(result).not.toBeNull();
    expect(result!.target).toBe('droid');
  });

  test('ignores non-string target values', () => {
    const withNumericTarget = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      target: 123,
    });
    const result = parseUsageEntry(withNumericTarget, '/test');
    expect(result).not.toBeNull();
    expect(result!.target).toBeUndefined();
  });

  test('returns null when required token fields are invalid', () => {
    const withInvalidUsage = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      message: {
        model: 'claude-sonnet-4-5',
        usage: {
          input_tokens: '1500',
          output_tokens: -10,
          cache_creation_input_tokens: 'bad',
          cache_read_input_tokens: null,
        },
      },
    });

    const result = parseUsageEntry(withInvalidUsage, '/test');
    expect(result).toBeNull();
  });

  test('returns null when timestamp is missing', () => {
    const withoutTimestamp = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      timestamp: undefined,
    });

    expect(parseUsageEntry(withoutTimestamp, '/test')).toBeNull();
  });

  test('derives a dedupe key from the message and request IDs', () => {
    const withRequest = responseLine({ sessionId: 's', messageId: 'msg_1', requestId: 'req_1' });
    const anthropicOnly = responseLine({ sessionId: 's', messageId: 'msg_1' });
    const openaiOnly = responseLine({ sessionId: 's', messageId: 'resp_1' });
    const placeholderOnly = responseLine({ sessionId: 's', messageId: 'gateway-message' });

    expect(parseUsageEntry(withRequest, '/test')!.dedupeKey).toBe('msg_1:req_1');
    expect(parseUsageEntry(anthropicOnly, '/test')!.dedupeKey).toBe('msg_1');
    expect(parseUsageEntry(openaiOnly, '/test')!.dedupeKey).toBe('resp_1');
    expect(parseUsageEntry(placeholderOnly, '/test')!.dedupeKey).toBeUndefined();
    expect(parseUsageEntry(VALID_ASSISTANT_ENTRY, '/test')!.dedupeKey).toBeUndefined();
  });
});

// ============================================================================
// File Parsing Tests (with temp files)
// ============================================================================

describe('parseJsonlFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('parses file with mixed entry types', async () => {
    const filePath = path.join(tempDir, 'test.jsonl');
    const content = [
      USER_ENTRY,
      VALID_ASSISTANT_ENTRY,
      FILE_HISTORY_ENTRY,
      ASSISTANT_ENTRY_NO_CACHE,
      ASSISTANT_NO_USAGE,
    ].join('\n');

    fs.writeFileSync(filePath, content);

    const entries = await parseJsonlFile(filePath, '/test/project');

    // Only 2 valid assistant entries with usage
    expect(entries.length).toBe(2);
    expect(entries[0].model).toBe('claude-sonnet-4-5');
    expect(entries[1].model).toBe('gemini-2.5-pro');
  });

  test('handles empty file', async () => {
    const filePath = path.join(tempDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '');

    const entries = await parseJsonlFile(filePath, '/test');
    expect(entries.length).toBe(0);
  });

  test('returns empty array for non-existent file', async () => {
    const entries = await parseJsonlFile('/nonexistent/file.jsonl', '/test');
    expect(entries.length).toBe(0);
  });

  test('returns empty array when stream cannot be opened', async () => {
    const directoryPath = path.join(tempDir, 'not-a-file');
    fs.mkdirSync(directoryPath);

    const entries = await parseJsonlFile(directoryPath, '/test');
    expect(entries).toEqual([]);
  });

  test('handles file with blank lines', async () => {
    const filePath = path.join(tempDir, 'blanks.jsonl');
    const content = ['', VALID_ASSISTANT_ENTRY, '', '   ', ASSISTANT_ENTRY_NO_CACHE, ''].join('\n');

    fs.writeFileSync(filePath, content);

    const entries = await parseJsonlFile(filePath, '/test');
    expect(entries.length).toBe(2);
  });
});

// ============================================================================
// Directory Scanning Tests
// ============================================================================

describe('parseProjectDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('parses all JSONL files in directory', async () => {
    // Create multiple JSONL files
    fs.writeFileSync(path.join(tempDir, 'session1.jsonl'), VALID_ASSISTANT_ENTRY);
    fs.writeFileSync(path.join(tempDir, 'session2.jsonl'), ASSISTANT_ENTRY_NO_CACHE);

    const entries = await parseProjectDirectory(tempDir);

    expect(entries.length).toBe(2);
  });

  test('ignores non-JSONL files', async () => {
    fs.writeFileSync(path.join(tempDir, 'session.jsonl'), VALID_ASSISTANT_ENTRY);
    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'text file');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');

    const entries = await parseProjectDirectory(tempDir);

    expect(entries.length).toBe(1);
  });

  test('returns empty array for non-existent directory', async () => {
    const entries = await parseProjectDirectory('/nonexistent/dir');
    expect(entries.length).toBe(0);
  });

  test('returns empty array when directory read fails', async () => {
    const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
    const readdirSpy = spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('EACCES'));

    try {
      const entries = await parseProjectDirectory('/protected/dir');
      expect(entries).toEqual([]);
    } finally {
      existsSyncSpy.mockRestore();
      readdirSpy.mockRestore();
    }
  });

  test('sanitizes derived projectPath from dashed directory names', async () => {
    const projectDir = path.join(tempDir, '-..-etc-passwd');
    const withoutCwd = JSON.stringify({
      ...JSON.parse(VALID_ASSISTANT_ENTRY),
      cwd: undefined,
    });
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'session.jsonl'), withoutCwd);

    const entries = await parseProjectDirectory(projectDir);

    expect(entries.length).toBe(1);
    expect(entries[0].projectPath).toBe('/etc/passwd');
  });
});

describe('findProjectDirectories', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('finds all subdirectories', () => {
    fs.mkdirSync(path.join(tempDir, 'project-a'));
    fs.mkdirSync(path.join(tempDir, 'project-b'));
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'not a dir');

    const dirs = findProjectDirectories(tempDir);

    expect(dirs.length).toBe(2);
    expect(dirs).toContain(path.join(tempDir, 'project-a'));
    expect(dirs).toContain(path.join(tempDir, 'project-b'));
  });

  test('returns empty array for non-existent directory', () => {
    const dirs = findProjectDirectories('/nonexistent/path');
    expect(dirs.length).toBe(0);
  });
});

describe('countJsonlFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'count-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('counts JSONL files across multiple project directories', () => {
    const project1 = path.join(tempDir, 'project-a');
    const project2 = path.join(tempDir, 'project-b');
    fs.mkdirSync(project1);
    fs.mkdirSync(project2);

    fs.writeFileSync(path.join(project1, 'a.jsonl'), '');
    fs.writeFileSync(path.join(project1, 'b.jsonl'), '');
    fs.writeFileSync(path.join(project2, 'c.jsonl'), '');
    fs.writeFileSync(path.join(project1, 'not-jsonl.txt'), '');

    const count = countJsonlFiles(tempDir);
    expect(count).toBe(3);
  });
});

// ============================================================================
// scanProjectsDirectory Tests
// ============================================================================

describe('scanProjectsDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('scans all projects and aggregates entries', async () => {
    const project1 = path.join(tempDir, '-home-user-project1');
    const project2 = path.join(tempDir, '-home-user-project2');
    fs.mkdirSync(project1);
    fs.mkdirSync(project2);

    fs.writeFileSync(path.join(project1, 'session.jsonl'), VALID_ASSISTANT_ENTRY);
    fs.writeFileSync(path.join(project2, 'session.jsonl'), ASSISTANT_ENTRY_NO_CACHE);

    const entries = await scanProjectsDirectory({ projectsDir: tempDir });

    expect(entries.length).toBe(2);
  });

  test('filters by minDate', async () => {
    const project = path.join(tempDir, '-test-project');
    fs.mkdirSync(project);

    const oldEntry = JSON.stringify({
      type: 'assistant',
      sessionId: 'old',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 100, output_tokens: 50 } },
    });
    const newEntry = JSON.stringify({
      type: 'assistant',
      sessionId: 'new',
      timestamp: '2025-12-09T00:00:00.000Z',
      message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 200, output_tokens: 100 } },
    });

    fs.writeFileSync(path.join(project, 'session.jsonl'), [oldEntry, newEntry].join('\n'));

    const entries = await scanProjectsDirectory({
      projectsDir: tempDir,
      minDate: new Date('2025-01-01'),
    });

    expect(entries.length).toBe(1);
    expect(entries[0].sessionId).toBe('new');
  });

  test('skips entries with invalid timestamps when minDate filtering is enabled', async () => {
    const project = path.join(tempDir, '-test-invalid-timestamp');
    fs.mkdirSync(project);

    const invalidTimestampEntry = JSON.stringify({
      type: 'assistant',
      sessionId: 'invalid-time',
      timestamp: 'not-a-date',
      message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 100, output_tokens: 50 } },
    });
    const validEntry = JSON.stringify({
      type: 'assistant',
      sessionId: 'valid-time',
      timestamp: '2025-12-09T00:00:00.000Z',
      message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 200, output_tokens: 100 } },
    });
    fs.writeFileSync(path.join(project, 'session.jsonl'), [invalidTimestampEntry, validEntry].join('\n'));

    const entries = await scanProjectsDirectory({
      projectsDir: tempDir,
      minDate: new Date('2025-01-01'),
    });

    expect(entries.length).toBe(1);
    expect(entries[0].sessionId).toBe('valid-time');
  });

  test('returns empty array for empty directory', async () => {
    const entries = await scanProjectsDirectory({ projectsDir: tempDir });
    expect(entries.length).toBe(0);
  });

  test('respects concurrency option', async () => {
    // Create 5 projects
    for (let i = 0; i < 5; i++) {
      const project = path.join(tempDir, `-project-${i}`);
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, 'session.jsonl'), VALID_ASSISTANT_ENTRY);
    }

    // Should still work with concurrency of 2
    const entries = await scanProjectsDirectory({
      projectsDir: tempDir,
      concurrency: 2,
    });

    expect(entries.length).toBe(5);
  });

  test('falls back to default concurrency when invalid concurrency is provided', async () => {
    for (let i = 0; i < 3; i++) {
      const project = path.join(tempDir, `-invalid-concurrency-${i}`);
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, 'session.jsonl'), VALID_ASSISTANT_ENTRY);
    }

    const zeroEntries = await scanProjectsDirectory({
      projectsDir: tempDir,
      concurrency: 0,
    });
    expect(zeroEntries.length).toBe(3);

    const negativeEntries = await scanProjectsDirectory({
      projectsDir: tempDir,
      concurrency: -5,
    });
    expect(negativeEntries.length).toBe(3);
  });

  test('caps very high concurrency values to a safe maximum', async () => {
    for (let i = 0; i < 4; i++) {
      const project = path.join(tempDir, `-capped-concurrency-${i}`);
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, 'session.jsonl'), VALID_ASSISTANT_ENTRY);
    }

    const entries = await scanProjectsDirectory({
      projectsDir: tempDir,
      concurrency: 9999,
    });

    expect(entries.length).toBe(4);
  });

  test('counts one response once across its content-block lines', async () => {
    const project = path.join(tempDir, '-dedupe-blocks');
    fs.mkdirSync(project);
    const block = { sessionId: 's1', messageId: 'msg_1', requestId: 'req_1' };
    fs.writeFileSync(
      path.join(project, 's1.jsonl'),
      [
        // A streaming proxy may only report final usage on the last block.
        responseLine({ ...block, inputTokens: 1, cacheReadTokens: 0, outputTokens: 1 }),
        responseLine(block),
        responseLine(block),
        responseLine({ sessionId: 's1', messageId: 'msg_2', requestId: 'req_2' }),
      ].join('\n')
    );

    const entries = await scanProjectsDirectory({ projectsDir: tempDir });

    expect(entries.length).toBe(2);
    expect(entries[0].cacheReadTokens).toBe(20000);
    expect(entries[0].outputTokens).toBe(400);
  });

  test('counts a response copied into a resumed session file once', async () => {
    const project = path.join(tempDir, '-dedupe-resume');
    fs.mkdirSync(project);
    fs.writeFileSync(
      path.join(project, 'original.jsonl'),
      responseLine({ sessionId: 'original', messageId: 'resp_1' })
    );
    fs.writeFileSync(
      path.join(project, 'resumed.jsonl'),
      [
        responseLine({ sessionId: 'resumed', messageId: 'resp_1' }),
        responseLine({ sessionId: 'resumed', messageId: 'resp_2' }),
      ].join('\n')
    );

    const entries = await scanProjectsDirectory({ projectsDir: tempDir });

    expect(entries.map((entry) => entry.dedupeKey).sort()).toEqual(['resp_1', 'resp_2']);
  });

  test('keeps lines whose message ID may be a gateway placeholder', async () => {
    const project = path.join(tempDir, '-dedupe-placeholder');
    fs.mkdirSync(project);
    fs.writeFileSync(
      path.join(project, 's1.jsonl'),
      [
        responseLine({ sessionId: 's1', messageId: 'gateway-message' }),
        responseLine({ sessionId: 's1', messageId: 'gateway-message' }),
      ].join('\n')
    );

    const entries = await scanProjectsDirectory({ projectsDir: tempDir });

    expect(entries.length).toBe(2);
  });
});

// ============================================================================
// getDefaultProjectsDir Tests
// ============================================================================

describe('getDefaultProjectsDir', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });

  test('uses CLAUDE_CONFIG_DIR env var if set', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude';
    const dir = getDefaultProjectsDir();
    expect(dir).toBe('/custom/claude/projects');
  });

  test('falls back to ~/.claude/projects', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const dir = getDefaultProjectsDir();
    expect(dir).toBe(path.join(getDefaultClaudeConfigDir(), 'projects'));
  });
});
