/**
 * CLIProxy Type Definitions
 * Types for CLIProxyAPI binary management and execution
 */

/**
 * Supported operating systems
 */
export type SupportedOS = 'darwin' | 'linux' | 'windows';

/**
 * Supported CPU architectures
 */
export type SupportedArch = 'amd64' | 'arm64';

/**
 * Archive extension based on platform
 */
export type ArchiveExtension = 'tar.gz' | 'zip';

/**
 * Platform detection result
 */
export interface PlatformInfo {
  /** Operating system (darwin, linux, windows) */
  os: SupportedOS;
  /** CPU architecture (amd64, arm64) */
  arch: SupportedArch;
  /** Full binary archive name (e.g., CLIProxyAPI_6.5.27_linux_amd64.tar.gz) */
  binaryName: string;
  /** Archive extension (tar.gz for Unix, zip for Windows) */
  extension: ArchiveExtension;
}

/**
 * Binary manager configuration
 */
export interface BinaryManagerConfig {
  /** CLIProxyAPI version to download */
  version: string;
  /** GitHub releases base URL */
  releaseUrl: string;
  /** Local binary storage path (~/.ccs/bin/) */
  binPath: string;
  /** Maximum download retry attempts */
  maxRetries: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Download progress callback
 */
export interface DownloadProgress {
  /** Total bytes to download */
  total: number;
  /** Bytes downloaded so far */
  downloaded: number;
  /** Download percentage (0-100) */
  percentage: number;
}

/**
 * Download progress callback function type
 */
export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Binary info after successful download/verification
 */
export interface BinaryInfo {
  /** Full path to executable */
  path: string;
  /** CLIProxyAPI version */
  version: string;
  /** Platform info */
  platform: PlatformInfo;
  /** SHA256 checksum (verified) */
  checksum: string;
}

/**
 * Checksum verification result
 */
export interface ChecksumResult {
  /** Whether checksum matched */
  valid: boolean;
  /** Expected checksum from checksums.txt */
  expected: string;
  /** Actual computed checksum */
  actual: string;
}

/**
 * Download result
 */
export interface DownloadResult {
  /** Whether download succeeded */
  success: boolean;
  /** Path to downloaded file */
  filePath?: string;
  /** Error message if failed */
  error?: string;
  /** Number of retries attempted */
  retries: number;
}

/**
 * Supported CLIProxy providers
 * - gemini: Google Gemini via OAuth
 * - codex: OpenAI Codex via OAuth
 * - agy: Antigravity via OAuth (short name for easy usage)
 * - qwen: Qwen Code via OAuth (qwen3-coder)
 * - iflow: iFlow via OAuth
 */
export type CLIProxyProvider = 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow';

/**
 * CLIProxy config.yaml structure (minimal)
 */
export interface CLIProxyConfig {
  port: number;
  'api-keys': string[];
  'auth-dir': string;
  debug: boolean;
  'gemini-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
  }>;
  'codex-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
  }>;
  'openai-compatibility'?: Array<{
    name: string;
    'base-url': string;
    'api-key-entries': Array<{
      'api-key': string;
    }>;
  }>;
}

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Port for CLIProxyAPI (default: 8317) */
  port: number;
  /** Timeout for proxy readiness in ms (default: 5000) */
  timeout: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Poll interval for port check in ms (default: 100) */
  pollInterval: number;
  /** Custom settings path for user-defined CLIProxy variants */
  customSettingsPath?: string;
}

/**
 * Model mapping for each provider
 */
export interface ProviderModelMapping {
  /** Default model for requests */
  defaultModel: string;
  /** Model for Claude CLI's ANTHROPIC_MODEL */
  claudeModel: string;
  /** Model for Claude CLI's ANTHROPIC_DEFAULT_OPUS_MODEL */
  opusModel?: string;
  /** Model for Claude CLI's ANTHROPIC_DEFAULT_SONNET_MODEL */
  sonnetModel?: string;
  /** Model for Claude CLI's ANTHROPIC_DEFAULT_HAIKU_MODEL */
  haikuModel?: string;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider name */
  name: CLIProxyProvider;
  /** Display name for UI */
  displayName: string;
  /** Model configuration */
  models: ProviderModelMapping;
  /** Whether OAuth is required */
  requiresOAuth: boolean;
}
