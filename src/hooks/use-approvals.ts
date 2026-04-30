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
      // 404 = approval already resolved or auto-rejected on the server side
      // (the gate's 5-min timer fired between fetch and click, or another
      // tab resolved it). Treat as a soft success-equivalent — tear the
      // stale card down via cache invalidation and surface a neutral
      // toast instead of an error. Without this, every race with the
      // timeout looks like a client error to the user.
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) {
        qc.invalidateQueries({ queryKey: qk.approvals });
        qc.invalidateQueries({ queryKey: qk.tasks });
        toast.info('Approval already resolved (timed out or handled elsewhere).');
        return;
      }
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

interface SuggestHumanInputArgs {
  sessionId: string;
  taskId: string;
  stepId: string;
  question: string;
  count?: number;
}

interface SuggestHumanInputResult {
  taskId: string;
  stepId: string;
  sessionId: string;
  suggestions: string[];
}

/**
 * Ask the backend LLM for candidate answers to a `human-input` step. Used
 * by the inline answer card's "Suggest answers" button — when the user
 * can't think of how to answer the agent's question (or wants to see what
 * the model would propose) this returns a small list of options they can
 * click to fill the textarea.
 *
 * The mutation surfaces 502s as recoverable errors via the toast — the
 * user can still type a free-form answer if suggestions aren't available.
 */
export function useSuggestWorkflowHumanInput() {
  return useMutation<SuggestHumanInputResult, Error, SuggestHumanInputArgs>({
    mutationFn: (args) =>
      api.suggestWorkflowHumanInput(args.sessionId, {
        taskId: args.taskId,
        stepId: args.stepId,
        question: args.question,
        count: args.count,
      }),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Could not generate suggestions' });
    },
  });
}

interface PartialFailureDecisionArgs {
  sessionId: string;
  taskId: string;
  decision: 'continue' | 'abort';
  rationale?: string;
}

interface PartialFailureDecisionResult {
  taskId: string;
  sessionId: string;
  decision: 'continue' | 'abort';
  status: 'recorded';
}

/**
 * Resolve the runtime partial-failure decision gate. Fired by the backend
 * (`workflow:partial_failure_decision_needed`) after a multi-agent workflow
 * completes execution but at least one delegate-sub-agent step failed AND
 * its cascade caused a dependent step to skip — i.e. the planned work can
 * no longer be delivered as the user intended. The user picks `'continue'`
 * (ship the deterministic aggregation of survivors as `partial`) or
 * `'abort'` (fail the task with rationale). The streaming reducer clears
 * `pendingPartialDecision` when the matching `_provided` event lands.
 */
export function useProvidePartialFailureDecision() {
  return useMutation<PartialFailureDecisionResult, Error, PartialFailureDecisionArgs>({
    mutationFn: (args) =>
      api.providePartialFailureDecision(args.sessionId, {
        taskId: args.taskId,
        decision: args.decision,
        rationale: args.rationale,
      }),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to send your decision' });
    },
  });
}
