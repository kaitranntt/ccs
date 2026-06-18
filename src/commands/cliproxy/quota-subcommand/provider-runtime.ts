/**
 * Per-provider runtime adapters for the quota command.
 *
 * Each entry wires a fetcher (from cliproxy/quota/*) to its section renderer
 * and provides the empty-state strings shown when no accounts are configured.
 * The runtime map is consumed by handleQuotaStatus in handlers.ts.
 */

import type {
  ClaudeQuotaResult,
  CodexQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from '../../../cliproxy/quota/quota-types';
import { fetchAllClaudeQuotas } from '../../../cliproxy/quota/quota-fetcher-claude';
import { fetchAllCodexQuotas } from '../../../cliproxy/quota/quota-fetcher-codex';
import { fetchAllGeminiCliQuotas } from '../../../cliproxy/quota/quota-fetcher-gemini-cli';
import { fetchAllGhcpQuotas } from '../../../cliproxy/quota/quota-fetcher-ghcp';
import { fetchAllProviderQuotas } from '../../../cliproxy/quota/quota-fetcher';
import type { QuotaSupportedProvider } from '../../../cliproxy/provider-capabilities';
import type { QuotaProviderRuntime } from './types';
import { displayAntigravityQuotaSection } from './sections/antigravity';
import { displayClaudeQuotaSection } from './sections/claude';
import { displayCodexQuotaSection } from './sections/codex';
import { displayGhcpQuotaSection } from './sections/ghcp';
import { displayGeminiCliQuotaSection } from './sections/gemini-cli';

/** Runtime adapter for each quota-supported provider. */
export const QUOTA_PROVIDER_RUNTIME: Record<QuotaSupportedProvider, QuotaProviderRuntime> = {
  agy: {
    fetch: (verbose) => fetchAllProviderQuotas('agy', verbose),
    hasData: (result) =>
      (result as Awaited<ReturnType<typeof fetchAllProviderQuotas>>).accounts.length > 0,
    render: (result) =>
      displayAntigravityQuotaSection(result as Awaited<ReturnType<typeof fetchAllProviderQuotas>>),
    emptyTitle: 'Antigravity (0 accounts)',
    emptyMessage: 'No Antigravity accounts configured',
    authCommand: 'ccs agy --auth',
  },
  codex: {
    fetch: (verbose) => fetchAllCodexQuotas(verbose),
    hasData: (result) => (result as { account: string; quota: CodexQuotaResult }[]).length > 0,
    render: (result) =>
      displayCodexQuotaSection(result as { account: string; quota: CodexQuotaResult }[]),
    emptyTitle: 'Codex (0 accounts)',
    emptyMessage: 'No Codex accounts configured',
    authCommand: 'ccs codex --auth',
  },
  claude: {
    fetch: (verbose) => fetchAllClaudeQuotas(verbose),
    hasData: (result) => (result as { account: string; quota: ClaudeQuotaResult }[]).length > 0,
    render: (result) =>
      displayClaudeQuotaSection(result as { account: string; quota: ClaudeQuotaResult }[]),
    emptyTitle: 'Claude (0 accounts)',
    emptyMessage: 'No Claude accounts configured',
    authCommand: 'ccs claude --auth',
  },
  gemini: {
    fetch: (verbose) => fetchAllGeminiCliQuotas(verbose),
    hasData: (result) => (result as { account: string; quota: GeminiCliQuotaResult }[]).length > 0,
    render: (result) =>
      displayGeminiCliQuotaSection(result as { account: string; quota: GeminiCliQuotaResult }[]),
    emptyTitle: 'Gemini CLI (0 accounts)',
    emptyMessage: 'No Gemini CLI accounts configured',
    authCommand: 'ccs gemini --auth',
  },
  ghcp: {
    fetch: (verbose) => fetchAllGhcpQuotas(verbose),
    hasData: (result) => (result as { account: string; quota: GhcpQuotaResult }[]).length > 0,
    render: (result) =>
      displayGhcpQuotaSection(result as { account: string; quota: GhcpQuotaResult }[]),
    emptyTitle: 'GitHub Copilot (0 accounts)',
    emptyMessage: 'No GitHub Copilot accounts configured',
    authCommand: 'ccs ghcp --auth',
  },
};
