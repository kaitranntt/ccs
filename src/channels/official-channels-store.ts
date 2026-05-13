import * as fs from 'fs';
import * as path from 'path';

import { getDefaultClaudeConfigDir } from '../utils/claude-config-path';
import type { OfficialChannelId } from '../config/unified-config-types';
import {
  getOfficialChannelEnvDir,
  getOfficialChannelEnvKey,
  getOfficialChannelStateDirEnvKey,
  getOfficialChannelTokenIds,
  isOfficialChannelTokenRequired,
} from './official-channels-runtime';
import { getCcsDir } from '../config/config-loader-facade';
import { listAccountInstancePaths } from '../management/instance-directory';

export type OfficialChannelTokenSource = 'saved_env' | 'process_env' | 'missing';

export interface OfficialChannelTokenStatus {
  available: boolean;
  source: OfficialChannelTokenSource;
  envKey?: string;
  tokenPath?: string;
  savedInClaudeState: boolean;
  processEnvAvailable: boolean;
}

const MAX_OFFICIAL_CHANNEL_TOKEN_LENGTH = 4096;

function getResolvedStateDirOverride(
  channelId: OfficialChannelId,
  envOverrides?: NodeJS.ProcessEnv | null
): string | null {
  const env = envOverrides === undefined ? process.env : envOverrides;
  const rawStateDir = env?.[getOfficialChannelStateDirEnvKey(channelId)]?.trim();

  return rawStateDir ? path.resolve(rawStateDir) : null;
}

export function getOfficialChannelEnvPath(
  channelId: OfficialChannelId,
  configDir = getDefaultClaudeConfigDir(),
  envOverrides?: NodeJS.ProcessEnv | null
): string {
  const overrideStateDir = getResolvedStateDirOverride(channelId, envOverrides);
  const stateDir =
    overrideStateDir ?? path.join(configDir, 'channels', getOfficialChannelEnvDir(channelId));

  return path.join(stateDir, '.env');
}

function readFileIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function formatEnvValue(value: string): string {
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : JSON.stringify(value);
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const nextLines: string[] = [];
  let replaced = false;

  for (const line of lines) {
    if (/^\s*$/.test(line) && nextLines.length === 0) {
      continue;
    }
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
      replaced = true;
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  return `${nextLines.join('\n').replace(/\n+$/u, '')}\n`;
}

function removeEnvValue(content: string, key: string): string {
  const nextLines = content
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*${key}\\s*=`).test(line));

  while (nextLines.length > 0 && /^\s*$/.test(nextLines[0] ?? '')) {
    nextLines.shift();
  }
  while (nextLines.length > 0 && /^\s*$/.test(nextLines[nextLines.length - 1] ?? '')) {
    nextLines.pop();
  }

  return nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '';
}

function writeSecureFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function clearOfficialChannelTokenAtPath(channelId: OfficialChannelId, filePath: string): boolean {
  const envKey = getOfficialChannelEnvKey(channelId);
  if (!envKey) {
    return false;
  }

  const currentContent = readFileIfExists(filePath);

  if (currentContent === null) {
    return false;
  }

  const nextContent = removeEnvValue(currentContent, envKey);
  if (nextContent.length === 0) {
    fs.rmSync(filePath, { force: true });
    return true;
  }

  writeSecureFile(filePath, nextContent);
  return true;
}

function listManagedClaudeConfigDirs(): string[] {
  const dirs = new Set<string>([getDefaultClaudeConfigDir()]);
  const processConfigDir = process.env.CLAUDE_CONFIG_DIR?.trim();

  if (processConfigDir) {
    dirs.add(path.resolve(processConfigDir));
  }

  const instancesDir = path.join(getCcsDir(), 'instances');
  if (!fs.existsSync(instancesDir)) {
    return [...dirs];
  }

  for (const instancePath of listAccountInstancePaths(instancesDir)) {
    dirs.add(instancePath);
  }

  return [...dirs];
}

function listManagedOfficialChannelEnvPaths(channelId: OfficialChannelId): string[] {
  const envPaths = new Set<string>([
    getOfficialChannelEnvPath(channelId, getDefaultClaudeConfigDir(), null),
    getOfficialChannelEnvPath(channelId),
  ]);

  for (const configDir of listManagedClaudeConfigDirs()) {
    envPaths.add(getOfficialChannelEnvPath(channelId, configDir, null));
  }

  return [...envPaths];
}

export function normalizeDiscordBotToken(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function readOfficialChannelTokenFromEnvContent(
  channelId: OfficialChannelId,
  content: string
): string | null {
  const envKey = getOfficialChannelEnvKey(channelId);
  if (!envKey) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${envKey}\\s*=\\s*(.*)\\s*$`));
    if (!match) {
      continue;
    }
    const parsed = parseEnvValue(match[1] ?? '');
    return parsed.length > 0 ? parsed : null;
  }

  return null;
}

