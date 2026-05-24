import * as fs from 'fs';
import * as path from 'path';
import { loadOrCreateUnifiedConfig, getCcsDir } from '../config/config-loader-facade';

export const DOCKER_BOOTSTRAP_STATE_FILENAME = '.docker-bootstrap-state.json';
export const DOCKER_LEGACY_API_KEY = 'ccs-internal-managed';
export const DEFAULT_DOCKER_LEGACY_KEY_GRACE_DAYS = 14;
export const DOCKER_LEGACY_KEY_GRACE_ENV = 'CCS_DOCKER_LEGACY_KEY_GRACE_DAYS';
export const DOCKER_RESTORE_LEGACY_KEY_ENV = 'CCS_DOCKER_RESTORE_LEGACY_API_KEY';
export const DOCKER_ENABLE_LEGACY_KEY_AUTH_ENV = 'CCS_DOCKER_ENABLE_LEGACY_KEY_AUTH';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATE_VERSION = 1;

export interface DockerLegacyKeyGrace {
  legacyKey: string;
  replacementKey: string;
  startedAt: string;
  expiresAt: string;
  finalizedAt?: string;
}

export interface DockerBootstrapState {
  version: number;
  apiKey?: string;
  bootstrappedAt: string;
  legacyKeyGrace?: DockerLegacyKeyGrace;
}

export interface DockerBootstrapStateReadResult {
  state: DockerBootstrapState | null;
  corrupted: boolean;
  path: string;
}

export interface DockerKeyRotationStatus {
  apiKey?: string;
  maskedApiKey?: string;
  statePath: string;
  stateCorrupted: boolean;
  legacyGraceActive: boolean;
  legacyGrace?: DockerLegacyKeyGrace;
}

export function getDockerBootstrapStatePath(): string {
  return path.join(getCcsDir(), 'cliproxy', DOCKER_BOOTSTRAP_STATE_FILENAME);
}

export function parseDockerLegacyKeyGraceDays(env = process.env): number {
  const rawValue = env[DOCKER_LEGACY_KEY_GRACE_ENV];
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_DOCKER_LEGACY_KEY_GRACE_DAYS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_DOCKER_LEGACY_KEY_GRACE_DAYS;
  }

  return Math.floor(parsed);
}

export function isLikelyDockerGeneratedApiKey(value: string | undefined): boolean {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
}

export function shouldRestoreDockerLegacyApiKey(env = process.env): boolean {
  return env[DOCKER_RESTORE_LEGACY_KEY_ENV] === '1';
}

export function shouldEnableDockerLegacyKeyAuth(env = process.env): boolean {
  return env[DOCKER_ENABLE_LEGACY_KEY_AUTH_ENV] === '1';
}

export function readDockerBootstrapState(): DockerBootstrapStateReadResult {
  const statePath = getDockerBootstrapStatePath();
  if (!fs.existsSync(statePath)) {
    return { state: null, corrupted: false, path: statePath };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as DockerBootstrapState;
    if (!parsed || parsed.version !== STATE_VERSION || typeof parsed.bootstrappedAt !== 'string') {
      return { state: null, corrupted: true, path: statePath };
    }
    return { state: parsed, corrupted: false, path: statePath };
  } catch {
    return { state: null, corrupted: true, path: statePath };
  }
}

export function writeDockerBootstrapState(state: DockerBootstrapState): void {
  const statePath = getDockerBootstrapStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, statePath);
}

export function createDockerBootstrapState(
  apiKey: string | undefined,
  now = new Date()
): DockerBootstrapState {
  return {
    version: STATE_VERSION,
    apiKey,
    bootstrappedAt: now.toISOString(),
  };
}

export function addLegacyKeyGrace(
  state: DockerBootstrapState,
  replacementKey: string,
  now = new Date(),
  graceDays = parseDockerLegacyKeyGraceDays()
): DockerBootstrapState {
  return {
    ...state,
    apiKey: replacementKey,
    legacyKeyGrace: {
      legacyKey: DOCKER_LEGACY_API_KEY,
      replacementKey,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + graceDays * DAY_MS).toISOString(),
    },
  };
}

export function isDockerLegacyKeyGraceActive(
  state: DockerBootstrapState | null,
  now = new Date()
): boolean {
  const grace = state?.legacyKeyGrace;
  if (!grace || grace.finalizedAt) {
    return false;
  }

  const expiresAt = Date.parse(grace.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function getActiveDockerLegacyApiKeys(now = new Date()): string[] {
  if (!shouldEnableDockerLegacyKeyAuth()) {
    return [];
  }

  const { state } = readDockerBootstrapState();
  if (!isDockerLegacyKeyGraceActive(state, now)) {
    return [];
  }

  return state?.legacyKeyGrace?.legacyKey ? [state.legacyKeyGrace.legacyKey] : [];
}

export function maskDockerApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) {
    return undefined;
  }
  if (apiKey.length <= 8) {
    return '****';
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

export function getDockerKeyRotationStatus(now = new Date()): DockerKeyRotationStatus {
  const config = loadOrCreateUnifiedConfig();
  const readResult = readDockerBootstrapState();
  const apiKey = config.cliproxy.auth?.api_key;

  return {
    apiKey,
    maskedApiKey: maskDockerApiKey(apiKey),
    statePath: readResult.path,
    stateCorrupted: readResult.corrupted,
    legacyGraceActive: isDockerLegacyKeyGraceActive(readResult.state, now),
    legacyGrace: readResult.state?.legacyKeyGrace,
  };
}

export function renderDockerKeyRotationBanner(status = getDockerKeyRotationStatus()): string {
  if (!status.legacyGraceActive || !status.legacyGrace) {
    return '';
  }

  const maskedReplacementKey =
    maskDockerApiKey(status.legacyGrace.replacementKey) ?? '(not configured)';

  return [
    '[!] Docker CLIProxy API key rotation grace period is active.',
    `[i] New CLIProxy API key: ${maskedReplacementKey}`,
    `[i] Legacy key ${status.legacyGrace.legacyKey} remains valid until ${status.legacyGrace.expiresAt}.`,
    '[i] Reveal the full key with `ccs docker show-key --full`.',
    '[i] Update existing clients, then run `ccs docker finalize-key-rotation`.',
  ].join('\n');
}

export function finalizeDockerKeyRotation(now = new Date()): DockerKeyRotationStatus {
  const readResult = readDockerBootstrapState();
  const state =
    readResult.state ??
    createDockerBootstrapState(loadOrCreateUnifiedConfig().cliproxy.auth?.api_key, now);

  writeDockerBootstrapState({
    ...state,
    legacyKeyGrace: state.legacyKeyGrace
      ? {
          ...state.legacyKeyGrace,
          finalizedAt: now.toISOString(),
          expiresAt: now.toISOString(),
        }
      : undefined,
  });

  return getDockerKeyRotationStatus(now);
}
