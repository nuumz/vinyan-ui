import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useFacts() {
  return useQuery({
    queryKey: qk.facts,
    queryFn: () => api.getFacts().then((r) => r.facts),
    staleTime: 30_000,
  });
}