export function readConfiguredOfficialChannelToken(channelId: OfficialChannelId): string | null {
  const content = readFileIfExists(getOfficialChannelEnvPath(channelId));
  return content ? readOfficialChannelTokenFromEnvContent(channelId, content) : null;
}

export function readOfficialChannelTokenFromProcessEnv(
  channelId: OfficialChannelId,
  envOverrides?: NodeJS.ProcessEnv | null
): string | null {
  const envKey = getOfficialChannelEnvKey(channelId);
  if (!envKey) {
    return null;
  }

  const rawValue = (envOverrides === undefined ? process.env : envOverrides)?.[envKey];
  if (typeof rawValue !== 'string') {
    return null;
  }

  return normalizeDiscordBotToken(rawValue);
}

export function hasConfiguredOfficialChannelToken(channelId: OfficialChannelId): boolean {
  return readConfiguredOfficialChannelToken(channelId) !== null;
}

export function getOfficialChannelTokenStatus(
  channelId: OfficialChannelId,
  envOverrides?: NodeJS.ProcessEnv | null
): OfficialChannelTokenStatus {
  const envKey = getOfficialChannelEnvKey(channelId);
  if (!envKey) {
    return {
      available: true,
      source: 'saved_env',
      savedInClaudeState: true,
      processEnvAvailable: false,
    };
  }

  const processEnvToken = readOfficialChannelTokenFromProcessEnv(channelId, envOverrides);
  const tokenPath = getOfficialChannelEnvPath(channelId);
  const savedToken = readConfiguredOfficialChannelToken(channelId);

  if (savedToken !== null) {
    return {
      available: true,
      source: 'saved_env',
      envKey,
      tokenPath,
      savedInClaudeState: true,
      processEnvAvailable: processEnvToken !== null,
    };
  }

  if (processEnvToken !== null) {
    return {
      available: true,
      source: 'process_env',
      envKey,
      savedInClaudeState: false,
      processEnvAvailable: true,
    };
  }

  return {
    available: false,
    source: 'missing',
    envKey,
    tokenPath,
    savedInClaudeState: false,
    processEnvAvailable: false,
  };
}

export function getOfficialChannelReadiness(channelId: OfficialChannelId): boolean {
  return isOfficialChannelTokenRequired(channelId)
    ? getOfficialChannelTokenStatus(channelId).available
    : true;
}

export function setConfiguredOfficialChannelToken(
  channelId: OfficialChannelId,
  token: string
): string {
  const envKey = getOfficialChannelEnvKey(channelId);
  if (!envKey) {
    throw new Error(`${channelId} does not use a bot token.`);
  }

  const normalized = normalizeDiscordBotToken(token);
  if (!normalized) {
    throw new Error(`${envKey} cannot be empty or multiline.`);
  }
  if (normalized.length > MAX_OFFICIAL_CHANNEL_TOKEN_LENGTH) {
    throw new Error(`${envKey} cannot exceed ${MAX_OFFICIAL_CHANNEL_TOKEN_LENGTH} characters.`);
  }

  const envPath = getOfficialChannelEnvPath(channelId);
  const currentContent = readFileIfExists(envPath) ?? '';
  writeSecureFile(envPath, upsertEnvValue(currentContent, envKey, normalized));
  return envPath;
}

export function clearConfiguredOfficialChannelToken(channelId: OfficialChannelId): string {
  const envPath = getOfficialChannelEnvPath(channelId);
  clearOfficialChannelTokenAtPath(channelId, envPath);
  return envPath;
}

export function clearConfiguredOfficialChannelTokensEverywhere(
  channelId?: OfficialChannelId
): string[] {
  const clearedPaths: string[] = [];
  const channels = channelId ? [channelId] : getOfficialChannelTokenIds();

  for (const tokenChannelId of channels) {
    for (const envPath of listManagedOfficialChannelEnvPaths(tokenChannelId)) {
      if (clearOfficialChannelTokenAtPath(tokenChannelId, envPath)) {
        clearedPaths.push(envPath);
      }
    }
  }

  return clearedPaths;
}
