/**
 * The bg-keepalive feature (shouldKeepSessionProxiesAlive, hasClaudeBackgroundWorker*,
 * backgroundProbe) was removed as dead code: the sole caller (claude-launcher.ts) never
 * provided a trusted hasBackgroundWorkerUsingBaseUrl detector, so the keepalive path was
 * unreachable. The ps-based detector was also spoofable (fixed in #1340). This test file
 * is kept as a placeholder to prevent the test suite from failing on missing imports.
 *
 * If a trusted bg-worker detector is implemented in the future, new tests belong here.
 */

import { describe, it } from 'bun:test';

describe('session bridge background proxy keepalive', () => {
  it('bg keepalive wiring removed — no dead code to test', () => {
    // No-op: feature scaffold removed per red-team finding on #1340.
  });
});
