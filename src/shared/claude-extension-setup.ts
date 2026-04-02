import { loadSettingsFromFile, type ProfileType } from '../auth/profile-detector';
import ProfileDetector from '../auth/profile-detector';
import { resolveProfileContinuityInheritance } from '../auth/profile-continuity-inheritance';
import { resolveAccountContextPolicy, isAccountContextMetadata } from '../auth/account-context';
import type { ProfileDetectionResult } from '../auth/profile-detector';
import {
  getEffectiveEnvVars,
  getRemoteEnvVars,
  getCompositeEnvVars,
} from '../cliproxy/config/env-builder';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { getProxyTarget } from '../cliproxy/proxy-target-resolver';
import { generateCopilotEnv } from '../copilot/copilot-executor';
import { generateCursorEnv } from '../cursor';
import InstanceManager from '../management/instance-manager';
import SharedManager from '../management/shared-manager';
import { expandPath } from '../utils/helpers';
import { getClaudeSettingsPath } from '../utils/claude-config-path';
import { isDeprecatedGlmtProfileName, normalizeDeprecatedGlmtEnv } from '../utils/glmt-deprecation';
import {
  type ClaudeExtensionHost,
  type ClaudeExtensionHostDefinition,
  getClaudeExtensionHostDefinition,
} from './claude-extension-hosts';

export interface ClaudeExtensionProfileOption {
  name: string;
  profileType: ProfileType;
  label: string;
  description: string;
}

export interface ClaudeExtensionSetup {
  requestedProfile: string;
  resolvedProfileName: string;
  profileType: ProfileType;
  profileLabel: string;
  profileDescription: string;
  extensionEnv: Record<string, string>;
  removeEnvKeys: string[];
  warnings: string[];
  notes: string[];
  disableLoginPrompt: boolean;
}

export const CLAUDE_EXTENSION_MANAGED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_MAX_TOKENS',
  'ANTHROPIC_SAFE_MODE',
  'ANTHROPIC_TEMPERATURE',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'API_TIMEOUT_MS',
  'CLAUDE_CONFIG_DIR',
  'DISABLE_NON_ESSENTIAL_MODEL_CALLS',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'ENABLE_STREAMING',
  'MAX_THINKING_TOKENS',
] as const;

function sortUniqueEnvKeys(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort((left, right) => left.localeCompare(right));
}

function sortEnvRecord(env: NodeJS.ProcessEnv | Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }

  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right))
  );
}

function describeProfile(profileName: string, result: ProfileDetectionResult): string {
  if (profileName === 'default') {
    return result.name === 'default'
      ? 'Use Claude Code defaults with no CCS-specific transport override.'
      : `Use the current default profile resolution for "${result.name}".`;
  }
  if (result.type === 'cliproxy')
    return 'OAuth or CLIProxy-backed profile for Anthropic-compatible routing.';
  if (result.type === 'settings') {
    if (isDeprecatedGlmtProfileName(profileName)) {
      return 'Deprecated GLMT compatibility profile normalized to the direct GLM API.';
    }
    return 'API profile backed by a CCS settings file.';
  }
  if (result.type === 'account')
    return 'Claude account instance isolated through CLAUDE_CONFIG_DIR.';
  if (result.type === 'copilot') return 'GitHub Copilot profile routed through copilot-api.';
  if (result.type === 'cursor') return 'Cursor profile routed through the local cursor daemon.';
  return 'Native Claude profile resolution.';
}

function createProfileOption(
  profileName: string,
  result: ProfileDetectionResult
): ClaudeExtensionProfileOption {
  return {
    name: profileName,
    profileType: result.type,
    label: profileName === 'default' ? 'default' : result.name,
    description: describeProfile(profileName, result),
  };
}

