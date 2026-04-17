import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useWorkers() {
  return useQuery({
    queryKey: qk.workers,
    queryFn: () => api.getWorkers().then((r) => r.workers),
    refetchInterval: useFallbackInterval(30_000),
  });
}
