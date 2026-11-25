import { useQuery } from '@tanstack/react-query';

interface Overview {
  version: string;
  profiles: number;
  cliproxy: number;
  cliproxyVariants: number;
  cliproxyProviders: number;
  accounts: number;
  health: {
    status: 'ok' | 'warning' | 'error';
    passed: number;
    total: number;
  };
}

export function useOverview() {
  return useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: async () => {
      const res = await fetch('/api/overview');
      if (!res.ok) {
        throw new Error(`Failed to fetch overview (${res.status})`);
      }
      return res.json();
    },
  });
}
