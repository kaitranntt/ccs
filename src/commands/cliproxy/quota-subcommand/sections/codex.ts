/**
 * Codex provider section renderer for `ccs cliproxy quota`.
 *
 * Renders per-account quota bars for the 5h + weekly core usage windows plus
 * any additional feature windows (e.g. Codex Spark). Extracted verbatim from
 * the original god file.
 */

import { findAccountByQuery } from '../../../../cliproxy/accounts/account-manager';
import type { CodexQuotaResult } from '../../../../cliproxy/quota/quota-types';
import { color, dim, fail, ok, subheader, warn } from '../../../../utils/ui';
import {
  formatCodexWindowReset,
  getCodexCoreUsageWindows,
  getCodexWindowDisplayLabel,
} from '../codex-window-helpers';
import { displayQuotaFailure } from '../quota-failure-display';
import { formatCliAccountLabel, formatQuotaBar } from '../format-helpers';

/** Render the Codex quota section for a list of per-account results. */
export function displayCodexQuotaSection(
  results: {
    account: string;
    quota: CodexQuotaResult;
  }[]
): void {
  console.log(subheader(`Codex (${results.length} account${results.length !== 1 ? 's' : ''})`));
  console.log('');

  for (const { account, quota } of results) {
    const accountInfo = findAccountByQuery('codex', account);
    const accountLabel = accountInfo ? formatCliAccountLabel(accountInfo) : account;
    const defaultMark = accountInfo?.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultMark}`);
      displayQuotaFailure(quota);
      console.log('');
      continue;
    }

    const { fiveHourWindow, weeklyWindow } = getCodexCoreUsageWindows(quota.windows);
    const coreUsageWindows = [fiveHourWindow, weeklyWindow].filter(
      (w, index, arr): w is NonNullable<typeof w> => !!w && arr.indexOf(w) === index
    );
    const statusWindows = coreUsageWindows.length > 0 ? coreUsageWindows : quota.windows;

    const avgQuota =
      statusWindows.length > 0
        ? statusWindows.reduce((sum, w) => sum + w.remainingPercent, 0) / statusWindows.length
        : 0;
    const statusIcon = avgQuota > 50 ? ok('') : avgQuota > 10 ? warn('') : fail('');
    const planBadge = quota.planType ? color(` [${quota.planType}]`, 'info') : '';

    console.log(`  ${statusIcon}${accountLabel}${defaultMark}${planBadge}`);

    const coreUsageSummary = quota.coreUsage ?? {
      fiveHour: fiveHourWindow
        ? {
            label: fiveHourWindow.label,
            remainingPercent: fiveHourWindow.remainingPercent,
            resetAfterSeconds: fiveHourWindow.resetAfterSeconds,
            resetAt: fiveHourWindow.resetAt,
          }
        : null,
      weekly: weeklyWindow
        ? {
            label: weeklyWindow.label,
            remainingPercent: weeklyWindow.remainingPercent,
            resetAfterSeconds: weeklyWindow.resetAfterSeconds,
            resetAt: weeklyWindow.resetAt,
          }
        : null,
    };
    const resetParts: string[] = [];
    const fiveHourReset = coreUsageSummary.fiveHour
      ? formatCodexWindowReset(coreUsageSummary.fiveHour)
      : null;
    const weeklyReset = coreUsageSummary.weekly
      ? formatCodexWindowReset(coreUsageSummary.weekly)
      : null;
    if (fiveHourReset) resetParts.push(`5h ${fiveHourReset}`);
    if (weeklyReset) resetParts.push(`weekly ${weeklyReset}`);
    if (resetParts.length > 0) {
      console.log(`    ${dim(`Reset schedule: ${resetParts.join(' | ')}`)}`);
    }

    const orderedWindows = [fiveHourWindow, weeklyWindow, ...quota.windows].filter(
      (w, index, arr): w is NonNullable<typeof w> => !!w && arr.indexOf(w) === index
    );

    for (const window of orderedWindows) {
      const bar = formatQuotaBar(window.remainingPercent);
      const resetValue = formatCodexWindowReset(window);
      const resetLabel = resetValue ? dim(` Resets ${resetValue}`) : '';
      console.log(
        `    ${getCodexWindowDisplayLabel(window, orderedWindows).padEnd(24)} ${bar} ${window.remainingPercent.toFixed(0)}%${resetLabel}`
      );
    }
    console.log('');
  }
}
