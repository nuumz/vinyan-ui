import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export interface TraceFilters {
  limit?: number;
  outcome?: string;
  taskType?: string;
}

export function useTraces(filters: TraceFilters = {}) {
  const key = JSON.stringify(filters);
  return useQuery({
    queryKey: qk.traces(key),
    queryFn: () => api.getTraces(filters),
    refetchInterval: useFallbackInterval(30_000),
  });
}
