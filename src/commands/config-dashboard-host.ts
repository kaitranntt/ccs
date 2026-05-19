import * as os from 'os';

export const DEFAULT_DASHBOARD_HOST = 'localhost';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::']);

interface NetworkInterfaceCandidate {
  address: string;
  family: string | number;
  internal: boolean;
}

type NetworkInterfacesMap = Record<string, NetworkInterfaceCandidate[] | undefined>;

export interface DashboardUrls {
  bindHost?: string;
  browserUrl: string;
  networkUrls?: string[];
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeDashboardHost(host)?.toLowerCase() ?? '');
}

export function isWildcardHost(host: string): boolean {
  return WILDCARD_HOSTS.has(normalizeDashboardHost(host)?.toLowerCase() ?? '');
}

export function normalizeDashboardHost(host: string | undefined): string | undefined {
  if (!host) {
    return undefined;
  }

  const trimmedHost = host.trim();
  if (!trimmedHost) {
    return undefined;
  }

  if (trimmedHost.startsWith('[') && trimmedHost.endsWith(']') && trimmedHost.includes(':')) {
    return trimmedHost.slice(1, -1);
  }

  return trimmedHost;
}

export function resolveDashboardUrls(
  host: string | undefined,
  port: number,
  networkInterfaces?: NetworkInterfacesMap
): DashboardUrls {
  const bindHost = normalizeDashboardHost(host);
  if (!bindHost) {
    return {
      browserUrl: `http://localhost:${port}`,
    };
  }

  if (isWildcardHost(bindHost)) {
    return {
      bindHost,
      browserUrl: `http://localhost:${port}`,
      networkUrls: getExternalIpv4Urls(port, networkInterfaces ?? getNetworkInterfacesSafe()),
    };
  }

  return {
    bindHost,
    browserUrl: `http://${formatHostForUrl(bindHost)}:${port}`,
  };
}

function getExternalIpv4Urls(
  port: number,
  networkInterfaces: NetworkInterfacesMap | undefined
): string[] | undefined {
  if (!networkInterfaces) {
    return undefined;
  }

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const interfaceName of Object.keys(networkInterfaces)) {
    const candidates = networkInterfaces[interfaceName];
    if (!candidates) {
      continue;
    }

    for (const candidate of candidates) {
      const family =
        typeof candidate.family === 'string' ? candidate.family : String(candidate.family);
      if (family === 'IPv4' && !candidate.internal) {
        const url = `http://${candidate.address}:${port}`;
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    }
  }

  return urls.length > 0 ? urls : undefined;
}

function getNetworkInterfacesSafe(): NetworkInterfacesMap | undefined {
  try {
    // Some constrained environments (for example proot) throw here; keep the local dashboard URL.
    return os.networkInterfaces();
  } catch {
    return undefined;
  }
}

function formatHostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[') && !host.endsWith(']')) {
    return `[${host}]`;
  }

  return host;
}
