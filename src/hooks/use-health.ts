import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

/** Health ping — 5s when SSE is down, paused when up (SSE itself proves liveness). */
export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.getHealth(),
    refetchInterval: useFallbackInterval(5_000),
    // Always refetch on mount so header status is fresh after navigation
    staleTime: 2_000,
  });
}
