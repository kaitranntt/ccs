import { spawn, type ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as lockfile from 'proper-lockfile';
import { verifyProcessOwnership } from '../cursor/daemon-process-ownership';
import type { OpenAICompatProfileConfig } from './profile-router';
import {
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END,
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START,
  OPENAI_COMPAT_PROXY_SERVICE_NAME,
  getOpenAICompatProxyDir,
} from './proxy-daemon-paths';
import {
  getLegacyOpenAICompatProxyPid,
  getOpenAICompatProxyPid,
  listOpenAICompatProxyProfileNames,
  readLegacyOpenAICompatProxySession,
  readOpenAICompatProxySession,
  removeLegacyOpenAICompatProxyPid,
  removeLegacyOpenAICompatProxySession,
  removeOpenAICompatProxyAuthTokenFile,
  removeOpenAICompatProxyPid,
  removeOpenAICompatProxySession,
  resolveOpenAICompatProxyEntrypointCandidates,
  type OpenAICompatProxySession,
  writeOpenAICompatProxyAuthTokenFile,
  writeOpenAICompatProxyPid,
  writeOpenAICompatProxySession,
} from './proxy-daemon-state';
import {
  listOpenAICompatProxyCandidatePorts as listFlexibleOpenAICompatProxyCandidatePorts,
  resolveOpenAICompatProxyPortPreference,
} from './proxy-port-resolver';

export interface OpenAICompatProxyStatus extends Partial<OpenAICompatProxySession> {
  running: boolean;
  pid?: number;
}

export interface StartOpenAICompatProxyResult {
  success: boolean;
  alreadyRunning?: boolean;
  authToken?: string;
  pid?: number;
  port: number;
  error?: string;
}

interface OpenAICompatProxyLaunchResult extends StartOpenAICompatProxyResult {
  commitState?: () => void;
  stop?: () => Promise<void>;
  bindConflict?: boolean;
}

interface OpenAICompatProxyHealthPayload {
  service?: string;
  profile?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifyProxyProcessOwnership(
  pid: number,
  profileName?: string
): ReturnType<typeof verifyProcessOwnership> {
  const profilePattern = profileName
    ? new RegExp(`(^|\\s)--profile(?:\\s+|=)${escapeRegExp(profileName)}(?=\\s|$)`)
    : null;
  return verifyProcessOwnership(
    pid,
    (commandLine) =>
      commandLine.includes('--ccs-openai-proxy-daemon') &&
      commandLine.includes('proxy-daemon-entry') &&
      (!profilePattern || profilePattern.test(commandLine))
  );
}

function generateProxyAuthToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function withOpenAICompatProxyLock<T>(operation: () => Promise<T>): Promise<T> {
  const proxyDir = getOpenAICompatProxyDir();
  await fs.promises.mkdir(proxyDir, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(proxyDir, 0o700);

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(proxyDir, {
      stale: 10000,
      retries: { retries: 20, minTimeout: 50, maxTimeout: 250 },
      realpath: false,
    });
  } catch (error) {
    throw new Error(
      `Failed to lock OpenAI-compatible proxy directory (${proxyDir}): ${(error as Error).message}`
    );
  }

  try {
    return await operation();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Best-effort release.
      }
    }
  }
}

async function terminateDaemonProcess(pid?: number): Promise<void> {
  if (!pid) {
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        process.kill(pid, 0);
        attempts += 1;
      } catch {
        return;
      }
    }

    process.kill(pid, 'SIGKILL');
  } catch {
    // Best-effort cleanup for a daemon we just spawned.
  }
}

function listOpenAICompatProxyCandidatePorts(
  profileName: string,
  preferredPort: number,
  exact: boolean,
  excludedPorts: ReadonlySet<number> = new Set()
): number[] {
  if (exact) {
    return excludedPorts.has(preferredPort) ? [] : [preferredPort];
  }

  return listFlexibleOpenAICompatProxyCandidatePorts(profileName, preferredPort, excludedPorts);
}

function isPortBindConflictMessage(message?: string): boolean {
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return (
    message.includes('EADDRINUSE') ||
    normalized.includes('address already in use') ||
    (normalized.includes('is port') && normalized.includes('in use'))
  );
}

interface OpenAICompatProxyStateRecord {
  pid: number | null;
  session: OpenAICompatProxySession | null;
  source: 'profile' | 'legacy';
}

