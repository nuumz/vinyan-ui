import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useMetrics() {
  return useQuery({
    queryKey: qk.metrics,
    queryFn: () => api.getMetrics(),
    refetchInterval: useFallbackInterval(5_000),
    staleTime: 3_000,
  });
}

export function usePrometheus() {
  return useQuery({
    queryKey: qk.prometheus,
    queryFn: () => api.getPrometheusMetrics(),
    refetchInterval: useFallbackInterval(10_000),
    staleTime: 5_000,
  });
}
