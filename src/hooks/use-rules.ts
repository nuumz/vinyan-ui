import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useRules() {
  return useQuery({
    queryKey: qk.rules,
    queryFn: () => api.getRules().then((r) => r.rules),
    staleTime: 60_000,
  });
}
