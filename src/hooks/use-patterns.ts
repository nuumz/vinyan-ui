import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function usePatterns() {
  return useQuery({
    queryKey: qk.patterns,
    queryFn: () => api.getPatterns().then((r) => r.patterns),
    refetchInterval: useFallbackInterval(60_000),
  });
}
