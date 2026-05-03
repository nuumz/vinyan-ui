/**
 * useAuditProjection — entity-scope-aware audit log surface.
 *
 * Five entity scopes the audit-redesign UI navigates today (per the Phase
 * 3 brief; agent-profile is filed as a separate follow-up):
 *
 *   { taskId }                          → task scope
 *   { taskId, subTaskId }               → sub-task scope (sub-task is itself a TaskId)
 *   { taskId, subAgentId }              → sub-agent scope (subAgentId === subTaskId today)
 *   { sessionId, workflowId }           → workflow scope (workflowId === taskId by invariant)
 *   { sessionId }                       → session scope (degraded; see backend gap below)
 *
 * Backend reuse:
 *   - task / sub-task / sub-agent / workflow scopes → existing
 *     `useTaskProcessState(taskId)` (the task projection already carries
 *     `auditLog` / `bySection` / `byEntity` / `provenance` /
 *     `completenessBySection`).
 *   - session scope → falls back to a degraded view backed by
 *     `useTaskProcessState(undefined)` plus the projection layer's
 *     `byEntity.sessionId` rollup. A session-scoped HTTP route does NOT
 *     exist as of Phase 2.7 — the `SessionProcessProjectionService`
 *     lives in vinyan-agent but no `GET /api/v1/sessions/:sid/process-state`
 *     ships yet. See backend gap noted below.
 *
 * KNOWN BACKEND GAPS (P3 brief: "if you discover a backend gap, write it
 * up — do not patch"):
 *   - GAP(audit-redesign/session-process-state-route): no HTTP endpoint
 *     exposes the SessionProcessProjectionService built in P2.7. Until
 *     it ships, session-scope audit views show only what the UI can
 *     reach via existing endpoints (the most-recent task's projection,
 *     filtered to sessionId-matching rows). Phase 4 / follow-up work
 *     should add the route and switch this hook to consume it directly.
 *
 * Sub-task / sub-agent / workflow scopes filter the SAME projection by
 * `byEntity` rollup — the projection's `auditLog` already carries every
 * row scoped to the parent task, so a child-scope view is a pure
 * filter. No extra fetch.
 *
 * Identity stability — the returned `auditLog` / `bySection` references
 * are stable across renders when the underlying projection's content
 * has not changed (`useMemo` keyed on the projection identity + scope).
 * That keeps the AuditView scrubber's tick array memo from invalidating
 * unnecessarily.
 */
import { useMemo } from 'react';
import {
  type AuditEntry,
  type TaskProcessAuditBySection,
  type TaskProcessByEntity,
  type TaskProcessProjection,
  type TaskProcessProvenance,
  type TaskProcessSectionCompleteness,
} from '@/lib/api-client';
import { useTaskProcessState, type UseTaskProcessStateOptions } from './use-task-process-state';

export type AuditScope =
  | { kind: 'task'; taskId: string }
  | { kind: 'subtask'; taskId: string; subTaskId: string }
  | { kind: 'subagent'; taskId: string; subAgentId: string }
  | { kind: 'workflow'; sessionId: string; workflowId: string }
  | { kind: 'session'; sessionId: string };

export interface UseAuditProjectionResult {
  /** Chronological audit entries, scoped to the entity. */
  auditLog: AuditEntry[];
  /** Pre-grouped view, mirrors `auditLog` content (filtered to the scope). */
  bySection: TaskProcessAuditBySection;
  /** Id rollup (sessionId, workflowId, taskId, subTaskIds[], subAgentIds[]). */
  byEntity?: TaskProcessByEntity;
  provenance: TaskProcessProvenance;
  completenessBySection: TaskProcessSectionCompleteness[];
  /** True iff the projection actually carried any audit data after scoping. */
  hasAuditData: boolean;
  /** True when the requested scope does not have a backing fetch (session scope today). */
  isDegraded: boolean;
  /** Pass-through fetch state. */
  isLoading: boolean;
  isFetching: boolean;
  notFound: boolean;
  error: unknown;
  refetch: () => void;
}

const EMPTY_BY_SECTION: TaskProcessAuditBySection = Object.freeze({
  thoughts: [],
  toolCalls: [],
  decisions: [],
  verdicts: [],
  planSteps: [],
  delegates: [],
  subTasks: [],
  subAgents: [],
  workflowEvents: [],
  sessionEvents: [],
  gates: [],
  finals: [],
}) as TaskProcessAuditBySection;

const EMPTY_PROVENANCE: TaskProcessProvenance = Object.freeze({
  policyVersions: [],
  modelIds: [],
  oracleIds: [],
  promptHashes: [],
  capabilityTokenIds: [],
}) as TaskProcessProvenance;

/**
 * Pick the taskId that backs the projection fetch for a given scope.
 * Returns undefined for session-only scope (no fetch — degraded view).
 *
 * Sub-task scope: the sub-task IS itself a TaskId in the persistence
 * layer (its own `task_events` rows). We fetch the sub-task's own
 * projection — its events are scoped to that child.
 *
 * Sub-agent scope: today's invariant `subAgentId === subTaskId` means
 * we fetch the sub-task's projection. If a future PR decouples the
 * mapping, this is the one branch to update.
 */
function resolveBackingTaskId(scope: AuditScope): string | undefined {
  switch (scope.kind) {
    case 'task':
      return scope.taskId;
    case 'subtask':
      return scope.subTaskId;
    case 'subagent':
      return scope.subAgentId;
    case 'workflow':
      return scope.workflowId; // workflowId === taskId by invariant
    case 'session':
      return undefined; // degraded — no task-scoped fetch
  }
}

