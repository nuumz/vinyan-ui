import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useMCP() {
  return useQuery({
    queryKey: qk.mcp,
    queryFn: () => api.getMCP(),
    refetchInterval: useFallbackInterval(60_000),
  });
}
