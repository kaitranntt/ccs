/**
 * Environment Detector for CLIProxyAPI
 *
 * Detects headless environments and manages OAuth callback ports.
 */

import { execSync } from 'child_process';
import { CLIProxyProvider } from '../types';

/**
 * Detect if running in a headless environment (no browser available)
 *
 * IMPROVED: Avoids false positives on Windows desktop environments
 * where isTTY may be undefined due to terminal wrapper behavior.
 *
 * Case study: Vietnamese Windows users reported "command hangs" because
 * their terminal (PowerShell via npm) didn't set isTTY correctly.
 */
export function isHeadlessEnvironment(): boolean {
  // SSH session - always headless
  if (process.env.SSH_TTY || process.env.SSH_CLIENT || process.env.SSH_CONNECTION) {
    return true;
  }

  // No display on Linux (X11/Wayland) - headless
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return true;
  }

  // Windows desktop - NEVER headless unless SSH (already checked above)
  // This fixes false positive where Windows npm wrappers don't set isTTY correctly
  // Windows desktop environments always have browser capability
  if (process.platform === 'win32') {
    return false;
  }

  // macOS - check for proper terminal
  if (process.platform === 'darwin') {
    // Non-interactive stdin on macOS means likely piped/scripted
    if (!process.stdin.isTTY) {
      return true;
    }
    return false;
  }

  // Linux with display - check TTY
  if (process.platform === 'linux') {
    if (!process.stdin.isTTY) {
      return true;
    }
    return false;
  }

  // Default fallback for unknown platforms
  return !process.stdin.isTTY;
}

/**
 * Kill any process using a specific port
 * Used to free OAuth callback port before authentication
 */
export function killProcessOnPort(port: number, verbose: boolean): boolean {
  try {
    if (process.platform === 'win32') {
      // Windows: use netstat + taskkill
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
          if (verbose) console.error(`[auth] Killed process ${pid} on port ${port}`);
        }
      }
      return true;
    } else {
      // Unix: use lsof + kill
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' });
      const pids = result
        .trim()
        .split('\n')
        .filter((p) => p);
      for (const pid of pids) {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
        if (verbose) console.error(`[auth] Killed process ${pid} on port ${port}`);
      }
      return pids.length > 0;
    }
  } catch {
    // No process on port or command failed - that's fine
    return false;
  }
}

/**
 * Get platform-specific troubleshooting for OAuth timeout
 */
export function getTimeoutTroubleshooting(
  provider: CLIProxyProvider,
  port: number | null
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push('TROUBLESHOOTING:');
  lines.push('  1. Check browser completed auth (should show success page)');
  lines.push('  2. Complete OAuth in the same browser session that opened');

  if (port) {
    lines.push(`  3. Check for port conflicts: lsof -ti:${port} or ss -tlnp | grep ${port}`);
    lines.push(`  4. Try: ccs ${provider} --auth --verbose`);
  } else {
    lines.push(`  3. Try: ccs ${provider} --auth --verbose`);
  }

  lines.push('');
  lines.push('If you copied the URL to another browser:');
  lines.push('  - OAuth sessions expire after ~10 minutes');
  lines.push('  - Callback must reach localhost (same machine only)');

  return lines;
}

/**
 * Display a single step status line
 */
export function showStep(
  step: number,
  total: number,
  status: 'ok' | 'fail' | 'progress',
  message: string
): void {
  const statusIcon = status === 'ok' ? '[OK]' : status === 'fail' ? '[X]' : '[..]';
  console.log(`${statusIcon} [${step}/${total}] ${message}`);
}