async function resolveDaemonEntrypoint(): Promise<string | null> {
  for (const candidate of resolveOpenAICompatProxyEntrypointCandidates()) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function isOpenAICompatProxyRunning(
  port: number,
  expectedProfileName?: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 3000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const payload = JSON.parse(body) as OpenAICompatProxyHealthPayload;
            resolve(
              payload.service === OPENAI_COMPAT_PROXY_SERVICE_NAME &&
                (!expectedProfileName || payload.profile === expectedProfileName)
            );
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function getOpenAICompatProxyStatusForProfile(
  profileName: string
): Promise<OpenAICompatProxyStatus> {
  const state = getOpenAICompatProxyStateForProfile(profileName);
  const session = state.session;
  if (!session) {
    return { running: false, profileName, pid: state.pid || undefined };
  }

  const port = session.port;
  const running = await isOpenAICompatProxyRunning(port, profileName);
  return {
    running,
    pid: running ? state.pid || undefined : undefined,
    ...session,
  };
}

async function getLegacyOpenAICompatProxyStatus(): Promise<OpenAICompatProxyStatus | null> {
  const session = readLegacyOpenAICompatProxySession();
  const pid = getLegacyOpenAICompatProxyPid();
  if (!session && !pid) {
    return null;
  }

  const port = session?.port;
  const running =
    typeof port === 'number' ? await isOpenAICompatProxyRunning(port, session?.profileName) : false;
  return {
    running,
    pid: running ? pid || undefined : pid || undefined,
    ...session,
  };
}

function getOpenAICompatProxyStateForProfile(profileName: string): OpenAICompatProxyStateRecord {
  const session = readOpenAICompatProxySession(profileName);
  if (session) {
    return {
      pid: getOpenAICompatProxyPid(profileName),
      session,
      source: 'profile',
    };
  }

  const legacySession = readLegacyOpenAICompatProxySession();
  if (legacySession?.profileName === profileName) {
    return {
      pid: getLegacyOpenAICompatProxyPid(),
      session: legacySession,
      source: 'legacy',
    };
  }

  return { pid: null, session: null, source: 'profile' };
}

export async function listOpenAICompatProxyStatuses(): Promise<OpenAICompatProxyStatus[]> {
  const profileNames = new Set(listOpenAICompatProxyProfileNames());
  const legacySession = readLegacyOpenAICompatProxySession();
  if (legacySession?.profileName) {
    profileNames.add(legacySession.profileName);
  }
  const profileStatuses = await Promise.all(
    [...profileNames].map((profileName) => getOpenAICompatProxyStatusForProfile(profileName))
  );
  const statuses = profileStatuses.filter((status) => status.profileName);
  if (!legacySession?.profileName) {
    const legacyStatus = await getLegacyOpenAICompatProxyStatus();
    if (legacyStatus) {
      statuses.push(legacyStatus);
    }
  }
  return statuses;
}

export async function getOpenAICompatProxyStatus(
  profileName?: string
): Promise<OpenAICompatProxyStatus> {
  if (profileName) {
    return getOpenAICompatProxyStatusForProfile(profileName);
  }

  const statuses = await listOpenAICompatProxyStatuses();
  const running = statuses.filter((status) => status.running);
  if (running.length === 1) {
    return running[0];
  }
  if (running.length > 1) {
    return { running: true };
  }
  const latestKnown = statuses[0];
  return latestKnown ?? { running: false };
}

async function stopOpenAICompatProxyUnlocked(
  profileName: string
): Promise<{ success: boolean; error?: string }> {
  const state = getOpenAICompatProxyStateForProfile(profileName);
  const pid = state.pid;
  if (!pid) {
    removeOpenAICompatProxyState(state, profileName);
    return { success: true };
  }

  const ownership = verifyProxyProcessOwnership(pid, profileName);

  if (ownership === 'not-owned') {
    removeOpenAICompatProxyState(state, profileName);
    return { success: true };
  }

  if (ownership === 'unknown') {
    return {
      success: false,
      error: `Refusing to stop PID ${pid}: unable to verify daemon ownership`,
    };
  }

  if (ownership === 'not-running') {
    removeOpenAICompatProxyState(state, profileName);
    return { success: true };
  }

  try {
    process.kill(pid, 'SIGTERM');
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(pid, 0);
        attempts += 1;
      } catch {
        break;
      }
    }

    if (attempts >= 10) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already exited.
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ESRCH') {
      return { success: false, error: `Failed to stop daemon: ${err.message}` };
    }
  }

  removeOpenAICompatProxyState(state, profileName);
  return { success: true };
}

