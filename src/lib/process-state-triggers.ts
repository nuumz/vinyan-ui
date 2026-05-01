/**
 * Process-state reconciliation triggers.
 *
 * The live SSE reducer (`reduceTurn`) folds events into an optimistic
 * StreamingTurn for fast UX. The backend `/api/v1/tasks/:id/process-state`
 * endpoint is the **authoritative** source for lifecycle, gates, plan,
 * and coding-cli state.
 *
 * This module is the bridge: certain bus events ("triggers") signal
 * that the backend's projection has materially changed and the React
 * Query cache for that task must be invalidated so any active
 * `useTaskProcessState(taskId)` consumer refetches and replaces the
 * optimistic local state with backend authority.
 *
 * Triggers fall into three groups:
 *   1. Terminal lifecycle (`task:complete`, `task:timeout`, `task:failed`,
 *      `task:cancelled`, `task:escalate`) — the projection's
 *      `lifecycle.status` and `completeness.kind` flip.
 *   2. Workflow / coding-cli / approval gate transitions — the
 *      projection's `gates.*` flip.
 *   3. Coding-cli session terminal events — the projection's
 *      `codingCliSessions[*].state` flips.
 *
 * `workflow:plan_ready` is a conditional trigger: it only opens the
 * approval gate when its payload sets `awaitingApproval === true`. We
 * mirror that condition here so an "informational plan_ready" doesn't
 * burn a refetch on every task.
 *
 * Pure module — no React, no React Query, no IO. The SSE wiring imports
 * `isReconcileTriggerEvent` to decide whether to invalidate; the contract
 * test imports `RECONCILE_TRIGGER_EVENT_TYPES` to assert coverage.
 */

/**
 * Bus events that, when delivered via SSE, mean the backend's task
 * process projection has authoritative state changes worth refetching.
 *
 * Add a new entry here ONLY when the corresponding projection field
 * changes (see vinyan-agent/src/api/projections/task-process-projection.ts
 * `PROJECTION_INTERPRETED_EVENTS`). Adding a non-projection event
 * here causes redundant refetches; missing a real trigger leaves the
 * UI showing stale optimistic state.
 */
export const RECONCILE_TRIGGER_EVENT_TYPES: ReadonlySet<string> = new Set([
  // Terminal lifecycle — projection.lifecycle.status flips.
  'task:complete',
  'task:done',
  'task:failed',
  'task:escalate',
  'task:timeout',
  'task:cancelled',

  // Workflow gate transitions — projection.gates.* flips.
  'workflow:plan_approved',
  'workflow:plan_rejected',
  'workflow:human_input_needed',
  'workflow:human_input_provided',
  'workflow:partial_failure_decision_needed',
  'workflow:partial_failure_decision_provided',

  // Coding-CLI gate transitions — projection.gates.codingCliApproval flips.
  'coding-cli:approval_required',
  'coding-cli:approval_resolved',

  // Coding-CLI session terminal — projection.codingCliSessions[*].state flips.
  'coding-cli:completed',
  'coding-cli:failed',
  'coding-cli:cancelled',

  // Durable approval ledger — projection.gates.approval flips.
  'approval:ledger_pending',
  'approval:ledger_resolved',
  'approval:ledger_superseded',
]);

/**
 * Decide whether an SSE event should invalidate the projection cache.
 *
 * The conditional case is `workflow:plan_ready`: it only opens the
 * approval gate (and therefore changes the projection) when the
 * payload's `awaitingApproval` flag is true. The non-blocking
 * "plan finalized" variant doesn't trigger a refetch — it would
 * fire on every workflow that runs a planner phase.
 */
export function isReconcileTriggerEvent(
  eventType: string,
  payload?: Record<string, unknown> | null,
): boolean {
  if (RECONCILE_TRIGGER_EVENT_TYPES.has(eventType)) return true;
  if (eventType === 'workflow:plan_ready') {
    if (!payload || typeof payload !== 'object') return false;
    return (payload as { awaitingApproval?: unknown }).awaitingApproval === true;
  }
  return false;
}

/**
 * Best-effort taskId extractor for an SSE payload. Returns `undefined`
 * when the payload lacks a string `taskId` — the SSE-layer wiring
 * then falls back to a partial-key invalidation that refetches every
 * active projection query (safe but broader). Used by the SSE wiring
 * after `isReconcileTriggerEvent` returns true.
 */
export function extractTaskIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const taskId = (payload as { taskId?: unknown }).taskId;
  return typeof taskId === 'string' && taskId.length > 0 ? taskId : undefined;
}
