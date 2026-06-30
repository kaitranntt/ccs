/**
 * Gemini CLI provider section renderer for `ccs cliproxy quota`.
 *
 * Renders per-account quota bars for each bucket (requests, tokens, etc.)
 * plus project, tier, and credit balance metadata. Extracted verbatim from
 * the original god file.
 */

import { findAccountByQuery } from '../../../../cliproxy/accounts/account-manager';
import type { GeminiCliQuotaResult } from '../../../../cliproxy/quota/quota-types';
import { color, dim, fail, ok, subheader, warn } from '../../../../utils/ui';
import { displayQuotaFailure } from '../quota-failure-display';
import { formatCliAccountLabel, formatQuotaBar, formatResetTimeISO } from '../format-helpers';

/** Render the Gemini CLI quota section for a list of per-account results. */
export function displayGeminiCliQuotaSection(
  results: {
    account: string;
    quota: GeminiCliQuotaResult;
  }[]
): void {
  console.log(
    subheader(`Gemini CLI (${results.length} account${results.length !== 1 ? 's' : ''})`)
  );
  console.log('');

  for (const { account, quota } of results) {
    const accountInfo = findAccountByQuery('gemini', account);
    const accountLabel = accountInfo ? formatCliAccountLabel(accountInfo) : account;
    const defaultMark = accountInfo?.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultMark}`);
      displayQuotaFailure(quota);
      console.log('');
      continue;
    }

    const avgQuota =
      quota.buckets.length > 0
        ? quota.buckets.reduce((sum, b) => sum + b.remainingPercent, 0) / quota.buckets.length
        : 0;
    const statusIcon = avgQuota > 50 ? ok('') : avgQuota > 10 ? warn('') : fail('');

    console.log(`  ${statusIcon}${accountLabel}${defaultMark}`);
    if (quota.projectId) {
      console.log(`    Project: ${dim(quota.projectId)}`);
    }
    if (quota.tierLabel) {
      console.log(`    Tier: ${dim(quota.tierLabel)}`);
    }
    if (quota.entitlement?.rawTierId) {
      console.log(`    Tier ID: ${dim(quota.entitlement.rawTierId)}`);
    }
    if (quota.creditBalance !== null && quota.creditBalance !== undefined) {
      console.log(`    Credits: ${dim(quota.creditBalance.toLocaleString())}`);
    }

    for (const bucket of quota.buckets) {
      const bar = formatQuotaBar(bucket.remainingPercent);
      const tokenLabel = bucket.tokenType ? dim(` (${bucket.tokenType})`) : '';
      const amountLabel =
        bucket.remainingAmount !== null && bucket.remainingAmount !== undefined
          ? dim(` ${bucket.remainingAmount.toLocaleString()} left`)
          : '';
      const resetLabel = bucket.resetTime
        ? dim(` Resets ${formatResetTimeISO(bucket.resetTime)}`)
        : '';
      console.log(
        `    ${bucket.label.padEnd(24)} ${bar} ${bucket.remainingPercent.toFixed(0)}%${tokenLabel}${amountLabel}${resetLabel}`
      );
    }
    console.log('');
  }
}