async function stopLegacyOpenAICompatProxyUnlocked(): Promise<{
  success: boolean;
  error?: string;
}> {
  const legacySession = readLegacyOpenAICompatProxySession();
  if (legacySession?.profileName) {
    return stopOpenAICompatProxyUnlocked(legacySession.profileName);
  }

  const pid = getLegacyOpenAICompatProxyPid();
  if (!pid) {
    removeLegacyOpenAICompatProxyPid();
    removeLegacyOpenAICompatProxySession();
    return { success: true };
  }

  const ownership = verifyProxyProcessOwnership(pid);

  if (ownership === 'not-owned' || ownership === 'not-running') {
    removeLegacyOpenAICompatProxyPid();
    removeLegacyOpenAICompatProxySession();
    return { success: true };
  }

  if (ownership === 'unknown') {
    return {
      success: false,
      error: `Refusing to stop PID ${pid}: unable to verify daemon ownership`,
    };
  }

  try {
    process.kill(pid, 'SIGTERM');
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(pid, 0);
        attempts += 1;
      } catch {
        break;
      }
    }

    if (attempts >= 10) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already exited.
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ESRCH') {
      return { success: false, error: `Failed to stop daemon: ${err.message}` };
    }
  }

  removeLegacyOpenAICompatProxyPid();
  removeLegacyOpenAICompatProxySession();
  return { success: true };
}

function removeOpenAICompatProxyState(
  state: OpenAICompatProxyStateRecord,
  profileName: string
): void {
  if (state.source === 'legacy') {
    removeLegacyOpenAICompatProxyPid();
    removeLegacyOpenAICompatProxySession();
    return;
  }

  removeOpenAICompatProxyPid(profileName);
  removeOpenAICompatProxySession(profileName);
}

export async function stopOpenAICompatProxy(
  profileName?: string
): Promise<{ success: boolean; error?: string }> {
  return withOpenAICompatProxyLock(async () => {
    if (profileName) {
      return stopOpenAICompatProxyUnlocked(profileName);
    }

    const statuses = await listOpenAICompatProxyStatuses();
    const failures: string[] = [];
    for (const status of statuses) {
      const stopped = status.profileName
        ? await stopOpenAICompatProxyUnlocked(status.profileName)
        : await stopLegacyOpenAICompatProxyUnlocked();
      if (!stopped.success) {
        failures.push(
          status.profileName
            ? `${status.profileName}: ${stopped.error || 'failed to stop proxy'}`
            : `legacy proxy: ${stopped.error || 'failed to stop proxy'}`
        );
      }
    }
    if (failures.length > 0) {
      return { success: false, error: `Failed to stop some proxies: ${failures.join('; ')}` };
    }
    return { success: true };
  });
}

