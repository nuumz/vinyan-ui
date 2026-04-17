import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useEngine(id: string | null) {
  return useQuery({
    queryKey: id ? qk.engine(id) : qk.engine('__none__'),
    queryFn: () => api.getEngine(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}
