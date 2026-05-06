import * as fs from 'fs';
import * as path from 'path';

import { getCliproxyWritablePath } from '../config/path-resolver';
import type { CliproxyUsageApiResponse } from './stats-fetcher';
import {
  buildUsageResponseFromQueueRecords,
  hasUsageDetails,
} from './usage-compatibility-transformer';

interface PendingOAuthRequest {
  timestamp: string;
  provider: string;
  model: string;
  authFile: string;
  requestId?: string;
}

interface ProviderCompletion {
  timestamp: string;
  provider: string;
  requestId?: string;
  failed: boolean;
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function extractTimestamp(line: string): string {
  const timestamp = line.match(/\d{4}-\d{2}-\d{2}T[^\s\]]+/)?.[0];
  return timestamp ? timestamp.replace(/[,\]]+$/, '') : new Date().toISOString();
}

function extractRequestId(line: string): string | undefined {
  return line.match(/\b(?:request[_-]?id|req[_-]?id|rid)[=:]\s*([A-Za-z0-9._:-]+)/i)?.[1];
}

function parseOAuthSelection(line: string): PendingOAuthRequest | null {
  const match = line.match(
    /Use OAuth\s+provider=([^\s]+)\s+auth_file=("[^"]+"|'[^']+'|[^\s]+)\s+for model\s+("[^"]+"|'[^']+'|[^\s]+)/i
  );
  if (!match) {
    return null;
  }

  return {
    timestamp: extractTimestamp(line),
    provider: unquote(match[1] ?? 'unknown'),
    authFile: unquote(match[2] ?? 'unknown'),
    model: unquote(match[3] ?? 'unknown'),
    requestId: extractRequestId(line),
  };
}

function parseProviderCompletion(line: string): ProviderCompletion | null {
  const match = line.match(/\b(?:POST|GET)\s+"?\/api\/provider\/([^/"\s]+)\//i);
  if (!match) {
    return null;
  }

  return {
    timestamp: extractTimestamp(line),
    provider: unquote(match[1] ?? 'unknown'),
    requestId: extractRequestId(line),
    failed:
      /\b(?:failed|failure|error)\b/i.test(line) ||
      /\bstatus[=:]\s*[45]\d\d\b/i.test(line) ||
      /\s[45]\d\d(?:\s|$)/.test(line),
  };
}

function addPendingRequest(
  pending: PendingOAuthRequest,
  byRequestId: Map<string, PendingOAuthRequest>,
  byProvider: Map<string, PendingOAuthRequest[]>
): void {
  if (pending.requestId) {
    byRequestId.set(pending.requestId, pending);
  }

  const providerQueue = byProvider.get(pending.provider) ?? [];
  providerQueue.push(pending);
  byProvider.set(pending.provider, providerQueue);
}

function takePendingRequest(
  completion: ProviderCompletion,
  byRequestId: Map<string, PendingOAuthRequest>,
  byProvider: Map<string, PendingOAuthRequest[]>
): PendingOAuthRequest | null {
  const byId = completion.requestId ? byRequestId.get(completion.requestId) : undefined;
  if (byId) {
    byRequestId.delete(completion.requestId ?? '');
    const providerQueue = byProvider.get(byId.provider) ?? [];
    byProvider.set(
      byId.provider,
      providerQueue.filter((entry) => entry !== byId)
    );
    return byId;
  }

  const providerQueue = byProvider.get(completion.provider) ?? [];
  const next = providerQueue.shift();
  byProvider.set(completion.provider, providerQueue);
  return next ?? null;
}

export function buildUsageResponseFromCliproxyLogLines(lines: string[]): CliproxyUsageApiResponse {
  const pendingByRequestId = new Map<string, PendingOAuthRequest>();
  const pendingByProvider = new Map<string, PendingOAuthRequest[]>();
  const records: unknown[] = [];

  for (const line of lines) {
    const selection = parseOAuthSelection(line);
    if (selection) {
      addPendingRequest(selection, pendingByRequestId, pendingByProvider);
      continue;
    }

    const completion = parseProviderCompletion(line);
    if (!completion) {
      continue;
    }

    const pending = takePendingRequest(completion, pendingByRequestId, pendingByProvider);
    if (!pending) {
      continue;
    }

    records.push({
      timestamp: completion.timestamp || pending.timestamp,
      provider: pending.provider,
      model: pending.model,
      source: `provider=${pending.provider} auth_file=${pending.authFile}`,
      auth_index: pending.authFile,
      failed: completion.failed,
      tokens: {},
    });
  }

  return buildUsageResponseFromQueueRecords(records);
}

function readLogFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf-8');
}

export function buildUsageResponseFromCliproxyMainLog(): CliproxyUsageApiResponse | null {
  const logPath = path.join(getCliproxyWritablePath(), 'logs', 'main.log');
  const contents = readLogFile(logPath);
  if (!contents) {
    return null;
  }

  const response = buildUsageResponseFromCliproxyLogLines(contents.split(/\r?\n/));
  return hasUsageDetails(response) ? response : null;
}
