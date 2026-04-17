import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

// Query defaults:
//   staleTime 10s    — rapid page switches reuse recent data instead of refetching
//   gcTime   5m      — unmounted queries stay in cache for a while
//   retry    0       — fetchJSON already retries 5xx/network with jitter; don't double up
//   refetchOnWindowFocus disabled — SSE invalidation is the primary freshness signal
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, err) => {
        // Don't retry 4xx — client error won't fix itself
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
