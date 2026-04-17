import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useAgents() {
  return useQuery({
    queryKey: qk.agents,
    queryFn: () => api.getAgents().then((r) => r.agents),
    refetchInterval: useFallbackInterval(30_000),
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: id ? qk.agent(id) : qk.agent('__none__'),
    queryFn: () => api.getAgent(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}
