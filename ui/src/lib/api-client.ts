/**
 * API Client
 * Phase 03: REST API Routes & CRUD
 */

import type { ProviderEntitlementEvidence } from '../../../src/cliproxy/auth/provider-entitlement-types';
import type { ClaudePoolPolicyStatus } from '@shared/claude-pool-policy';
import { profilesApi, presetsApi } from './api/profiles';
import {
  accountsApi,
  browserApi,
  configApi,
  imageAnalysisApi,
  logsApi,
} from './api/settings-domains';
import { cliproxyApi, cliproxyServerApi } from './api/cliproxy';
import { quotaApi } from './api/quota';

export type { ProviderEntitlementEvidence, ClaudePoolPolicyStatus };

export {
  API_BASE_URL,
  API_CONFLICT_ERROR_CODE,
  ApiConflictError,
  isApiConflictError,
  withApiBase,
  type CliTarget,
  type CliproxyBridgeMetadata,
} from './api/core';

export {
  type ApiProfileExportBundle,
  type ApiProfileOrphanCandidate,
  type CopyProfileRequest,
  type CopyProfileResponse,
  type CreatePreset,
  type CreateProfile,
  type DiscoverProfileOrphansResponse,
  type ExportProfileResponse,
  type ImportProfileRequest,
  type ImportProfileResponse,
  type LocalRuntimeReadiness,
  type LocalRuntimeReadinessResponse,
  type LocalRuntimeStatus,
  type ModelPreset,
  type Profile,
  type ProfileValidationIssue,
  type ProfileValidationSummary,
  type RegisterProfileOrphansRequest,
  type RegisterProfileOrphansResponse,
  type UpdateProfile,
} from './api/profiles';

export {
  type Account,
  type BrowserDashboardPayload,
  type BrowserEvalMode,
  type BrowserLaunchCommands,
  type BrowserSettingsConfig,
  type BrowserStatusPayload,
  type BrowserToolPolicy,
  type ClaudeBrowserStatus,
  type CodexBrowserStatus,
  type ConfigFormat,
  type ImageAnalysisDashboardBackend,
  type ImageAnalysisDashboardCatalog,
  type ImageAnalysisDashboardData,
  type ImageAnalysisDashboardProfile,
  type ImageAnalysisDashboardSummary,
  type ImageAnalysisSettingsConfig,
  type ImageAnalysisStatus,
  type LogsConfig,
  type LogsEntriesParams,
  type LogsEntry,
  type LogsLevel,
  type LogsSource,
  type MigrationResult,
  type PlainCcsLane,
  type UpdateAccountContext,
  type UpdateAccountSharedResources,
  type UpdateBrowserSettingsPayload,
  type UpdateImageAnalysisSettingsPayload,
  type UpdateLogsConfigPayload,
} from './api/settings-domains';

export {
  type AuthFile,
  type AuthStatus,
  type CliproxyBackendConfig,
  type CliproxyCatalogModel,
  type CliproxyCatalogPresetMapping,
  type CliproxyCatalogResponse,
  type CliproxyErrorLog,
  type CliproxyInstallResult,
  type CliproxyModel,
  type CliproxyModelRoutingHint,
  type CliproxyModelsResponse,
  type CliproxyPoolRoutingState,
  type CliproxyProviderCatalog,
  type CliproxyProviderRoutingHints,
  type CliproxyRestartResult,
  type CliproxyRetryApplyResult,
  type CliproxyRetryState,
  type CliproxyRetryValues,
  type CliproxyRoutingApplyResult,
  type CliproxyRoutingState,
  type CliproxyServerConfig,
  type CliproxySessionAffinityApplyResult,
  type CliproxySessionAffinityState,
  type CliproxyUpdateCheckResult,
  type CliproxyVersionsResponse,
  type CreateVariant,
  type OAuthAccount,
  type ProviderAccountsMap,
  type ProxyFallbackConfig,
  type ProxyLocalConfig,
  type ProxyProcessStatus,
  type ProxyRemoteConfig,
  type ProxyStartResult,
  type ProxyStopResult,
  type RemoteProxyStatus,
  type RoutingStrategy,
  type UpdateVariant,
  type Variant,
} from './api/cliproxy';

export {
  type ClaudeCoreUsageSummary,
  type ClaudeCoreUsageWindow,
  type ClaudeQuotaResult,
  type ClaudeQuotaWindow,
  type CodexCoreUsageSummary,
  type CodexCoreUsageWindow,
  type CodexQuotaResult,
  type CodexQuotaWindow,
  type GeminiCliBucket,
  type GeminiCliQuotaResult,
  type GhcpQuotaResult,
  type GhcpQuotaSnapshot,
  type ModelQuota,
  type QuotaResult,
} from './api/quota';

export const api = {
  profiles: profilesApi,
  imageAnalysis: imageAnalysisApi,
  browser: browserApi,
  logs: logsApi,
  cliproxy: cliproxyApi,
  accounts: accountsApi,
  config: configApi,
  presets: presetsApi,
  cliproxyServer: cliproxyServerApi,
  quota: quotaApi,
};
