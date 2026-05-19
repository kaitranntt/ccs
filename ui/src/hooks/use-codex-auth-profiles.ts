/**
 * React hook for fetching codex-auth profile summary from
 * GET /api/codex/profiles. Returns the active profile, default,
 * and per-profile list with decoded identity fields.
 *
 * Mirrors the useCodex pattern (use-codex.ts:70) with a 15s refetch
 * interval — dashboard polls are low-frequency; the server-side 5s
 * cache absorbs bursts.
 */

import { useQuery } from '@tanstack/react-query';
import { withApiBase } from '@/lib/api-client';

export interface CodexAuthProfileEntry {
  name: string;
  codexHome: string;
  email: string | null;
  plan: string | null;
  /** accountId returned by API but not displayed in UI per D6. */
  accountId: string | null;
  lastUsed: string | null;
  authValid: boolean;
}

export interface CodexAuthActiveProfile {
  name: string | null;
  source: 'default' | 'env' | 'explicit-codex-home';
  codexHome: string;
}

export interface CodexAuthProfilesResponse {
  active: CodexAuthActiveProfile | null;
  default: string | null;
  profiles: CodexAuthProfileEntry[];
}

async function fetchCodexAuthProfiles(): Promise<CodexAuthProfilesResponse> {
  const res = await fetch(withApiBase('/codex/profiles'));
  if (!res.ok) {
    throw new Error('Failed to fetch Codex auth profiles');
  }
  return res.json() as Promise<CodexAuthProfilesResponse>;
}

export function useCodexAuthProfiles() {
  return useQuery({
    queryKey: ['codex-auth-profiles'],
    queryFn: fetchCodexAuthProfiles,
    refetchInterval: 15000,
  });
}
