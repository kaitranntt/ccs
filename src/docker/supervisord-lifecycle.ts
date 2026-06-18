/**
 * Supervisord lifecycle helpers for Docker deployments (`ccs docker up`).
 *
 * In Docker, supervisord owns the CLIProxy process lifecycle. Direct
 * stop+start via session-tracker / service-manager creates orphaned
 * processes and causes supervisord to enter FATAL state (EADDRINUSE).
 * All restart operations must delegate to `supervisorctl` instead.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { createLogger } from '../services/logging';

const SUPERVISOR_SOCK = '/var/run/supervisor.sock';
const SUPERVISOR_CONF = '/etc/supervisord.conf';
const logger = createLogger('docker:supervisord-lifecycle');

/** True when running inside a supervisord-managed container. */
export function isRunningUnderSupervisord(): boolean {
  return fs.existsSync(SUPERVISOR_SOCK);
}

/** Restart the cliproxy program via supervisorctl. Returns port on success. */
export function restartCliproxyViaSupervisord(): {
  success: boolean;
  port?: number;
  error?: string;
} {
  try {
    execSync(`supervisorctl -c ${SUPERVISOR_CONF} restart cliproxy`, { timeout: 15_000 });
    return { success: true, port: CLIPROXY_DEFAULT_PORT };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error('cliproxy.restart.failed', 'supervisorctl restart failed', {
      detail,
    });
    return { success: false, error: 'supervisorctl restart failed' };
  }
}
