import { describe, expect, it } from 'bun:test';
import { displayClaudeQuotaSection } from '../../../src/commands/cliproxy/quota-subcommand/sections/claude';
import { displayCodexQuotaSection } from '../../../src/commands/cliproxy/quota-subcommand/sections/codex';
import { displayGeminiCliQuotaSection } from '../../../src/commands/cliproxy/quota-subcommand/sections/gemini-cli';

async function loadQuotaCommandTestExports() {
  const moduleId = Date.now() + Math.random();
  const mod = await import(
    `../../../src/commands/cliproxy/quota-subcommand?cliproxy-quota-subcommand=${moduleId}`
  );
  return mod.__testExports;
}

describe('cliproxy quota subcommand failure formatting', () => {
  it('renders Claude usage-probe 429 as a warning with an inference-safe hint', () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));

    try {
      displayClaudeQuotaSection([
        {
          account: 'healthy@example.com',
          quota: {
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            lastUpdated: 1,
            accountId: 'healthy@example.com',
            error: 'Claude usage status temporarily unavailable',
            errorCode: 'usage_probe_unavailable',
            actionHint:
              'Inference may still be available. Retry the Claude quota status check later.',
            httpStatus: 429,
            errorDetail: 'retry-after:0',
            retryable: true,
          },
        },
      ]);
    } finally {
      console.log = originalLog;
    }

    expect(output.join('\n')).toContain('[!] healthy@example.com');
    expect(output.join('\n')).not.toContain('[X] healthy@example.com');
    expect(output.join('\n')).toContain('Claude usage status temporarily unavailable');
    expect(output.join('\n')).toContain('Inference may still be available');
    expect(output.join('\n')).toContain('HTTP 429 | Code: usage_probe_unavailable | Retryable');
    expect(output.join('\n')).toContain('Detail: retry-after:0');
  });

  it('builds Gemini failure lines with the remediation hint, code, and detail', async () => {
    const { getQuotaFailureDisplayEntries } = await loadQuotaCommandTestExports();

    const entries = getQuotaFailureDisplayEntries({
      error: 'Google requires you to verify this account before using Gemini CLI quota.',
      actionHint:
        'Complete the Google account verification mentioned above, then retry quota refresh.',
      httpStatus: 403,
      errorCode: 'PERMISSION_DENIED',
      errorDetail: 'ACCOUNT_VERIFICATION_REQUIRED',
      retryable: false,
    });

    expect(entries).toEqual([
      {
        tone: 'error',
        text: 'Google requires you to verify this account before using Gemini CLI quota.',
      },
      {
        tone: 'info',
        text: 'Complete the Google account verification mentioned above, then retry quota refresh.',
      },
      {
        tone: 'dim',
        text: 'HTTP 403 | Code: PERMISSION_DENIED',
      },
      {
        tone: 'dim',
        text: 'Detail: ACCOUNT_VERIFICATION_REQUIRED',
      },
    ]);
  });

  it('marks retryable failures in the CLI diagnostics line', async () => {
    const { getQuotaFailureDisplayEntries } = await loadQuotaCommandTestExports();

    const entries = getQuotaFailureDisplayEntries({
      error: 'Gemini quota service unavailable (HTTP 503)',
      actionHint: 'Retry later. This looks like a temporary Google upstream problem.',
      httpStatus: 503,
      errorCode: 'provider_unavailable',
      errorDetail: 'Service temporarily unavailable',
      retryable: true,
    });

    expect(entries[2]).toEqual({
      tone: 'dim',
      text: 'HTTP 503 | Code: provider_unavailable | Retryable',
    });
  });

  it('suppresses duplicate error detail lines', async () => {
    const { getQuotaFailureDisplayEntries } = await loadQuotaCommandTestExports();

    const entries = getQuotaFailureDisplayEntries({
      error: 'Internal Server Error',
      errorDetail: 'Internal Server Error',
    });

    expect(entries).toEqual([
      {
        tone: 'error',
        text: 'Internal Server Error',
      },
    ]);
  });

  it('prefers live quota tier over stale account tier', async () => {
    const { resolveDisplayedTier } = await loadQuotaCommandTestExports();

    expect(resolveDisplayedTier('unknown', 'pro')).toBe('pro');
    expect(resolveDisplayedTier('pro', 'ultra')).toBe('ultra');
    expect(resolveDisplayedTier('pro', 'unknown')).toBe('pro');
  });
});

