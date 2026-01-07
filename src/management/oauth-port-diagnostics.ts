/**
 * OAuth Port Diagnostics Module
 *
 * Pre-flight checks for OAuth callback ports to detect conflicts
 * before users attempt authentication.
 *
 * OAuth flows require specific localhost ports for callbacks:
 * - Gemini: 8085
 * - Codex: 1455
 * - Agy: 51121
 * - Qwen: Device Code Flow (no port needed)
 */

import {
  getPortProcess,
  PortProcess,
  isCLIProxyProcess,
  checkWindowsFirewall,
  testLocalhostBinding,
  FirewallCheckResult,
  BindingTestResult,
} from '../utils/port-utils';
import { CLIProxyProvider } from '../cliproxy/types';

/**
 * OAuth callback ports for each provider
 * Extracted from CLIProxyAPI source
 */
export const OAUTH_CALLBACK_PORTS: Record<CLIProxyProvider, number | null> = {
  gemini: 8085,
  codex: 1455,
  agy: 51121,
  qwen: null, // Device Code Flow - no callback port
  iflow: 11451, // Authorization Code Flow
  kiro: 9876, // Authorization Code Flow
  ghcp: null, // Device Code Flow - no callback port
};

/**
 * OAuth flow types
 */
export type OAuthFlowType = 'authorization_code' | 'device_code';

/**
 * OAuth flow type per provider
 */
export const OAUTH_FLOW_TYPES: Record<CLIProxyProvider, OAuthFlowType> = {
  gemini: 'authorization_code',
  codex: 'authorization_code',
  agy: 'authorization_code',
  qwen: 'device_code',
  iflow: 'authorization_code',
  kiro: 'authorization_code',
  ghcp: 'device_code',
};

/**
 * Port diagnostic result
 */
export interface OAuthPortDiagnostic {
  /** Provider name */
  provider: CLIProxyProvider;
  /** OAuth flow type */
  flowType: OAuthFlowType;
  /** Callback port (null for device code flow) */
  port: number | null;
  /** Port status */
  status: 'free' | 'occupied' | 'cliproxy' | 'not_applicable';
  /** Process occupying the port (if any) */
  process: PortProcess | null;
  /** Human-readable status message */
  message: string;
  /** Recommendation for fixing (if issue detected) */
  recommendation: string | null;
}

/**
 * Check OAuth port availability for a single provider
 */
export async function checkOAuthPort(provider: CLIProxyProvider): Promise<OAuthPortDiagnostic> {
  const port = OAUTH_CALLBACK_PORTS[provider];
  const flowType = OAUTH_FLOW_TYPES[provider];

  // Device code flow doesn't need callback port
  if (port === null) {
    return {
      provider,
      flowType,
      port: null,
      status: 'not_applicable',
      process: null,
      message: 'Uses Device Code Flow (no callback port needed)',
      recommendation: null,
    };
  }

  // Check if port is in use
  const portProcess = await getPortProcess(port);

  if (!portProcess) {
    return {
      provider,
      flowType,
      port,
      status: 'free',
      process: null,
      message: `Port ${port} is available`,
      recommendation: null,
    };
  }

  // Check if it's CLIProxy (expected if proxy is running)
  if (isCLIProxyProcess(portProcess)) {
    return {
      provider,
      flowType,
      port,
      status: 'cliproxy',
      process: portProcess,
      message: `Port ${port} in use by CLIProxy (expected)`,
      recommendation: null,
    };
  }

  // Port is occupied by another process
  return {
    provider,
    flowType,
    port,
    status: 'occupied',
    process: portProcess,
    message: `Port ${port} occupied by ${portProcess.processName}`,
    recommendation: `Kill process: kill ${portProcess.pid} (or close ${portProcess.processName})`,
  };
}

/**
 * Check OAuth ports for all providers
 */
export async function checkAllOAuthPorts(): Promise<OAuthPortDiagnostic[]> {
  const providers: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];
  const results: OAuthPortDiagnostic[] = [];

  for (const provider of providers) {
    const diagnostic = await checkOAuthPort(provider);
    results.push(diagnostic);
  }

  return results;
}

/**
 * Check OAuth ports for providers that use Authorization Code flow only
 */
export async function checkAuthCodePorts(): Promise<OAuthPortDiagnostic[]> {
  const providers: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'kiro'];
  const results: OAuthPortDiagnostic[] = [];

  for (const provider of providers) {
    const diagnostic = await checkOAuthPort(provider);
    results.push(diagnostic);
  }

  return results;
}

/**
 * Get providers with port conflicts
 */
export async function getPortConflicts(): Promise<OAuthPortDiagnostic[]> {
  const allPorts = await checkAllOAuthPorts();
  return allPorts.filter((d) => d.status === 'occupied');
}

/**
 * Format OAuth port diagnostics for display
 */
