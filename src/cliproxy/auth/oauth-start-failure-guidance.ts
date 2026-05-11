import type { CLIProxyProvider } from '../types';
import { getOAuthCallbackPort, getProviderDisplayName } from '../provider-capabilities';
import { buildProxyUrl, type ProxyTarget } from '../proxy/proxy-target-resolver';

export interface OAuthStartFailureGuidance {
  error: 'cliproxy_oauth_start_failed';
  provider: CLIProxyProvider;
  message: string;
  details: string;
  hints: string[];
  endpoint: string | null;
  retryCommand: string;
  portForwardCommand?: string;
}

interface GuidanceOptions {
  target: ProxyTarget;
  startPath?: string | null;
  cause?: unknown;
  addAccount?: boolean;
}

function getCauseMessage(cause: unknown): string | null {
  if (cause instanceof Error && cause.message.trim()) {
    return cause.message.trim();
  }
  if (typeof cause === 'string' && cause.trim()) {
    return cause.trim();
  }
  return null;
}

function buildAuthCommand(
  provider: CLIProxyProvider,
  flag: '--paste-callback' | '--port-forward',
  addAccount?: boolean
): string {
  const parts = ['ccs', provider, '--auth'];
  if (addAccount) {
    parts.push('--add');
  }
  parts.push(flag);
  return parts.join(' ');
}

export function buildOAuthStartFailureGuidance(
  provider: CLIProxyProvider,
  options: GuidanceOptions
): OAuthStartFailureGuidance {
  const { target, startPath, cause, addAccount } = options;
  const displayName = getProviderDisplayName(provider);
  const endpoint = startPath ? buildProxyUrl(target, startPath) : null;
  const causeMessage = getCauseMessage(cause);
  const retryCommand = buildAuthCommand(provider, '--paste-callback', addAccount);
  const portForwardRetryCommand = buildAuthCommand(provider, '--port-forward', addAccount);
  const callbackPort = getOAuthCallbackPort(provider);
  const portForwardCommand = callbackPort
    ? `ssh -L ${callbackPort}:localhost:${callbackPort} <USER>@<HOST>`
    : undefined;

  const targetDescription = target.isRemote
    ? `remote CLIProxy management API at ${target.protocol}://${target.host}:${target.port}`
    : `local CLIProxy management API at ${target.protocol}://${target.host}:${target.port}`;

  const message = `${displayName} OAuth could not start through the ${targetDescription}.`;
  const details = [
    endpoint ? `Endpoint: ${endpoint}` : null,
    causeMessage ? `Cause: ${causeMessage}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const hints = target.isRemote
    ? [
        'Verify the remote CLIProxy server is running and reachable from this machine.',
        'Check cliproxy_server.remote.management_key or auth_token in CCS config.',
        `After fixing the remote proxy, retry: ${retryCommand}`,
      ]
    : [
        'Start local CLIProxy first: ccs cliproxy start',
        `Then retry paste-callback mode: ${retryCommand}`,
        ...(portForwardCommand
          ? [
              `For SSH/VPS auth, open a tunnel from your local machine: ${portForwardCommand}`,
              `Then run inside that SSH session: ${portForwardRetryCommand}`,
            ]
          : []),
      ];

  return {
    error: 'cliproxy_oauth_start_failed',
    provider,
    message,
    details,
    hints,
    endpoint,
    retryCommand,
    portForwardCommand,
  };
}

export function formatOAuthStartFailureForCli(guidance: OAuthStartFailureGuidance): string[] {
  const lines = [guidance.message];
  if (guidance.details) {
    lines.push(guidance.details);
  }
  lines.push('Next steps:');
  lines.push(...guidance.hints.map((hint) => `  - ${hint}`));
  return lines;
}
