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
      toast.apiError(err, { fallback: 'Failed to resolve approval' });
    },
  });
}

/**
 * Workflow approval gate (Phase E). Distinct from `useResolveApproval`
 * which targets the per-task A6 gate — this resolves the workflow-level
 * plan_ready prompt that pauses long-form goals before any step runs.
 *
 * Backend emits `workflow:plan_approved` / `workflow:plan_rejected` on the
 * bus when these complete; the streaming reducer picks up the event and
 * tears down the inline approval card. We don't manually invalidate any
 * queries here — the SSE event drives all state.
 */
interface WorkflowApprovalArgs {
  sessionId: string;
  taskId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

interface WorkflowApprovalResult {
  taskId: string;
  sessionId: string;
  status: 'approved' | 'rejected';
}

export function useResolveWorkflowApproval() {
  return useMutation<WorkflowApprovalResult, Error, WorkflowApprovalArgs>({
    mutationFn: (args) =>
      args.decision === 'approved'
        ? api.approveWorkflow(args.sessionId, args.taskId)
        : api.rejectWorkflow(args.sessionId, args.taskId, args.reason),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to resolve workflow approval' });
    },
  });
}