/**
 * Filter audit entries by scope. For task / workflow / session scopes,
 * return everything the projection produced. For sub-task / sub-agent
 * scopes, narrow to entries whose wrapper or variant body identifies
 * the entity.
 *
 * Exported as `_filterEntries` (underscore prefix marks it internal-
 * for-tests; consumers should use `useAuditProjection`).
 */
export function _filterEntries(entries: readonly AuditEntry[], scope: AuditScope): AuditEntry[] {
  switch (scope.kind) {
    case 'task':
    case 'workflow':
    case 'session':
      return [...entries];
    case 'subtask':
      return entries.filter((e) => {
        if (e.subTaskId === scope.subTaskId) return true;
        if (e.kind === 'subtask' && e.subTaskId === scope.subTaskId) return true;
        return false;
      });
    case 'subagent':
      return entries.filter((e) => {
        if (e.subAgentId === scope.subAgentId) return true;
        if ((e.kind === 'subagent' || e.kind === 'delegate') && e.subAgentId === scope.subAgentId) return true;
        if (e.kind === 'plan_step' && e.subAgentId === scope.subAgentId) return true;
        return false;
      });
  }
}

/** Internal-for-tests: re-group filtered entries into bySection buckets. */
export function _regroup(entries: readonly AuditEntry[]): TaskProcessAuditBySection {
  const out: TaskProcessAuditBySection = {
    thoughts: [],
    toolCalls: [],
    decisions: [],
    verdicts: [],
    planSteps: [],
    delegates: [],
    subTasks: [],
    subAgents: [],
    workflowEvents: [],
    sessionEvents: [],
    gates: [],
    finals: [],
  };
  for (const e of entries) {
    switch (e.kind) {
      case 'thought':
        out.thoughts.push(e);
        break;
      case 'tool_call':
        out.toolCalls.push(e);
        break;
      case 'decision':
        out.decisions.push(e);
        break;
      case 'verdict':
        out.verdicts.push(e);
        break;
      case 'plan_step':
        out.planSteps.push(e);
        break;
      case 'delegate':
        out.delegates.push(e);
        break;
      case 'subtask':
        out.subTasks.push(e);
        break;
      case 'subagent':
        out.subAgents.push(e);
        break;
      case 'workflow':
        out.workflowEvents.push(e);
        break;
      case 'session':
        out.sessionEvents.push(e);
        break;
      case 'gate':
        out.gates.push(e);
        break;
      case 'final':
        out.finals.push(e);
        break;
    }
  }
  return out;
}

function deriveResult(
  scope: AuditScope,
  projection: TaskProcessProjection | null | undefined,
  fetchState: { isLoading: boolean; isFetching: boolean; notFound: boolean; error: unknown; refetch: () => void },
): UseAuditProjectionResult {
  const isDegraded = scope.kind === 'session';
  if (!projection) {
    return {
      auditLog: [],
      bySection: EMPTY_BY_SECTION,
      provenance: EMPTY_PROVENANCE,
      completenessBySection: [],
      hasAuditData: false,
      isDegraded,
      ...fetchState,
    };
  }
  const allEntries = projection.auditLog ?? [];
  const filtered = _filterEntries(allEntries, scope);
  // For task / workflow scopes the projection's own bySection is the
  // canonical group. For sub-task / sub-agent scopes we re-group from
  // the filtered subset — the parent projection's grouping carries
  // unscoped rows we need to drop.
  const bySection =
    scope.kind === 'task' || scope.kind === 'workflow'
      ? (projection.bySection ?? _regroup(filtered))
      : _regroup(filtered);
  return {
    auditLog: filtered,
    bySection,
    byEntity: projection.byEntity,
    provenance: projection.provenance ?? EMPTY_PROVENANCE,
    completenessBySection: projection.completenessBySection ?? [],
    hasAuditData: filtered.length > 0,
    isDegraded,
    ...fetchState,
  };
}

/**
 * Scope-aware audit projection consumer. Pass the entity scope you want
 * — task / sub-task / sub-agent / workflow / session — and the hook
 * returns the audit shape filtered to that entity. Session scope is
 * degraded today (returns `isDegraded: true` + empty data) until the
 * backend route lands; see GAP comment at the top of the file.
 */
export function useAuditProjection(
  scope: AuditScope | undefined,
  options: UseTaskProcessStateOptions = {},
): UseAuditProjectionResult {
  const backingTaskId = scope ? resolveBackingTaskId(scope) : undefined;
  const state = useTaskProcessState(backingTaskId, options);

  const result = useMemo<UseAuditProjectionResult>(() => {
    if (!scope) {
      return {
        auditLog: [],
        bySection: EMPTY_BY_SECTION,
        provenance: EMPTY_PROVENANCE,
        completenessBySection: [],
        hasAuditData: false,
        isDegraded: false,
        isLoading: false,
        isFetching: false,
        notFound: false,
        error: null,
        refetch: () => {},
      };
    }
    return deriveResult(scope, state.data, {
      isLoading: state.isLoading,
      isFetching: state.isFetching,
      notFound: state.notFound,
      error: state.error,
      refetch: state.refetch,
    });
    // Re-derive when scope identity or projection identity changes. The
    // projection content is referentially stable from TanStack Query's
    // queryClient cache, so a no-op refetch does not break the memo.
  }, [scope, state.data, state.isLoading, state.isFetching, state.notFound, state.error, state.refetch]);

  return result;
}
