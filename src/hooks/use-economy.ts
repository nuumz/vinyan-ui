import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useEconomy() {
  return useQuery({
    queryKey: qk.economy,
    queryFn: () => api.getEconomy(),
    refetchInterval: useFallbackInterval(30_000),
    staleTime: 10_000,
  });
}