export function listClaudeExtensionProfiles(): ClaudeExtensionProfileOption[] {
  const detector = new ProfileDetector();
  const all = detector.getAllProfiles();
  const orderedNames = [
    'default',
    ...all.accounts,
    ...all.settings,
    ...all.cliproxy,
    ...all.cliproxyVariants,
  ];
  const deduped = [...new Set(orderedNames)];
  try {
    detector.detectProfileType('copilot');
    deduped.push('copilot');
  } catch {
    // Copilot disabled; skip from setup UI.
  }
  try {
    detector.detectProfileType('cursor');
    deduped.push('cursor');
  } catch {
    // Cursor disabled; skip from setup UI.
  }

  return deduped
    .map((profileName) => createProfileOption(profileName, detector.detectProfileType(profileName)))
    .sort((left, right) => deduped.indexOf(left.name) - deduped.indexOf(right.name));
}

async function resolveExtensionEnv(
  requestedProfile: string,
  result: ProfileDetectionResult
): Promise<
  Pick<ClaudeExtensionSetup, 'extensionEnv' | 'warnings' | 'notes' | 'disableLoginPrompt'>
> {
  const warnings: string[] = [];
  const notes: string[] = [];
  const requestedIsDefault = requestedProfile === 'default';

  if (result.type === 'account') {
    const instanceManager = new InstanceManager();
    const policy = resolveAccountContextPolicy(
      isAccountContextMetadata(result.profile) ? result.profile : undefined
    );
    const instancePath = await instanceManager.ensureInstance(result.name, policy, {
      bare: result.profile?.bare === true,
    });
    notes.push('Account profiles authenticate through the isolated Claude config directory.');
    return {
      extensionEnv: { CLAUDE_CONFIG_DIR: instancePath },
      warnings,
      notes,
      disableLoginPrompt: false,
    };
  }

  if (result.type === 'default') {
    const continuity = await resolveProfileContinuityInheritance({
      profileName: requestedProfile,
      profileType: result.type,
      target: 'claude',
    });
    new SharedManager().normalizeSharedPluginMetadataPathsLocked(continuity.claudeConfigDir);
    if (continuity.claudeConfigDir) {
      notes.push(`Default profile inherits continuity from account "${continuity.sourceAccount}".`);
      return {
        extensionEnv: { CLAUDE_CONFIG_DIR: continuity.claudeConfigDir },
        warnings,
        notes,
        disableLoginPrompt: false,
      };
    }

    notes.push(
      'Default profile clears CCS-managed transport overrides and uses native Claude defaults.'
    );
    return { extensionEnv: {}, warnings, notes, disableLoginPrompt: false };
  }

  const continuity = await resolveProfileContinuityInheritance({
    profileName: requestedProfile,
    profileType: result.type,
    target: 'claude',
  });
  let env =
    result.type === 'settings'
      ? (result.env ??
        (result.settingsPath ? loadSettingsFromFile(expandPath(result.settingsPath)) : {}))
      : result.type === 'copilot'
        ? (() => {
            if (!result.copilotConfig) {
              throw new Error(`Profile "${requestedProfile}" is missing copilot configuration.`);
            }
            return generateCopilotEnv(result.copilotConfig, continuity.claudeConfigDir);
          })()
        : result.type === 'cursor'
          ? (() => {
              if (!result.cursorConfig) {
                throw new Error(`Profile "${requestedProfile}" is missing cursor configuration.`);
              }
              return generateCursorEnv(result.cursorConfig, continuity.claudeConfigDir);
            })()
          : (() => {
              if (!result.provider) {
                throw new Error(
                  `Profile "${requestedProfile}" is missing CLIProxy provider metadata.`
                );
              }
              const proxyTarget = getProxyTarget();
              const port = result.port || CLIPROXY_DEFAULT_PORT;
              if (proxyTarget.isRemote) {
                warnings.push(
                  `CLIProxy is configured for remote routing via ${proxyTarget.protocol}://${proxyTarget.host}:${proxyTarget.port}.`
                );
                return result.isComposite && result.compositeTiers && result.compositeDefaultTier
                  ? getCompositeEnvVars(
                      result.compositeTiers,
                      result.compositeDefaultTier,
                      port,
                      result.settingsPath,
                      proxyTarget
                    )
                  : getRemoteEnvVars(result.provider, proxyTarget, result.settingsPath);
              }
              warnings.push(
                'CLIProxy-backed profiles require the local or remote proxy endpoint to be reachable.'
              );
              return result.isComposite && result.compositeTiers && result.compositeDefaultTier
                ? getCompositeEnvVars(
                    result.compositeTiers,
                    result.compositeDefaultTier,
                    port,
                    result.settingsPath
                  )
                : getEffectiveEnvVars(result.provider, port, result.settingsPath);
            })();

  if (result.type === 'settings' && isDeprecatedGlmtProfileName(requestedProfile)) {
    const normalized = normalizeDeprecatedGlmtEnv(sortEnvRecord(env));
    env = normalized.env;
    warnings.push(...normalized.warnings);
    notes.push('Create or migrate to a glm profile when convenient to remove legacy GLMT config.');
  }

  if (!requestedIsDefault && continuity.claudeConfigDir && !env.CLAUDE_CONFIG_DIR) {
    env.CLAUDE_CONFIG_DIR = continuity.claudeConfigDir;
    notes.push(
      `Continuity inheritance adds CLAUDE_CONFIG_DIR from account "${continuity.sourceAccount}".`
    );
  }

  new SharedManager().normalizeSharedPluginMetadataPathsLocked(env.CLAUDE_CONFIG_DIR);

  if (result.type === 'copilot') {
    warnings.push(
      'copilot-api must stay reachable for this profile to work inside the IDE extension.'
    );
  }
  if (result.type === 'cursor') {
    warnings.push(
      'The local Cursor daemon must stay reachable for this profile to work inside the IDE extension.'
    );
  }
  if (Object.keys(env).length === 0) {
    throw new Error(`Profile "${requestedProfile}" has no extension environment to export.`);
  }

  return { extensionEnv: sortEnvRecord(env), warnings, notes, disableLoginPrompt: true };
}

