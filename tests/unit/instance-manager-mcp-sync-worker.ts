// Subprocess fixture: all paths come from the parent's temporary HOME.
import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { spyOn } from 'bun:test';
import { InstanceManager } from '../../src/management/instance-manager';

const [instancePath, role] = process.argv.slice(2);
const configPath = path.join(instancePath, '.claude.json');
const read = fs.readFileSync;
const lock = lockfile.lockSync;

function awaitParent(): void {
  fs.readSync(0, Buffer.alloc(1), 0, 1, null);
}

spyOn(lockfile, 'lockSync').mockImplementation((target, options) => {
  try {
    return lock(target, options);
  } catch (error) {
    if (role === 'second' && (error as NodeJS.ErrnoException).code === 'ELOCKED') {
      process.stdout.write('contended\n');
      awaitParent();
    }
    throw error;
  }
});

spyOn(fs, 'readFileSync').mockImplementation((target, options) => {
  const result = read(target, options);
  if (target !== configPath) return result;
  process.stdout.write(`read-${role}\n`);
  if (role === 'first') awaitParent();
  // Independent fields are injected into the real read/merge/write transaction.
  return JSON.stringify({ ...JSON.parse(String(result)), [role]: true });
});

process.exitCode = new InstanceManager().syncMcpServers(instancePath) ? 0 : 1;
