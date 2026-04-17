import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useProviders() {
  return useQuery({
    queryKey: qk.providers,
    queryFn: () => api.getProviders(),
    refetchInterval: useFallbackInterval(60_000),
  });
}
