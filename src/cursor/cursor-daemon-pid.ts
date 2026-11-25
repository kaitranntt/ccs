import * as path from 'path';
import { getCcsDir } from '../shared/ccs-paths';
import {
  getDaemonPidFromFile,
  removeDaemonPidFile,
  writeDaemonPidToFile,
} from '../shared/daemon-lifecycle';

function getCursorDir(): string {
  return path.join(getCcsDir(), 'cursor');
}

function getPidFilePath(): string {
  return path.join(getCursorDir(), 'daemon.pid');
}

export function getPidFromFile(): number | null {
  return getDaemonPidFromFile(getPidFilePath());
}

export function writePidToFile(pid: number): void {
  writeDaemonPidToFile(getPidFilePath(), pid);
}

export function removePidFile(): void {
  removeDaemonPidFile(getPidFilePath());
}
