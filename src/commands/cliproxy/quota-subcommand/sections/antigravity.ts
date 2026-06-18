/**
 * Antigravity (agy) provider section renderer for `ccs cliproxy quota`.
 *
 * Renders the account table with per-account average quota, tier, and status
 * (paused / cooldown). Extracted verbatim from the original god file.
 */

import { getProviderAccounts } from '../../../../cliproxy/accounts/account-manager';
import { fetchAllProviderQuotas } from '../../../../cliproxy/quota/quota-fetcher';
import { isOnCooldown } from '../../../../cliproxy/quota/quota-manager';
import { color, subheader, table } from '../../../../utils/ui';
import { formatCliAccountLabel, resolveDisplayedTier } from '../format-helpers';

/** Render the Antigravity quota section for a fetched quota result. */
export function displayAntigravityQuotaSection(
  quotaResult: Awaited<ReturnType<typeof fetchAllProviderQuotas>>
): void {
  const provider = 'agy';
  const accounts = getProviderAccounts(provider);

  console.log(
    subheader(`Antigravity (${accounts.length} account${accounts.length !== 1 ? 's' : ''})`)
  );
  console.log('');

  const rows: string[][] = [];
  for (const account of accounts) {
    const quotaData = quotaResult.accounts.find((q) => q.account.id === account.id);
    const quota = quotaData?.quota;

    let avgQuota = 'N/A';
    if (quota?.success && quota.models.length > 0) {
      const avg = Math.round(
        quota.models.reduce((sum, m) => sum + m.percentage, 0) / quota.models.length
      );
      avgQuota = `${avg}%`;
    }

    const statusParts: string[] = [];
    if (account.paused) statusParts.push(color('PAUSED', 'warning'));
    if (isOnCooldown(provider, account.id)) statusParts.push(color('COOLDOWN', 'warning'));

    const defaultMark = account.isDefault ? color('*', 'success') : ' ';
    const tier = resolveDisplayedTier(account.tier, quota?.entitlement?.normalizedTier);
    const status = statusParts.join(', ');

    rows.push([defaultMark, formatCliAccountLabel(account), tier, avgQuota, status]);
  }

  console.log(
    table(rows, {
      head: ['', 'Account', 'Tier', 'Quota', 'Status'],
      colWidths: [3, 30, 10, 10, 20],
    })
  );
  console.log('');
}
