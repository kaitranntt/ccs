/**
 * Internal test-only exports for the quota subcommand.
 *
 * The unit test at tests/unit/commands/cliproxy-quota-subcommand.test.ts loads
 * the barrel module and reads `__testExports` to exercise pure helpers. Keep
 * this surface stable: adding a key is fine, but removing or renaming one
 * will break the test.
 */

import { getCodexWindowDisplayLabel } from './codex-window-helpers';
import { getQuotaFailureDisplayEntries } from './quota-failure-display';
import { prettifyCodexFeatureLabel } from './codex-window-helpers';
import { resolveDisplayedTier } from './format-helpers';

export const __testExports = {
  getCodexWindowDisplayLabel,
  getQuotaFailureDisplayEntries,
  prettifyCodexFeatureLabel,
  resolveDisplayedTier,
};
