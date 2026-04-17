import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useHMS() {
  return useQuery({
    queryKey: qk.hms,
    queryFn: () => api.getHMS(),
    refetchInterval: useFallbackInterval(30_000),
  });
}
