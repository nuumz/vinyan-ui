import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

export function useMemory() {
  return useQuery({
    queryKey: qk.memory,
    queryFn: () => api.getMemory().then((r) => r.proposals),
    staleTime: 30_000,
    // Poll only when SSE is disconnected — `memory:approved/rejected` and
    // `agent:tool_executed` (memory_propose) keep the cache fresh otherwise.
    refetchInterval: useFallbackInterval(60_000),
  });
}

export function useApproveMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { handle: string; reviewer: string }) =>
      api.approveMemory(args.handle, args.reviewer),
    onSuccess: () => {
      toast.success('Proposal approved and merged into learned.md');
      qc.invalidateQueries({ queryKey: qk.memory });
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Approve failed' });
    },
  });
}

export function useRejectMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { handle: string; reviewer: string; reason: string }) =>
      api.rejectMemory(args.handle, args.reviewer, args.reason),
    onSuccess: () => {
      toast.success('Proposal rejected and archived');
      qc.invalidateQueries({ queryKey: qk.memory });
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Reject failed' });
    },
  });
}
