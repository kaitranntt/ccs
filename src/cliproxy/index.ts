/**
 * CLIProxy Module Exports
 * Central export point for CLIProxyAPI binary management and execution
 */

// Types
export type {
  PlatformInfo,
  SupportedOS,
  SupportedArch,
  ArchiveExtension,
  BinaryManagerConfig,
  BinaryInfo,
  DownloadProgress,
  ProgressCallback,
  ChecksumResult,
  DownloadResult,
  CLIProxyProvider,
  CLIProxyConfig,
  ExecutorConfig,
  ProviderConfig,
  ProviderModelMapping,
} from './types';

// Platform detection
export {
  detectPlatform,
  getDownloadUrl,
  getChecksumsUrl,
  getExecutableName,
  getArchiveBinaryName,
  isPlatformSupported,
  getPlatformDescription,
  CLIPROXY_VERSION,
} from './platform-detector';

// Binary management
export {
  BinaryManager,
  ensureCLIProxyBinary,
  isCLIProxyInstalled,
  getCLIProxyPath,
  getInstalledCliproxyVersion,
  installCliproxyVersion,
  fetchLatestCliproxyVersion,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  getVersionPinPath,
} from './binary-manager';

// Config generation
export {
  generateConfig,
  regenerateConfig,
  configNeedsRegeneration,
  parseUserApiKeys,
  getClaudeEnvVars,
  getEffectiveEnvVars,
  getProviderSettingsPath,
  ensureProviderSettings,
  getProviderConfig,
  getModelMapping,
  getCliproxyDir,
  getProviderAuthDir,
  getAuthDir,
  getCliproxyConfigPath,
  getBinDir,
  configExists,
  deleteConfig,
  CLIPROXY_DEFAULT_PORT,
  CLIPROXY_CONFIG_VERSION,
} from './config-generator';

// Base config loader (for reading config/base-*.settings.json)
export {
  loadBaseConfig,
  getModelMappingFromConfig,
  getEnvVarsFromConfig,
  clearConfigCache,
} from './base-config-loader';

// Model catalog and configuration
export type { ModelEntry, ProviderCatalog } from './model-catalog';
export { MODEL_CATALOG, supportsModelConfig, getProviderCatalog, findModel } from './model-catalog';
export {
  hasUserSettings,
  getCurrentModel,
  configureProviderModel,
  showCurrentConfig,
} from './model-config';

// Executor
export { execClaudeWithCLIProxy, isPortAvailable, findAvailablePort } from './cliproxy-executor';

// Authentication
export type { AuthStatus } from './auth-handler';
export {
  isAuthenticated,
  getAuthStatus,
  getAllAuthStatus,
  clearAuth,
  triggerOAuth,
  ensureAuth,
  getOAuthConfig,
  getProviderTokenDir,
  displayAuthStatus,
} from './auth-handler';

// Stats fetcher
export type { CliproxyStats } from './stats-fetcher';
export { fetchCliproxyStats, isCliproxyRunning } from './stats-fetcher';

// Quota fetcher
export type { ModelQuota, QuotaResult } from './quota-fetcher';
export { fetchAccountQuota } from './quota-fetcher';

// OpenAI compatibility layer
export type { OpenAICompatProvider, OpenAICompatModel } from './openai-compat-manager';
export {
  listOpenAICompatProviders,
  getOpenAICompatProvider,
  addOpenAICompatProvider,
  updateOpenAICompatProvider,
  removeOpenAICompatProvider,
  OPENROUTER_TEMPLATE,
  TOGETHER_TEMPLATE,
} from './openai-compat-manager';

// Service manager (background CLIProxy for dashboard)
export type { ServiceStartResult } from './service-manager';
export { ensureCliproxyService, stopCliproxyService, getServiceStatus } from './service-manager';

// Proxy detector (unified detection with multiple fallbacks)
export type { ProxyStatus, DetectionMethod } from './proxy-detector';
export { detectRunningProxy, waitForProxyHealthy, reclaimOrphanedProxy } from './proxy-detector';

// Startup lock (prevents race conditions between CCS processes)
export type { LockResult } from './startup-lock';
export { acquireStartupLock, withStartupLock } from './startup-lock';

// Auth token manager (customizable API key and management secret)
export {
  generateSecureToken,
  maskToken,
  getEffectiveApiKey,
  getEffectiveManagementSecret,
  setGlobalApiKey,
  setGlobalManagementSecret,
  setVariantApiKey,
  resetAuthToDefaults,
  getAuthSummary,
} from './auth-token-manager';

// Thinking validator
export type { ThinkingValidationResult } from './thinking-validator';
export {
  validateThinking,
  THINKING_LEVEL_BUDGETS,
  VALID_THINKING_LEVELS,
  VALID_THINKING_TIERS,
  THINKING_OFF_VALUES,
  THINKING_AUTO_VALUE,
  THINKING_BUDGET_MIN,
  THINKING_BUDGET_MAX,
  THINKING_BUDGET_DEFAULT_MIN,
} from './thinking-validator';

// Management API client (for remote CLIProxy sync)
export type {
  ClaudeKey,
  ClaudeModel,
  ManagementClientConfig,
  ManagementHealthStatus,
  ManagementApiErrorCode,
  ClaudeKeyPatch,
  SyncStatus,
} from './management-api-types';
export { ManagementApiClient, createManagementClient } from './management-api-client';

// Sync module (profile sync to remote CLIProxy)
export type { SyncableProfile, SyncPreviewItem } from './sync';
export {
  loadSyncableProfiles,
  mapProfileToClaudeKey,
  generateSyncPayload,
  generateSyncPreview,
  getSyncableProfileCount,
  isProfileSyncable,
} from './sync';

// Tool name sanitization (for Gemini 64-char limit compliance)
export type { SanitizeResult } from './tool-name-sanitizer';
export {
  sanitizeToolName,
  isValidToolName,
  removeDuplicateSegments,
  smartTruncate,
  GEMINI_MAX_TOOL_NAME_LENGTH,
} from './tool-name-sanitizer';

export type { Tool, ToolUseBlock, ContentBlock, SanitizationChange } from './tool-name-mapper';
export { ToolNameMapper } from './tool-name-mapper';

export type { ToolSanitizationProxyConfig } from './tool-sanitization-proxy';
export { ToolSanitizationProxy } from './tool-sanitization-proxy';

// Schema sanitization (for MCP input_schema non-standard property removal)
export type { SchemaSanitizationResult } from './schema-sanitizer';
export { sanitizeInputSchema, sanitizeToolSchemas } from './schema-sanitizer';