export async function startOpenAICompatProxy(
  profile: OpenAICompatProfileConfig,
  options: { port?: number; host?: string; insecure?: boolean } = {}
): Promise<StartOpenAICompatProxyResult> {
  return withOpenAICompatProxyLock(async () => {
    const status = await getOpenAICompatProxyStatus(profile.profileName);
    const host = options.host?.trim() || status.host || '127.0.0.1';
    const portPreference = resolveOpenAICompatProxyPortPreference(profile.profileName);
    const explicitPort = typeof options.port === 'number' ? options.port : undefined;
    const requiresExactPort = explicitPort !== undefined || portPreference.source === 'profile';
    if (
      status.running &&
      explicitPort === undefined &&
      portPreference.source !== 'profile' &&
      status.port &&
      (status.host || '127.0.0.1') === host
    ) {
      return {
        success: true,
        alreadyRunning: true,
        pid: status.pid,
        port: status.port,
        authToken: status.authToken,
      };
    }

    const preferredPort = explicitPort ?? portPreference.port;
    if (status.running && status.port === preferredPort && (status.host || '127.0.0.1') === host) {
      return {
        success: true,
        alreadyRunning: true,
        pid: status.pid,
        port: preferredPort,
        authToken: status.authToken,
      };
    }
    if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
      return { success: false, port: preferredPort, error: `Invalid port: ${preferredPort}` };
    }
    if (status.pid && !status.port) {
      const stopped = await stopOpenAICompatProxyUnlocked(profile.profileName);
      if (!stopped.success) {
        return {
          success: false,
          port: preferredPort,
          error: stopped.error || 'Failed to clear stale proxy state',
        };
      }
    }

    const daemonEntry = await resolveDaemonEntrypoint();
    if (!daemonEntry) {
      return {
        success: false,
        port: preferredPort,
        error: 'OpenAI proxy daemon entrypoint not found. Run `bun run build` and retry.',
      };
    }

    const launchOnPort = (
      port: number,
      persistState: boolean
    ): Promise<OpenAICompatProxyLaunchResult> =>
      new Promise((resolve) => {
        let resolved = false;
        let timeout: NodeJS.Timeout | null = null;
        let stderr = '';
        const authToken = generateProxyAuthToken();
        const authTokenFile = writeOpenAICompatProxyAuthTokenFile(profile.profileName, authToken);
        const commitState = () => {
          if (proc.pid) {
            writeOpenAICompatProxyPid(profile.profileName, proc.pid);
          }
          writeOpenAICompatProxySession({
            profileName: profile.profileName,
            settingsPath: profile.settingsPath,
            host,
            port,
            baseUrl: profile.baseUrl,
            authToken,
            model: profile.model,
            insecure: options.insecure,
          });
        };

        const finish = (result: OpenAICompatProxyLaunchResult) => {
          if (resolved) return;
          resolved = true;
          if (timeout) clearTimeout(timeout);
          if (!result.success) {
            removeOpenAICompatProxyAuthTokenFile(authTokenFile);
            if (persistState) {
              removeOpenAICompatProxyPid(profile.profileName);
              removeOpenAICompatProxySession(profile.profileName);
            }
          }
          resolve(result);
        };

        const proc: ChildProcess = spawn(
          process.execPath,
          [
            daemonEntry,
            '--port',
            String(port),
            '--host',
            host,
            '--profile',
            profile.profileName,
            '--settings-path',
            profile.settingsPath,
            '--auth-token-file',
            authTokenFile,
            ...(options.insecure ? ['--insecure'] : []),
            '--ccs-openai-proxy-daemon',
          ],
          { stdio: ['ignore', 'ignore', 'pipe'], detached: true }
        );

        proc.unref();
        proc.stderr?.setEncoding('utf8');
        proc.stderr?.on('data', (chunk) => {
          stderr += chunk;
        });

        let attempts = 0;
        const poll = async () => {
          attempts += 1;
          if (await isOpenAICompatProxyRunning(port, profile.profileName)) {
            if (persistState) {
              commitState();
            }
            finish({
              success: true,
              pid: proc.pid,
              port,
              authToken,
              ...(persistState
                ? {}
                : {
                    commitState,
                    stop: async () => {
                      await terminateDaemonProcess(proc.pid);
                    },
                  }),
            });
            return;
          }
          if (attempts >= 30) {
            finish({
              success: false,
              port,
              error: `Proxy daemon did not start within 30 seconds on port ${port}`,
            });
            return;
          }
          timeout = setTimeout(poll, 1000);
        };

        timeout = setTimeout(poll, 1000);
        proc.on('error', (error) => {
          finish({
            success: false,
            port,
            error: error.message,
            bindConflict: isPortBindConflictMessage(error.message),
          });
        });
        proc.on('exit', (code, signal) => {
          const bindConflict = isPortBindConflictMessage(stderr);
          if (code === 0) {
            finish({
              success: false,
              port,
              error: 'Proxy daemon exited before becoming healthy',
              bindConflict,
            });
            return;
          }
          if (code !== null) {
            finish({
              success: false,
              port,
              error: stderr.trim() || `Proxy daemon exited with code ${code}`,
              bindConflict,
            });
            return;
          }
          finish({
            success: false,
            port,
            error: `Proxy daemon was killed by signal ${signal}`,
            bindConflict,
          });
        });
      });

    const launchProxy = async (persistState: boolean): Promise<OpenAICompatProxyLaunchResult> => {
      const attemptedPorts = new Set<number>();
      let lastResult: OpenAICompatProxyLaunchResult | null = null;
      const candidates = listOpenAICompatProxyCandidatePorts(
        profile.profileName,
        preferredPort,
        requiresExactPort,
        attemptedPorts
      );
      if (candidates.length === 0) {
        return {
          success: false,
          port: preferredPort,
          error: `No free proxy port found in adaptive range ${OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START}-${OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END}`,
        };
      }

      for (const port of candidates) {
        const result = await launchOnPort(port, persistState);
        if (result.success) {
          return result;
        }
        if (requiresExactPort && result.bindConflict) {
          return {
            ...result,
            error: `Requested proxy port ${preferredPort} is already in use`,
          };
        }

        lastResult = result;
        attemptedPorts.add(port);
        if (!result.bindConflict) {
          return result;
        }
      }

      return (
        lastResult ?? {
          success: false,
          port: preferredPort,
          error: requiresExactPort
            ? `Requested proxy port ${preferredPort} is already in use`
            : 'No free proxy port found in the adaptive proxy port range',
        }
      );
    };

    if (status.running) {
      const launched = await launchProxy(false);
      if (!launched.success) {
        return launched;
      }

      const stopped = await stopOpenAICompatProxyUnlocked(profile.profileName);
      if (!stopped.success) {
        await launched.stop?.();
        return {
          success: false,
          port: launched.port,
          error: stopped.error || 'Failed to replace the running proxy',
        };
      }

      launched.commitState?.();
      return launched;
    }

    return launchProxy(true);
  });
}
