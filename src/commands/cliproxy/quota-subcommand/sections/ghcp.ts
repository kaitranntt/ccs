/**
 * GitHub Copilot (ghcp) provider section renderer for `ccs cliproxy quota`.
 *
 * Renders per-account quota bars for premium interactions, chat, and
 * completions snapshots. Extracted verbatim from the original god file.
 */

import { findAccountByQuery } from '../../../../cliproxy/accounts/account-manager';
import type { GhcpQuotaResult } from '../../../../cliproxy/quota/quota-types';
import { color, dim, fail, info, ok, subheader, warn } from '../../../../utils/ui';
import { displayQuotaFailure } from '../quota-failure-display';
import { formatCliAccountLabel, formatQuotaBar, formatResetTimeISO } from '../format-helpers';

/** Format a single snapshot as a "used/entitlement" or "N% used (unlimited)" label. */
function formatSnapshotLabel(
  snapshot: GhcpQuotaResult['snapshots'][keyof GhcpQuotaResult['snapshots']]
): string {
  if (snapshot.unlimited) {
    return `${snapshot.percentUsed.toFixed(0)}% used (unlimited)`;
  }
  return `${snapshot.used}/${snapshot.entitlement} used`;
}

/** Render the GitHub Copilot quota section for a list of per-account results. */
export function displayGhcpQuotaSection(
  results: { account: string; quota: GhcpQuotaResult }[]
): void {
  console.log(
    subheader(`GitHub Copilot (${results.length} account${results.length !== 1 ? 's' : ''})`)
  );
  console.log('');

  for (const { account, quota } of results) {
    const accountInfo = findAccountByQuery('ghcp', account);
    const accountLabel = accountInfo ? formatCliAccountLabel(accountInfo) : account;
    const defaultMark = accountInfo?.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultMark}`);
      displayQuotaFailure(quota);
      console.log('');
      continue;
    }

    const reportedSnapshots = [
      quota.snapshots.premiumInteractions,
      quota.snapshots.chat,
      quota.snapshots.completions,
    ].filter((snapshot) => snapshot.reported !== false);
    const rows = reportedSnapshots.map((snapshot) =>
      snapshot.unlimited ? 100 : snapshot.percentRemaining
    );
    const minQuota = rows.length > 0 ? Math.min(...rows) : null;
    const statusIcon =
      minQuota === null ? info('') : minQuota > 50 ? ok('') : minQuota > 10 ? warn('') : fail('');
    const planBadge = quota.planType ? color(` [${quota.planType}]`, 'info') : '';

    console.log(`  ${statusIcon}${accountLabel}${defaultMark}${planBadge}`);
    if (quota.quotaResetDate) {
      console.log(`    ${dim(`Resets ${formatResetTimeISO(quota.quotaResetDate)}`)}`);
    }

    const allItems: Array<
      [string, GhcpQuotaResult['snapshots'][keyof GhcpQuotaResult['snapshots']]]
    > = [
      ['Premium interactions', quota.snapshots.premiumInteractions],
      ['Chat', quota.snapshots.chat],
      ['Completions', quota.snapshots.completions],
    ];
    const items = allItems.filter(([, snapshot]) => snapshot.reported !== false);

    for (const [label, snapshot] of items) {
      const bar = formatQuotaBar(snapshot.percentRemaining);
      const usageLabel = dim(` ${formatSnapshotLabel(snapshot)}`);
      console.log(
        `    ${label.padEnd(24)} ${bar} ${snapshot.percentRemaining.toFixed(0)}%${usageLabel}`
      );
    }

    console.log('');
  }
}
