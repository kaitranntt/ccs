/**
 * OAuth Process Output Parser & Callback Validator
 *
 * Pure parsing and validation helpers for device codes, OAuth authorization URLs,
 * loopback callback URLs, Kiro Builder ID selection, and auth failure log lines.
 */

import { CLIProxyProvider } from '../../types';
import { getOAuthFlowType } from '../../provider-capabilities';
import { type ProviderTokenSnapshot, findNewTokenSnapshot } from '../token-manager';
import type { OAuthProcessOptions } from './types';

const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

export function resolveAuthFlowType(
  options: Pick<OAuthProcessOptions, 'authFlowType' | 'provider'>
): 'device_code' | 'authorization_code' {
  return options.authFlowType || getOAuthFlowType(options.provider) || 'authorization_code';
}

export function extractDeviceCodePrompt(output: string): {
  userCode: string;
  verificationUrl: string | null;
} | null {
  const codeMatch = output.match(
    /(?:enter\s+)?(?:this\s+)?(?:user\s+)?code[:\s]+["']?([A-Z0-9]{4,8}[-\s]?[A-Z0-9]{4,8})["']?/i
  );
  if (!codeMatch) return null;

  const urlMatch = output.match(/(https?:\/\/[^\s]+device[^\s]*)/i);
  return {
    userCode: codeMatch[1].toUpperCase(),
    verificationUrl: urlMatch?.[1] ?? null,
  };
}

export function resolveDeviceCodeVerificationUrl(
  provider: CLIProxyProvider,
  userCode: string,
  parsedUrl: string | null
): string {
  if (parsedUrl) {
    return parsedUrl;
  }
  if (provider === 'xai') {
    return `https://accounts.x.ai/oauth2/device?user_code=${encodeURIComponent(userCode)}`;
  }
  return 'https://github.com/login/device';
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1'
  );
}

export function getExpectedLocalCallback(authUrl: string): {
  origin: string;
  pathname: string;
  state: string | null;
} | null {
  try {
    const parsedAuthUrl = new URL(authUrl);
    const redirectUriRaw = parsedAuthUrl.searchParams.get('redirect_uri');
    if (!redirectUriRaw) {
      return null;
    }

    const redirectUri = new URL(redirectUriRaw);
    if (!isLoopbackHost(redirectUri.hostname)) {
      return null;
    }

    return {
      origin: redirectUri.origin,
      pathname: redirectUri.pathname,
      state: parsedAuthUrl.searchParams.get('state'),
    };
  } catch {
    return null;
  }
}

export function validateManualCallbackUrl(callbackUrl: string, authUrl: string): string | null {
  let parsedCallback: URL;
  try {
    parsedCallback = new URL(callbackUrl);
  } catch {
    return 'Invalid callback URL format';
  }

  if (!parsedCallback.searchParams.get('code')) {
    return 'Invalid callback URL: missing code parameter';
  }

  const expectedCallback = getExpectedLocalCallback(authUrl);
  if (!expectedCallback) {
    return 'Unable to determine the expected local callback target';
  }

  if (!isLoopbackHost(parsedCallback.hostname)) {
    return 'Callback URL must target the local OAuth callback server';
  }

  if (
    parsedCallback.origin !== expectedCallback.origin ||
    parsedCallback.pathname !== expectedCallback.pathname
  ) {
    return 'Callback URL does not match the expected local OAuth callback target';
  }

  if (expectedCallback.state) {
    const callbackState = parsedCallback.searchParams.get('state');
    if (callbackState !== expectedCallback.state) {
      return 'Callback URL state does not match the active OAuth session';
    }
  }

  return null;
}

export function getKiroBuilderIdSelectionInput(output: string): string | null {
  const promptMatch = /Select login method/i.exec(output);
  if (!promptMatch || promptMatch.index === undefined) {
    return null;
  }

  const promptWindow = output.slice(promptMatch.index, promptMatch.index + 600);
  const optionMatch = /(?:^|\n)\s*(\d+)\s*[\).:-]?\s*.*\bBuilder ID\b/im.exec(promptWindow);
  if (!optionMatch) {
    return null;
  }

  return `${optionMatch[1]}\n`;
}

export function extractLikelyOAuthAuthorizationUrl(output: string): string | null {
  const urls = Array.from(output.matchAll(/https?:\/\/[^\s]+/g), (match) => match[0]);
  let selectedUrl: string | null = null;
  let selectedScore = 0;

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      let score = 0;
      if (parsed.searchParams.has('redirect_uri')) score += 4;
      if (parsed.searchParams.has('state')) score += 2;
      if (parsed.searchParams.has('code_challenge')) score += 1;
      if (parsed.pathname.includes('/authorize')) score += 1;
      if (isLoopbackHost(parsed.hostname)) score -= 3;

      if (score >= selectedScore && score > 0) {
        selectedUrl = url;
        selectedScore = score;
      }
    } catch {
      continue;
    }
  }

  return selectedUrl;
}

export function extractLikelyAuthFailureFromLogs(
  provider: CLIProxyProvider,
  logData: string
): string | null {
  if (!logData.trim()) {
    return null;
  }

  const normalizedLines = logData
    .split('\n')
    .map((line) => line.replace(ANSI_ESCAPE_REGEX, '').trim())
    .filter(Boolean)
    .map((line) => {
      const messageIndex = line.indexOf('msg="');
      if (messageIndex >= 0) {
        const message = line
          .slice(messageIndex + 5)
          .replace(/"$/, '')
          .trim();
        if (message) {
          return message;
        }
      }
      return line;
    });

  const providerPatterns: Partial<Record<CLIProxyProvider, RegExp[]>> = {
    xai: [/xai authentication failed:\s*(.+)/i],
    ghcp: [
      /github copilot authentication failed:\s*(.+)/i,
      /failed to verify copilot access[^:]*:\s*(.+)/i,
    ],
    kiro: [
      /kiro idc authentication failed:\s*(.+)/i,
      /kiro authentication failed:\s*(.+)/i,
      /login failed:\s*(.+)/i,
      /failed to register client:\s*(.+)/i,
    ],
  };

  const prioritizedPatterns = [
    ...(providerPatterns[provider] || []),
    /^authentication failed:\s*(.+)/i,
    /^failed to save auth:\s*(.+)/i,
  ];

  for (let i = normalizedLines.length - 1; i >= 0; i--) {
    const line = normalizedLines[i];
    for (const pattern of prioritizedPatterns) {
      const match = line.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].trim().slice(0, 240);
      }
    }
  }

  return null;
}

export function extractLikelyAuthFailureFromStderr(
  provider: CLIProxyProvider,
  stderrData: string
): string | null {
  return extractLikelyAuthFailureFromLogs(provider, stderrData);
}

export function analyzeSuccessfulAuthExit(options: {
  provider: CLIProxyProvider;
  knownTokenFiles: ProviderTokenSnapshot[];
  currentTokenFiles: ProviderTokenSnapshot[];
  expectedAccountId?: string;
  stdoutData: string;
  stderrData: string;
}): { tokenSnapshot: ProviderTokenSnapshot | null; failureReason: string | null } {
  const tokenSnapshot = findNewTokenSnapshot(
    options.currentTokenFiles,
    options.knownTokenFiles,
    options.expectedAccountId
  );
  const failureReason = extractLikelyAuthFailureFromLogs(
    options.provider,
    [options.stdoutData, options.stderrData].filter(Boolean).join('\n')
  );

  return { tokenSnapshot, failureReason };
}
