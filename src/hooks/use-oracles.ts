import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useOracles() {
  return useQuery({
    queryKey: qk.oracles,
    queryFn: () => api.getOracles().then((r) => r.oracles),
    refetchInterval: useFallbackInterval(30_000),
  });
}
