/**
 * Claude provider section renderer for `ccs cliproxy quota`.
 *
 * Renders per-account quota bars for the 5h + weekly core usage windows plus
 * any per-model or overage windows. Extracted verbatim from the original
 * god file.
 */

import { findAccountByQuery } from '../../../../cliproxy/accounts/account-manager';
import type { ClaudeQuotaResult } from '../../../../cliproxy/quota/quota-types';
import { color, dim, fail, info, ok, subheader, warn } from '../../../../utils/ui';
import {
  getClaudeCoreUsageWindows,
  getClaudeWindowDisplayLabel,
  toClaudeDisplayWindow,
} from '../claude-window-helpers';
import { displayQuotaFailure } from '../quota-failure-display';
import { formatCliAccountLabel, formatQuotaBar, formatResetTimeISO } from '../format-helpers';
import type { ClaudeDisplayWindow } from '../types';

/** Render the Claude quota section for a list of per-account results. */
export function displayClaudeQuotaSection(
  results: {
    account: string;
    quota: ClaudeQuotaResult;
  }[]
): void {
  console.log(subheader(`Claude (${results.length} account${results.length !== 1 ? 's' : ''})`));
  console.log('');

  for (const { account, quota } of results) {
    const accountInfo = findAccountByQuery('claude', account);
    const accountLabel = accountInfo ? formatCliAccountLabel(accountInfo) : account;
    const defaultMark = accountInfo?.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultMark}`);
      displayQuotaFailure(quota);
      console.log('');
      continue;
    }

    const { fiveHourWindow, weeklyWindow } = getClaudeCoreUsageWindows(quota);
    const coreWindows = [fiveHourWindow, weeklyWindow].filter(
      (window, index, arr): window is ClaudeDisplayWindow =>
        !!window && arr.indexOf(window) === index
    );
    const statusWindows =
      coreWindows.length > 0 ? coreWindows : quota.windows.map(toClaudeDisplayWindow);
    const minQuota =
      statusWindows.length > 0
        ? Math.min(...statusWindows.map((window) => window.remainingPercent))
        : null;
    const statusIcon =
      minQuota === null ? info('') : minQuota > 50 ? ok('') : minQuota > 10 ? warn('') : fail('');

    console.log(`  ${statusIcon}${accountLabel}${defaultMark}`);

    const resetParts: string[] = [];
    if (fiveHourWindow?.resetAt)
      resetParts.push(`5h ${formatResetTimeISO(fiveHourWindow.resetAt)}`);
    if (weeklyWindow?.resetAt)
      resetParts.push(`weekly ${formatResetTimeISO(weeklyWindow.resetAt)}`);
    if (resetParts.length > 0) {
      console.log(`    ${dim(`Reset schedule: ${resetParts.join(' | ')}`)}`);
    }

    const orderedWindows = [...coreWindows, ...quota.windows.map(toClaudeDisplayWindow)].filter(
      (window, index, arr) =>
        arr.findIndex(
          (candidate) =>
            candidate.rateLimitType === window.rateLimitType &&
            candidate.resetAt === window.resetAt &&
            candidate.status === window.status
        ) === index
    );

    if (orderedWindows.length === 0) {
      console.log(`    ${dim('Policy limits unavailable for this account')}`);
      console.log('');
      continue;
    }

    for (const window of orderedWindows) {
      const bar = formatQuotaBar(window.remainingPercent);
      const resetLabel = window.resetAt ? dim(` Resets ${formatResetTimeISO(window.resetAt)}`) : '';
      const statusLabel =
        window.status === 'rejected'
          ? dim(' [blocked]')
          : window.status === 'allowed_warning'
            ? dim(' [warning]')
            : '';
      console.log(
        `    ${getClaudeWindowDisplayLabel(window).padEnd(24)} ${bar} ${window.remainingPercent.toFixed(0)}%${statusLabel}${resetLabel}`
      );
    }
    console.log('');
  }
}
