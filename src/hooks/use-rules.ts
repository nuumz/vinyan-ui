import { useQuery } from '@tanstack/react-query';
import { api, type RuleStatus } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useRules(status?: RuleStatus) {
  return useQuery({
    queryKey: qk.rules(status),
    queryFn: () => api.getRules(status),
    staleTime: 30_000,
  });
}
