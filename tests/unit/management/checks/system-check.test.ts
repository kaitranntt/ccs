import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HealthCheck } from '../../../../src/management/checks/types';

const originalPlatform = process.platform;
let originalClaudePath: string | undefined;

function createMockChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setTimeout(() => {
    child.stdout.emit('data', Buffer.from('1.2.3'));
    child.emit('close', 0);
  }, 0);
  return child;
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  if (originalClaudePath === undefined) delete process.env.CCS_CLAUDE_PATH;
  else process.env.CCS_CLAUDE_PATH = originalClaudePath;
});

describe('ClaudeCliChecker', () => {
  it('uses the pinned Windows shell for cmd wrapper health checks', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-system-check-'));
    const fakeClaude = path.join(tmpDir, 'claude.cmd');
    fs.writeFileSync(fakeClaude, '');
    originalClaudePath = process.env.CCS_CLAUDE_PATH;
    process.env.CCS_CLAUDE_PATH = fakeClaude;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const spawnSpy = spyOn(childProcess, 'spawn').mockImplementation(
      () => createMockChild() as unknown as ReturnType<typeof childProcess.spawn>
    );

    try {
      const { ClaudeCliChecker } = await import('../../../../src/management/checks/system-check');
      const results = new HealthCheck();
      await new ClaudeCliChecker().run(results);

      expect(spawnSpy).toHaveBeenCalledTimes(1);
      const [, options] = spawnSpy.mock.calls[0] as [
        string,
        Record<string, unknown> | undefined,
      ];
      expect(options?.shell).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(results.details['Claude CLI']?.status).toBe('OK');
    } finally {
      spawnSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