describe('cliproxy quota subcommand Codex label formatting', () => {
  it('falls back to the cached window label for invalid Codex feature labels', async () => {
    const { getCodexWindowDisplayLabel } = await loadQuotaCommandTestExports();

    const cases = [
      { featureLabel: '', cadence: '5h', expected: 'Codex Spark (5h)' },
      { featureLabel: '   ', cadence: 'weekly', expected: 'Codex Spark (weekly)' },
      {
        featureLabel: '\u001b[2J\u001b]52;c;payload\u0007',
        cadence: '5h',
        expected: 'Codex Spark (5h)',
      },
      { featureLabel: { unexpected: true }, cadence: '5h', expected: 'Codex Spark (5h)' },
    ] as const;

    for (const { featureLabel, cadence, expected } of cases) {
      const label = getCodexWindowDisplayLabel({
        label: 'GPT-5.3-Codex-Spark',
        resetAfterSeconds: 3600,
        category: 'additional',
        cadence,
        featureLabel,
      } as never);

      expect(label).toBe(expected);
    }
  });

  it('removes terminal control characters from cached Codex feature labels', async () => {
    const { getCodexWindowDisplayLabel } = await loadQuotaCommandTestExports();

    const label = getCodexWindowDisplayLabel({
      label: 'ignored',
      resetAfterSeconds: 3600,
      category: 'additional',
      cadence: 'weekly',
      featureLabel: '\u001b[2JGPT-5.3-Codex-Spark\u001b]52;c;payload\u0007',
    });

    expect(label).toBe('Codex Spark (weekly)');
    expect(label).not.toContain('\u001b');
    expect(label).not.toContain('\u0007');
  });
});

function captureConsoleLog(fn: () => void): string {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return output.join('\n');
}

describe('cliproxy quota remaining percent labels', () => {
  it('renders Claude remaining percent with a remaining suffix', () => {
    const text = captureConsoleLog(() => {
      displayClaudeQuotaSection([
        {
          account: 'claude@example.com',
          quota: {
            success: true,
            windows: [
              {
                rateLimitType: 'five_hour',
                label: '5h usage limit',
                status: 'allowed',
                utilization: 0.28,
                usedPercent: 28,
                remainingPercent: 72,
                resetAt: null,
              },
            ],
            coreUsage: { fiveHour: null, weekly: null },
            lastUpdated: 1,
            accountId: 'claude@example.com',
          },
        },
      ]);
    });

    expect(text).toContain('72% remaining');
  });

  it('renders Codex remaining percent with a remaining suffix', () => {
    const text = captureConsoleLog(() => {
      displayCodexQuotaSection([
        {
          account: 'codex@example.com',
          quota: {
            success: true,
            windows: [
              {
                label: 'Primary',
                usedPercent: 28,
                remainingPercent: 72,
                resetAfterSeconds: null,
                resetAt: null,
                category: 'usage',
                cadence: '5h',
              },
            ],
            planType: 'pro',
            lastUpdated: 1,
            accountId: 'codex@example.com',
          },
        },
      ]);
    });

    expect(text).toContain('72% remaining');
  });

  it('renders Gemini CLI remaining percent with a remaining suffix', () => {
    const text = captureConsoleLog(() => {
      displayGeminiCliQuotaSection([
        {
          account: 'gemini@example.com',
          quota: {
            success: true,
            buckets: [
              {
                id: 'gemini-flash-series',
                label: 'Gemini Flash Series',
                tokenType: null,
                remainingFraction: 0.72,
                remainingPercent: 72,
                resetTime: null,
                modelIds: ['gemini-flash'],
              },
            ],
            projectId: null,
            lastUpdated: 1,
            accountId: 'gemini@example.com',
          },
        },
      ]);
    });

    expect(text).toContain('72% remaining');
  });
});
