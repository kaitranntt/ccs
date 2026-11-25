import { verifyProcessOwnership, type DaemonOwnershipStatus } from '../shared/daemon-lifecycle';

export { verifyProcessOwnership, type DaemonOwnershipStatus };

export function verifyDaemonOwnership(pid: number): DaemonOwnershipStatus {
  return verifyProcessOwnership(
    pid,
    (commandLine) =>
      commandLine.includes('--ccs-daemon') && commandLine.includes('cursor-daemon-entry')
  );
}
