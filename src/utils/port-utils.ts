/**
 * Port utilities for detecting process ownership
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PortProcess {
  pid: number;
  processName: string;
  commandLine?: string;
}

/**
 * Get process information for a port
 * @param port Port number to check
 * @returns Process info or null if port is free
 */
export async function getPortProcess(port: number): Promise<PortProcess | null> {
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      return await getPortProcessWindows(port);
    } else {
      return await getPortProcessUnix(port);
    }
  } catch {
    // If detection fails, return null (assume port is free)
    return null;
  }
}

/**
 * Unix/Linux/macOS implementation using lsof
 */
async function getPortProcessUnix(port: number): Promise<PortProcess | null> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -sTCP:LISTEN -F pcn`, {
      timeout: 3000,
    });

    if (!stdout.trim()) {
      return null; // Port free
    }

    // Parse lsof -F output:
    // p<pid>
    // c<command>
    // n<network>
    const lines = stdout.trim().split('\n');
    let pid: number | null = null;
    let processName: string | null = null;

    for (const line of lines) {
      if (line.startsWith('p')) {
        pid = parseInt(line.substring(1), 10);
      } else if (line.startsWith('c')) {
        processName = line.substring(1);
      }
    }

    if (pid && processName) {
      return { pid, processName };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Windows implementation using netstat
 */
async function getPortProcessWindows(port: number): Promise<PortProcess | null> {
  try {
    // netstat -ano finds PID, then tasklist gets process name
    const { stdout: netstatOut } = await execAsync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { timeout: 3000 }
    );

    if (!netstatOut.trim()) {
      return null; // Port free
    }

    // Parse netstat output to get PID (last column)
    const match = netstatOut.match(/\s+(\d+)\s*$/m);
    if (!match) {
      return null;
    }

    const pid = parseInt(match[1], 10);

    // Get process name from PID
    const { stdout: tasklistOut } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`, {
      timeout: 3000,
    });

    const taskMatch = tasklistOut.match(/^([^\s]+)/);
    const processName = taskMatch ? taskMatch[1] : `PID-${pid}`;

    return { pid, processName };
  } catch {
    return null;
  }
}

/**
 * Check if process is CLIProxy
 * Uses prefix matching to handle Linux kernel's 15-char process name truncation
 * (e.g., 'cli-proxy-api-plus' becomes 'cli-proxy-api-p' in lsof/ps output)
 */
export function isCLIProxyProcess(process: PortProcess | null): boolean {
  if (!process) {
    return false;
  }

  const name = process.processName.toLowerCase();
  // All CLIProxy variants start with 'cli-proxy' or 'cliproxy'
  return name.startsWith('cli-proxy') || name.startsWith('cliproxy');
}

/**
 * Windows firewall check result
 */
export interface FirewallCheckResult {
  checked: boolean;
  mayBlock: boolean;
  message: string;
  fixCommand?: string;
}

/**
 * Check if Windows Firewall might block a port
 * Returns immediately on non-Windows platforms
 */
export async function checkWindowsFirewall(port: number): Promise<FirewallCheckResult> {
  if (process.platform !== 'win32') {
    return { checked: false, mayBlock: false, message: 'Not Windows' };
  }

  try {
    // Check for inbound rules allowing our port
    const { stdout } = await execAsync(
      `netsh advfirewall firewall show rule name=all dir=in | findstr /C:"LocalPort" | findstr /C:"${port}"`,
      { timeout: 5000 }
    );

    // If we find the port in firewall rules, it's likely allowed
    if (stdout.trim()) {
      return { checked: true, mayBlock: false, message: `Port ${port} found in firewall rules` };
    }

    // Port not in rules - might be blocked
    return {
      checked: true,
      mayBlock: true,
      message: `Port ${port} may be blocked by Windows Firewall`,
      fixCommand: `netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=${port}`,
    };
  } catch {
    // Command failed - could be no matching rules, assume might block
    return {
      checked: true,
      mayBlock: true,
      message: `Could not verify firewall rules for port ${port}`,
      fixCommand: `netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=${port}`,
    };
  }
}

/**
 * Localhost binding test result
 */
export interface BindingTestResult {
  success: boolean;
  message: string;
}

/**
 * Wait for a port to become free (no process listening)
 * @param port Port number to wait for
 * @param timeoutMs Maximum time to wait in milliseconds (default: 5000)
 * @param pollIntervalMs Interval between checks in milliseconds (default: 200)
 * @returns True if port became free, false if timeout
 */
export async function waitForPortFree(
  port: number,
  timeoutMs = 5000,
  pollIntervalMs = 200
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const process = await getPortProcess(port);
    if (!process) {
      return true; // Port is free
    }
    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false; // Timeout reached
}

/**
 * Test if we can bind to localhost on a specific port
 * This verifies network stack is working and port is actually available
 */
export async function testLocalhostBinding(port: number): Promise<BindingTestResult> {
  const net = await import('net');

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      // H8: Close server to prevent fd leak on error path
      server.close(() => {
        if (err.code === 'EADDRINUSE') {
          resolve({ success: false, message: `Port ${port} is already in use` });
        } else if (err.code === 'EACCES') {
          resolve({ success: false, message: `Permission denied for port ${port}` });
        } else {
          resolve({ success: false, message: `Cannot bind to port ${port}: ${err.message}` });
        }
      });
    });

    server.once('listening', () => {
      server.close(() => {
        resolve({ success: true, message: `Port ${port} is available` });
      });
    });

    // Try to bind to localhost only (like CLIProxyAPI does)
    server.listen(port, '127.0.0.1');
  });
}