export function formatOAuthPortDiagnostics(diagnostics: OAuthPortDiagnostic[]): string[] {
  const lines: string[] = [];

  for (const diag of diagnostics) {
    const providerName = diag.provider.charAt(0).toUpperCase() + diag.provider.slice(1);
    const portStr = diag.port !== null ? `(${diag.port})` : '';

    let statusIcon: string;
    switch (diag.status) {
      case 'free':
        statusIcon = '[OK]';
        break;
      case 'cliproxy':
        statusIcon = '[OK]';
        break;
      case 'occupied':
        statusIcon = '[!]';
        break;
      case 'not_applicable':
        statusIcon = '[i]';
        break;
      default:
        statusIcon = '[?]';
    }

    const label = `${providerName} ${portStr}`.padEnd(20);
    lines.push(`${statusIcon} ${label} ${diag.message}`);

    if (diag.recommendation) {
      lines.push(`                        → ${diag.recommendation}`);
    }
  }

  return lines;
}

/**
 * Enhanced pre-flight check result with detailed diagnostics
 */
export interface EnhancedPreflightResult {
  ready: boolean;
  issues: string[];
  checks: PreflightCheck[];
  firewallWarning?: string;
  firewallFixCommand?: string;
}

/**
 * Individual pre-flight check result
 */
export interface PreflightCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  fixCommand?: string;
}

/**
 * Pre-flight check before OAuth - returns issues or empty array if OK
 * @deprecated Use enhancedPreflightOAuthCheck for more detailed diagnostics
 */
export async function preflightOAuthCheck(provider: CLIProxyProvider): Promise<{
  ready: boolean;
  issues: string[];
}> {
  const result = await enhancedPreflightOAuthCheck(provider);
  return {
    ready: result.ready,
    issues: result.issues,
  };
}

/**
 * Enhanced pre-flight check with detailed step-by-step diagnostics
 * Returns structured results for real-time display
 */
export async function enhancedPreflightOAuthCheck(
  provider: CLIProxyProvider
): Promise<EnhancedPreflightResult> {
  const port = OAUTH_CALLBACK_PORTS[provider];
  const flowType = OAUTH_FLOW_TYPES[provider];
  const checks: PreflightCheck[] = [];
  const issues: string[] = [];

  // Device code flow doesn't need port checks
  if (flowType === 'device_code' || port === null) {
    checks.push({
      name: 'OAuth Flow',
      status: 'ok',
      message: 'Uses Device Code Flow (no callback port needed)',
    });
    return { ready: true, issues: [], checks };
  }

  // Check 1: Port availability via process detection
  const portProcess = await getPortProcess(port);
  if (portProcess && !isCLIProxyProcess(portProcess)) {
    checks.push({
      name: 'Port Availability',
      status: 'fail',
      message: `Port ${port} blocked by ${portProcess.processName} (PID ${portProcess.pid})`,
      fixCommand:
        process.platform === 'win32'
          ? `taskkill /F /PID ${portProcess.pid}`
          : `kill ${portProcess.pid}`,
    });
    issues.push(`Port ${port} is blocked by ${portProcess.processName} (PID ${portProcess.pid})`);
  } else if (portProcess && isCLIProxyProcess(portProcess)) {
    checks.push({
      name: 'Port Availability',
      status: 'ok',
      message: `Port ${port} in use by CLIProxy (OK)`,
    });
  } else {
    checks.push({
      name: 'Port Availability',
      status: 'ok',
      message: `Port ${port} is available`,
    });
  }

  // Check 2: Localhost binding test (verifies we can actually listen)
  const bindingResult: BindingTestResult = await testLocalhostBinding(port);
  if (!bindingResult.success && !portProcess) {
    // Only fail if no process found but binding failed (weird state)
    checks.push({
      name: 'Localhost Binding',
      status: 'warn',
      message: bindingResult.message,
    });
  } else if (bindingResult.success) {
    checks.push({
      name: 'Localhost Binding',
      status: 'ok',
      message: 'Can bind to localhost',
    });
  }

  // Check 3: Windows Firewall (only on Windows)
  let firewallWarning: string | undefined;
  let firewallFixCommand: string | undefined;

  if (process.platform === 'win32') {
    const firewallResult: FirewallCheckResult = await checkWindowsFirewall(port);
    if (firewallResult.mayBlock) {
      checks.push({
        name: 'Windows Firewall',
        status: 'warn',
        message: firewallResult.message,
        fixCommand: firewallResult.fixCommand,
      });
      firewallWarning = firewallResult.message;
      firewallFixCommand = firewallResult.fixCommand;
      // Don't add to issues - just a warning, not a blocker
    } else if (firewallResult.checked) {
      checks.push({
        name: 'Windows Firewall',
        status: 'ok',
        message: 'Firewall rules allow port',
      });
    }
  }

  return {
    ready: issues.length === 0,
    issues,
    checks,
    firewallWarning,
    firewallFixCommand,
  };
}

export default {
  OAUTH_CALLBACK_PORTS,
  OAUTH_FLOW_TYPES,
  checkOAuthPort,
  checkAllOAuthPorts,
  checkAuthCodePorts,
  getPortConflicts,
  formatOAuthPortDiagnostics,
  preflightOAuthCheck,
  enhancedPreflightOAuthCheck,
};
