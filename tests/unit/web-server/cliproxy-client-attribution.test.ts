import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  attributeSnapshotClientKeys,
  buildUsageResponseFromQueueRecords,
  mergeUsageResponses,
  mergeUsageResponseWithMissingDetails,
} from '../../../src/cliproxy/services/usage-compatibility-transformer';
import {
  extractCliproxyUsageHistoryDetails,
  mergeCliproxyUsageHistoryDetails,
  normalizeCliproxyUsageHistoryDetail,
} from '../../../src/web-server/usage/cliproxy-usage-transformer';

const record = {
  timestamp: '2026-09-01T00:00:00Z',
  provider: 'test',
  model: 'test-model',
  source: 'provider-account',
  auth_index: 'upstream-account',
  tokens: { input_tokens: 10, output_tokens: 2 },
  failed: false,
};

describe('CLIProxy client-key attribution', () => {
  let directory: string;
  let originalHome: string | undefined;
  beforeEach(() => {
    originalHome = process.env.CCS_HOME;
    directory = mkdtempSync(join(tmpdir(), 'ccs-attribution-test-'));
    process.env.CCS_HOME = directory;
  });
  afterEach(() => {
    if (originalHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalHome;
    rmSync(directory, { recursive: true, force: true });
  });
  it('retains pre-patch history across a non-overlapping legacy-to-queue cutover', () => {
    const key = 'synthetic-transition-key';
    const event = (timestamp: string) => ({
      ...record,
      timestamp,
      provider: 'codex',
      tokens: { ...record.tokens, total_tokens: 12 },
    });
    const old = event('2026-09-01T00:00:00Z');
    // Pre-patch history has neither client attribution nor a stable snapshot identity.
    let saved = extractCliproxyUsageHistoryDetails(buildUsageResponseFromQueueRecords([old]));
    const legacyEvent = event('2026-09-01T00:01:00Z');
    const bucket = buildUsageResponseFromQueueRecords([legacyEvent]).usage!.apis!.codex;
    const legacy = extractCliproxyUsageHistoryDetails(
      attributeSnapshotClientKeys({ usage: { apis: { [key]: bucket } } }, [key])
    );
    saved = mergeCliproxyUsageHistoryDetails(saved, legacy);
    saved = mergeCliproxyUsageHistoryDetails(saved, legacy);
    const file = join(directory, 'transition-history.json');
    writeFileSync(file, JSON.stringify(saved));
    saved = JSON.parse(readFileSync(file, 'utf8')).map(normalizeCliproxyUsageHistoryDetail);
    // The restarted backend supplies only post-cutover requests, not imported history.
    const queued = extractCliproxyUsageHistoryDetails(
      buildUsageResponseFromQueueRecords([{ ...event('2026-09-01T00:02:00Z'), api_key: key }])
    );
    saved = mergeCliproxyUsageHistoryDetails(saved, queued);
    saved = mergeCliproxyUsageHistoryDetails(saved, queued);
    expect(saved).toHaveLength(3);
    expect(saved.reduce((sum, detail) => sum + (detail.totalTokens ?? 0), 0)).toBe(36);
    expect(saved[0].clientKeyId).toBeUndefined();
    const id = createHash('sha256').update(key).digest('hex');
    expect(saved.slice(1).map((detail) => detail.clientKeyId)).toEqual([id, id]);
    // Persisted pricing-provider normalization maps Codex to OpenAI.
    expect(saved[2].provider).toBe('openai');
    expect(JSON.stringify(saved)).not.toContain(key);
  });
  it('hashes inbound keys without confusing them with provider accounts', () => {
    const response = buildUsageResponseFromQueueRecords([
      { ...record, api_key: 'synthetic-key-a' },
    ]);
    const detail = response.usage!.apis!.test.models!['test-model'].details![0];
    expect(detail.client_key_id).toBe(createHash('sha256').update('synthetic-key-a').digest('hex'));
    expect(detail.auth_index).toBe('upstream-account');
    expect(JSON.stringify(response)).not.toContain('synthetic-key-a');
  });

  it('does not duplicate the same provider snapshot across an ordinary CCS upgrade', () => {
    const snapshot = buildUsageResponseFromQueueRecords([{ ...record, provider: 'codex' }]);
    const before = extractCliproxyUsageHistoryDetails(snapshot);
    const after = extractCliproxyUsageHistoryDetails(attributeSnapshotClientKeys(snapshot, []));
    const merged = mergeCliproxyUsageHistoryDetails(before, after);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalTokens).toBe(12);
  });

  it('retains exact provider aliases for local-log duplicate suppression', () => {
    const event = { ...record, provider: 'openai', request_id: 'same-request' };
    const snapshot = buildUsageResponseFromQueueRecords([event]);
    const log = buildUsageResponseFromQueueRecords([
      { ...event, tokens: { input_tokens: 0, output_tokens: 0 } },
    ]);
    const merged = mergeUsageResponseWithMissingDetails(
      attributeSnapshotClientKeys(snapshot, []),
      log
    );
    expect(merged.usage!.total_requests).toBe(1);
    expect(merged.usage!.total_tokens).toBe(12);
    const bucket = snapshot.usage!.apis!.openai;
    const credentialSnapshot = {
      usage: { total_requests: 1, total_tokens: 12, apis: { 'synthetic-key': bucket } },
    };
    const credentialMerged = mergeUsageResponseWithMissingDetails(
      attributeSnapshotClientKeys(credentialSnapshot, ['synthetic-key']),
      log
    );
    expect(credentialMerged.usage!.total_requests).toBe(1);
    expect(credentialMerged.usage!.total_tokens).toBe(12);
  });

  it('rejects ambiguous old credential history rather than silently duplicating or assigning it', () => {
    const bucket = buildUsageResponseFromQueueRecords([record]).usage!.apis!.test;
    const snapshot = { usage: { apis: { 'synthetic-key': bucket } } };
    const before = extractCliproxyUsageHistoryDetails(snapshot);
    const original = JSON.stringify(before);
    const after = extractCliproxyUsageHistoryDetails(
      attributeSnapshotClientKeys(snapshot, ['synthetic-key'])
    );
    expect(() => mergeCliproxyUsageHistoryDetails(before, after)).toThrow('Legacy usage overlaps');
    expect(JSON.stringify(before)).toBe(original);
  });

  it('attributes populated legacy snapshots without retaining credential bucket labels', () => {
    const queue = buildUsageResponseFromQueueRecords([{ ...record }]);
    const bucket = queue.usage!.apis!.test;
    const snapshot = {
      usage: {
        total_requests: 2,
        apis: {
          'synthetic-key-a': bucket,
          'retired-synthetic-key': bucket,
        },
      },
    };
    const normalized = attributeSnapshotClientKeys(snapshot, ['synthetic-key-a']);
    const details = normalized.usage!.apis!.unknown.models!['test-model'].details!;
    expect(details).toHaveLength(2);
    expect(details[0].client_key_id).toBe(
      createHash('sha256').update('synthetic-key-a').digest('hex')
    );
    expect(details[1].client_key_id).toBeUndefined();
    expect(JSON.stringify(normalized)).not.toContain('synthetic-key');
    expect(snapshot.usage.apis['synthetic-key-a']).toBe(bucket);
    const unknown = attributeSnapshotClientKeys(snapshot, []);
    expect(JSON.stringify(unknown)).not.toContain('synthetic-key');
    expect(unknown.usage!.total_requests).toBe(2);
  });

  it('keeps identical requests from different keys through merge, history and reload', () => {
    const a = buildUsageResponseFromQueueRecords([{ ...record, api_key: 'synthetic-key-a' }]);
    const b = buildUsageResponseFromQueueRecords([{ ...record, api_key: 'synthetic-key-b' }]);
    const merged = mergeUsageResponses(a, b);
    expect(merged.usage!.total_requests).toBe(2);
    expect(mergeUsageResponseWithMissingDetails(a, b).usage!.total_requests).toBe(2);
    const accounts = new Map([['upstream-account', 'provider-account']]);
    const history = extractCliproxyUsageHistoryDetails(merged, accounts);
    expect(new Set(history.map((detail) => detail.clientKeyId)).size).toBe(2);
    expect(history.every((detail) => detail.accountId === 'provider-account')).toBe(true);
    const saved = mergeCliproxyUsageHistoryDetails([history[0]], [history[1]]);
    expect(saved).toHaveLength(2);
    const restored = JSON.parse(JSON.stringify(saved)).map(normalizeCliproxyUsageHistoryDetail);
    expect(restored).toEqual(saved);
    expect(mergeCliproxyUsageHistoryDetails(saved, history)).toHaveLength(2);
    expect(JSON.stringify(saved)).not.toContain('synthetic-key');
    expect(saved.reduce((sum, detail) => sum + detail.inputTokens, 0)).toBe(20);
  });

  it('preserves recognized providers but rejects provider-named credentials as ambiguous', () => {
    const snapshot = buildUsageResponseFromQueueRecords([{ ...record, provider: 'codex' }]);
    const normalized = attributeSnapshotClientKeys(snapshot, []);
    expect(normalized.usage!.apis!.codex).toMatchObject(snapshot.usage!.apis!.codex);
    expect(() => attributeSnapshotClientKeys(snapshot, ['codex'])).toThrow(
      'matching a recognized provider label'
    );
    const saved = extractCliproxyUsageHistoryDetails(normalized);
    const id = createHash('sha256').update('codex').digest('hex');
    const previousPatch = saved.map((detail) => ({
      ...detail,
      usageBucketId: id,
      clientKeyId: id,
    }));
    expect(() => mergeCliproxyUsageHistoryDetails(previousPatch, saved)).toThrow(
      'Legacy usage overlaps'
    );
  });

  it('leaves missing or invalid keys unattributed and supports legacy history', () => {
    for (const api_key of [undefined, null, '', ' ', 123]) {
      const response = buildUsageResponseFromQueueRecords([{ ...record, api_key }]);
      const history = extractCliproxyUsageHistoryDetails(response);
      expect(history[0].clientKeyId).toBeUndefined();
      expect(normalizeCliproxyUsageHistoryDetail(history[0])).toEqual(history[0]);
      expect(
        normalizeCliproxyUsageHistoryDetail({ ...history[0], clientKeyId: 'raw-key' })?.clientKeyId
      ).toBeUndefined();
    }
  });

  it('keeps snapshot identity stable through metadata failure, recovery, rotation and reload', () => {
    const bucket = buildUsageResponseFromQueueRecords([record]).usage!.apis!.test;
    const snapshot = { usage: { apis: { 'synthetic-key-a': bucket, 'synthetic-key-b': bucket } } };
    const collect = (keys: string[]) =>
      extractCliproxyUsageHistoryDetails(attributeSnapshotClientKeys(snapshot, keys));
    const hash = (key: string) => createHash('sha256').update(key).digest('hex');
    let saved = collect([]);
    expect(saved).toHaveLength(2);
    expect(saved.every((detail) => !detail.clientKeyId)).toBe(true);
    for (const keys of [
      ['synthetic-key-a', 'synthetic-key-b'],
      [],
      ['synthetic-key-b', 'synthetic-key-c'],
      ['synthetic-key-a', 'synthetic-key-b'],
    ]) {
      saved = mergeCliproxyUsageHistoryDetails(saved, collect(keys));
      saved = JSON.parse(JSON.stringify(saved)).map(normalizeCliproxyUsageHistoryDetail);
      expect(saved).toHaveLength(2);
      expect(new Set(saved.map((detail) => detail.clientKeyId))).toEqual(
        new Set([hash('synthetic-key-a'), hash('synthetic-key-b')])
      );
      expect(saved.reduce((sum, detail) => sum + detail.inputTokens, 0)).toBe(20);
      expect(JSON.stringify(saved)).not.toContain('synthetic-key');
    }
    const rotated = { usage: { apis: { 'synthetic-key-c': bucket } } };
    saved = mergeCliproxyUsageHistoryDetails(
      saved,
      extractCliproxyUsageHistoryDetails(attributeSnapshotClientKeys(rotated, ['synthetic-key-c']))
    );
    expect(saved).toHaveLength(3);
  });

  it('preserves identical request multiplicity when snapshot metadata recovers', () => {
    const bucket = buildUsageResponseFromQueueRecords([record, record]).usage!.apis!.test;
    const snapshot = { usage: { apis: { 'synthetic-key-a': bucket } } };
    const unknown = extractCliproxyUsageHistoryDetails(attributeSnapshotClientKeys(snapshot, []));
    const known = extractCliproxyUsageHistoryDetails(
      attributeSnapshotClientKeys(snapshot, ['synthetic-key-a'])
    );
    expect(mergeCliproxyUsageHistoryDetails(unknown, known)).toHaveLength(2);
    expect(mergeCliproxyUsageHistoryDetails(known, unknown)).toHaveLength(2);
  });
});
