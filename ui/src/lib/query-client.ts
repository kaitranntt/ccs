import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client configuration
 * Phase 03: REST API Routes & CRUD
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
