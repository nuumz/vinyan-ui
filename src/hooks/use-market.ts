import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useMarket() {
  return useQuery({
    queryKey: qk.market,
    queryFn: () => api.getMarket(),
    refetchInterval: useFallbackInterval(30_000),
  });
}
