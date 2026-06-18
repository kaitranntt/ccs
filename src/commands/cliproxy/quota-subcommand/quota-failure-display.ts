/**
 * Quota failure display helpers.
 *
 * Builds the multi-line failure block shown beneath a failed account row.
 * Extracted from the original god file verbatim so the CLI output and the
 * unit tests in tests/unit/commands/cliproxy-quota-subcommand.test.ts keep
 * their exact behavior.
 */

import type { QuotaErrorMetadata } from '../../../cliproxy/quota/quota-types';
import { color, dim, info } from '../../../utils/ui';
import type { QuotaFailureDisplayEntry } from './types';

/**
 * Build the ordered list of failure display entries for a quota error.
 *
 * Order is:
 *   1. error message (always)
 *   2. action hint (if present)
 *   3. diagnostics line: HTTP status | error code | retryable flag (if any)
 *   4. detail line (only if it differs from the error message)
 */
export function getQuotaFailureDisplayEntries(
  quota: QuotaErrorMetadata & {
    error?: string;
  }
): QuotaFailureDisplayEntry[] {
  const entries: QuotaFailureDisplayEntry[] = [
    {
      tone: 'error',
      text: quota.error || 'Failed to fetch quota',
    },
  ];

  if (quota.actionHint) {
    entries.push({
      tone: 'info',
      text: quota.actionHint,
    });
  }

  const diagnostics: string[] = [];
  if (typeof quota.httpStatus === 'number') {
    diagnostics.push(`HTTP ${quota.httpStatus}`);
  }
  if (quota.errorCode) {
    diagnostics.push(`Code: ${quota.errorCode}`);
  }
  if (quota.retryable) {
    diagnostics.push('Retryable');
  }
  if (diagnostics.length > 0) {
    entries.push({
      tone: 'dim',
      text: diagnostics.join(' | '),
    });
  }

  const normalizedError = quota.error?.trim();
  const normalizedDetail = quota.errorDetail?.trim();
  if (normalizedDetail && normalizedDetail !== normalizedError) {
    entries.push({
      tone: 'dim',
      text: `Detail: ${normalizedDetail}`,
    });
  }

  return entries;
}

/** Render the failure block for a single failed account to stdout. */
export function displayQuotaFailure(
  quota: QuotaErrorMetadata & {
    error?: string;
  }
): void {
  for (const entry of getQuotaFailureDisplayEntries(quota)) {
    const rendered =
      entry.tone === 'error'
        ? color(entry.text, 'error')
        : entry.tone === 'info'
          ? info(entry.text)
          : dim(entry.text);
    console.log(`    ${rendered}`);
  }
}
