import * as fs from 'fs';
import * as path from 'path';
import type { BrowserConfig, BrowserEvalMode } from '../../config/unified-config-types';
import { getCcsDir, getCcsPathDisplay } from '../config-manager';
import { expandPath } from '../helpers';
import { type BrowserRuntimeEnv, resolveBrowserRuntimeEnv } from './chrome-reuse';
import { getNodePlatformKey } from './platform';

export type BrowserOverrideSource = 'CCS_BROWSER_USER_DATA_DIR' | 'CCS_BROWSER_PROFILE_DIR';

export interface EffectiveClaudeBrowserAttachConfig {
  enabled: boolean;
  source: 'config' | BrowserOverrideSource;
  overrideActive: boolean;
  userDataDir: string;
  devtoolsPort: number;
  hasExplicitDevtoolsPort: boolean;
  evalMode: BrowserEvalMode;
}

export interface BrowserLaunchCommands {
  darwin: string;
  linux: string;
  win32: string;
}

export interface BrowserAttachRuntimeResolution {
  runtimeEnv?: BrowserRuntimeEnv;
  warning?: string;
}

export interface ManagedBrowserAttachBootstrap {
  usesManagedDefaultDir: boolean;
  createdProfileDir: boolean;
}

export interface ManagedBrowserAttachNotReadyMessage {
  state: 'path_missing' | 'browser_not_running' | 'endpoint_unreachable';
  title: string;
  detail: string;
  nextStep: string;
  warning: string;
}

export function getRecommendedBrowserUserDataDir(): string {
  return path.join(getCcsDir(), 'browser', 'chrome-user-data');
}

export function resolveBrowserUserDataDir(value?: string): string | undefined {
  return value?.trim() ? expandPath(value) : undefined;
}

export function buildBrowserLaunchCommands(
  userDataDir: string,
  devtoolsPort: number
): BrowserLaunchCommands {
  const quotedPath = JSON.stringify(userDataDir);
  return {
    darwin: `open -na "Google Chrome" --args --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`,
    linux: `google-chrome --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`,
    win32: `chrome.exe --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`,
  };
}

export function isManagedClaudeBrowserAttachConfig(
  config: EffectiveClaudeBrowserAttachConfig
): boolean {
  return (
    config.source === 'config' &&
    path.resolve(config.userDataDir) === path.resolve(getRecommendedBrowserUserDataDir())
  );
}

function buildCurrentPlatformLaunchCommand(userDataDir: string, devtoolsPort: number): string {
  return buildBrowserLaunchCommands(userDataDir, devtoolsPort)[getNodePlatformKey()];
}

function buildManagedBrowserActionLines(): string[] {
  return [
    'Run `ccs browser setup` to configure and start the managed browser session.',
    'Diagnose only: `ccs browser doctor`.',
  ];
}

export function buildManagedBrowserAttachSetupOptions(
  _config: EffectiveClaudeBrowserAttachConfig
): string[] {
  return buildManagedBrowserActionLines();
}

function buildManagedBrowserAttachWarning(_config: EffectiveClaudeBrowserAttachConfig): string {
  return [
    'Claude Browser Attach is not ready yet.',
    `  Managed user-data dir: ${getCcsPathDisplay('browser', 'chrome-user-data')}`,
    '  CCS will continue without browser tools for this launch.',
    '',
    ...buildManagedBrowserActionLines().map((line) => `  ${line}`),
  ].join('\n');
}

export function ensureManagedBrowserUserDataDir(
  config: EffectiveClaudeBrowserAttachConfig
): ManagedBrowserAttachBootstrap {
  if (!isManagedClaudeBrowserAttachConfig(config)) {
    return {
      usesManagedDefaultDir: false,
      createdProfileDir: false,
    };
  }

  try {
    fs.statSync(config.userDataDir);
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: false,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') {
      return {
        usesManagedDefaultDir: true,
        createdProfileDir: false,
      };
    }
  }

  try {
    fs.mkdirSync(config.userDataDir, { recursive: true, mode: 0o700 });
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: true,
    };
  } catch {
    return {
      usesManagedDefaultDir: true,
      createdProfileDir: false,
    };
  }
}

