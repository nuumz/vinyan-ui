import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useEconomyRecent(limit = 100) {
  return useQuery({
    queryKey: qk.economyRecent(limit),
    queryFn: () => api.getEconomyRecent(limit),
    refetchInterval: useFallbackInterval(30_000),
  });
}
