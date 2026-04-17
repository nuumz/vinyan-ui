import { useQuery } from '@tanstack/react-query';
import { api, type ShadowStatus } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useShadow(status?: ShadowStatus) {
  return useQuery({
    queryKey: qk.shadow(status),
    queryFn: () => api.getShadow(status),
    refetchInterval: useFallbackInterval(10_000),
  });
}
