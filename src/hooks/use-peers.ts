import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function usePeers() {
  return useQuery({
    queryKey: qk.peers,
    queryFn: () => api.getPeers(),
    refetchInterval: useFallbackInterval(30_000),
  });
}
