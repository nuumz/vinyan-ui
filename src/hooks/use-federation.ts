import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useFederation() {
  return useQuery({
    queryKey: qk.federation,
    queryFn: () => api.getFederation(),
    refetchInterval: useFallbackInterval(30_000),
  });
}
