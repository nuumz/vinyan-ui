import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export function useDoctor(deep = false) {
  return useQuery({
    queryKey: qk.doctor(deep),
    queryFn: () => api.getDoctor(deep),
    // Doctor is a live diagnostic — do not auto-refetch (user triggers manually).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
