import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';

export function useApprovals() {
  return useQuery({
    queryKey: qk.approvals,
    queryFn: () => api.getPendingApprovals().then((r) => r.pending),
    staleTime: 5_000,
  });
}

export function useResolveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; decision: 'approved' | 'rejected' }) =>
      api.approveTask(args.taskId, args.decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.approvals });
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve approval');
    },
  });
}