export function describeManagedBrowserAttachNotReady(
  config: EffectiveClaudeBrowserAttachConfig,
  errorMessage: string,
  options: {
    createdProfileDir?: boolean;
    launchCommand?: string;
  } = {}
): ManagedBrowserAttachNotReadyMessage | undefined {
  if (!isManagedClaudeBrowserAttachConfig(config)) {
    return undefined;
  }

  const launchCommand =
    options.launchCommand ??
    buildCurrentPlatformLaunchCommand(
      getCcsPathDisplay('browser', 'chrome-user-data'),
      config.devtoolsPort
    );
  const nextStep = [
    ...buildManagedBrowserActionLines(),
    `Manual launch (${getNodePlatformKey()}): ${launchCommand}`,
  ].join('\n');

  if (errorMessage.includes('Chrome reuse metadata')) {
    const summary = options.createdProfileDir
      ? 'CCS created the managed browser profile directory, but the attach session is not running yet.'
      : 'No running attach-mode Chrome session is using the managed browser profile yet.';
    return {
      state: 'browser_not_running',
      title: 'Claude Browser Attach is not ready yet.',
      detail: `${summary} Diagnostic: ${errorMessage}`,
      nextStep,
      warning: buildManagedBrowserAttachWarning(config),
    };
  }

  if (errorMessage.includes('Chrome DevTools endpoint')) {
    return {
      state: 'endpoint_unreachable',
      title: 'Claude Browser Attach could not reach the managed Chrome session.',
      detail: `CCS found the managed browser profile, but the DevTools endpoint did not answer successfully. Diagnostic: ${errorMessage}`,
      nextStep,
      warning: buildManagedBrowserAttachWarning(config),
    };
  }

  if (errorMessage.includes('Chrome profile directory is invalid')) {
    return {
      state: 'path_missing',
      title: 'Claude Browser Attach could not initialize the managed profile.',
      detail: `CCS could not initialize the managed browser profile directory. Diagnostic: ${errorMessage}`,
      nextStep,
      warning: buildManagedBrowserAttachWarning(config),
    };
  }

  return undefined;
}

export function getBrowserAttachOverride(env: NodeJS.ProcessEnv = process.env): {
  userDataDir?: string;
  devtoolsPort?: number;
  source?: BrowserOverrideSource;
} {
  const explicitUserDataDir = resolveBrowserUserDataDir(env.CCS_BROWSER_USER_DATA_DIR);
  if (explicitUserDataDir) {
    return {
      userDataDir: explicitUserDataDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_USER_DATA_DIR',
    };
  }

  const legacyProfileDir = resolveBrowserUserDataDir(env.CCS_BROWSER_PROFILE_DIR);
  if (legacyProfileDir) {
    return {
      userDataDir: legacyProfileDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_PROFILE_DIR',
    };
  }

  return {};
}

export function getEffectiveClaudeBrowserAttachConfig(
  config: BrowserConfig,
  env: NodeJS.ProcessEnv = process.env
): EffectiveClaudeBrowserAttachConfig {
  const override = getBrowserAttachOverride(env);
  const configUserDataDir =
    resolveBrowserUserDataDir(config.claude.user_data_dir) ?? getRecommendedBrowserUserDataDir();
  const configHasExplicitPort = config.claude.devtools_port !== undefined;
  const configPort = normalizeDevtoolsPort(config.claude.devtools_port);
  const configEvalMode = config.claude.eval_mode ?? 'readonly';
  const envEvalMode = parseBrowserEvalMode(env.CCS_BROWSER_EVAL_MODE);
  const effectiveEvalMode = envEvalMode ?? configEvalMode;

  if (override.userDataDir) {
    return {
      enabled: config.claude.enabled,
      source: override.source as BrowserOverrideSource,
      overrideActive: true,
      userDataDir: override.userDataDir,
      devtoolsPort: override.devtoolsPort ?? configPort,
      hasExplicitDevtoolsPort: override.devtoolsPort !== undefined,
      evalMode: effectiveEvalMode,
    };
  }

  return {
    enabled: config.claude.enabled,
    source: 'config',
    overrideActive: false,
    userDataDir: configUserDataDir,
    devtoolsPort: configPort,
    hasExplicitDevtoolsPort: configHasExplicitPort,
    evalMode: effectiveEvalMode,
  };
}

export async function resolveOptionalBrowserAttachRuntime(
  config: EffectiveClaudeBrowserAttachConfig
): Promise<BrowserAttachRuntimeResolution> {
  if (!config.enabled) {
    return {};
  }

  const bootstrap = ensureManagedBrowserUserDataDir(config);
  if (bootstrap.createdProfileDir) {
    return {
      warning: buildManagedBrowserAttachWarning(config),
    };
  }

  try {
    const runtimeEnv = await resolveBrowserRuntimeEnv({
      profileDir: config.userDataDir,
      devtoolsPort: config.hasExplicitDevtoolsPort ? String(config.devtoolsPort) : undefined,
    });
    return {
      runtimeEnv: {
        ...runtimeEnv,
        CCS_BROWSER_EVAL_MODE: config.evalMode,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const managedDefaultMessage = describeManagedBrowserAttachNotReady(config, message, {
      createdProfileDir: bootstrap.createdProfileDir,
    });
    if (managedDefaultMessage) {
      return {
        warning: managedDefaultMessage.warning,
      };
    }

    throw error;
  }
}

function parseDevtoolsPort(value?: string): number | undefined {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return normalizeDevtoolsPort(Number.parseInt(value.trim(), 10));
}

function parseBrowserEvalMode(value?: string): BrowserEvalMode | undefined {
  const trimmed = value?.trim();
  if (trimmed === 'disabled' || trimmed === 'readonly' || trimmed === 'readwrite') {
    return trimmed;
  }

  return undefined;
}

function normalizeDevtoolsPort(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 9222;
  }

  const port = Math.floor(value as number);
  if (port < 1 || port > 65535) {
    return 9222;
  }

  return port;
}