export async function resolveClaudeExtensionSetup(
  requestedProfile: string
): Promise<ClaudeExtensionSetup> {
  const detector = new ProfileDetector();
  const result = detector.detectProfileType(requestedProfile);
  const resolved = await resolveExtensionEnv(requestedProfile, result);

  return {
    requestedProfile,
    resolvedProfileName: result.name,
    profileType: result.type,
    profileLabel: requestedProfile === 'default' ? 'default' : result.name,
    profileDescription: describeProfile(requestedProfile, result),
    extensionEnv: resolved.extensionEnv,
    removeEnvKeys: sortUniqueEnvKeys([
      ...CLAUDE_EXTENSION_MANAGED_ENV_KEYS,
      ...Object.keys(resolved.extensionEnv),
    ]),
    warnings: resolved.warnings,
    notes: resolved.notes,
    disableLoginPrompt: resolved.disableLoginPrompt,
  };
}

export function buildClaudeExtensionSettingsObject(
  setup: ClaudeExtensionSetup,
  host: ClaudeExtensionHost
): Record<string, unknown> {
  const definition = getClaudeExtensionHostDefinition(host);
  const payload: Record<string, unknown> = {
    [definition.settingsKey]: Object.entries(setup.extensionEnv).map(([name, value]) => ({
      name,
      value,
    })),
  };
  if (definition.disableLoginPromptKey && setup.disableLoginPrompt) {
    payload[definition.disableLoginPromptKey] = true;
  }
  return payload;
}

export function buildSharedClaudeSettingsObject(
  setup: ClaudeExtensionSetup
): Record<string, Record<string, string>> {
  return { env: setup.extensionEnv };
}

export function renderClaudeExtensionSettingsJson(
  setup: ClaudeExtensionSetup,
  host: ClaudeExtensionHost
): string {
  return JSON.stringify(buildClaudeExtensionSettingsObject(setup, host), null, 2);
}

export function renderSharedClaudeSettingsJson(setup: ClaudeExtensionSetup): string {
  return JSON.stringify(buildSharedClaudeSettingsObject(setup), null, 2);
}

export function getClaudeExtensionHostMetadata(
  host: ClaudeExtensionHost
): ClaudeExtensionHostDefinition {
  return getClaudeExtensionHostDefinition(host);
}

export function getClaudeSharedSettingsPath(): string {
  return getClaudeSettingsPath();
}
