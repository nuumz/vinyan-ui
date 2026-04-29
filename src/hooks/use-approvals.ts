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

interface WorkflowHumanInputArgs {
  sessionId: string;
  taskId: string;
  stepId: string;
  value: string;
}

interface WorkflowHumanInputResult {
  taskId: string;
  stepId: string;
  sessionId: string;
  status: 'recorded';
}

/**
 * Provide an answer to a workflow `human-input` step. The backend pauses
 * the executor on these steps (emits `workflow:human_input_needed`); this
 * mutation supplies the user's value so the step completes and downstream
 * dependents continue. The streaming reducer clears `pendingHumanInput`
 * when the matching `workflow:human_input_provided` event lands.
 */
export function useProvideWorkflowHumanInput() {
  return useMutation<WorkflowHumanInputResult, Error, WorkflowHumanInputArgs>({
    mutationFn: (args) =>
      api.provideWorkflowHumanInput(args.sessionId, {
        taskId: args.taskId,
        stepId: args.stepId,
        value: args.value,
      }),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to send your answer' });
    },
  });
}
