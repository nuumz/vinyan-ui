import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';

export function useMemory() {
  return useQuery({
    queryKey: qk.memory,
    queryFn: () => api.getMemory().then((r) => r.proposals),
    staleTime: 30_000,
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
      toast.error(err instanceof Error ? err.message : 'Approve failed');
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
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    },
  });
}
