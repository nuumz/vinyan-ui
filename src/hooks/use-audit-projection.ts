/**
 * useAuditProjection — backend-authoritative audit log for a task.
 *
 * Reads the projection's `auditLog` / `bySection` / `provenance` /
 * `completenessBySection` from `GET /api/v1/tasks/:id/process-state`
 * and exposes a stable shape for the AuditView component. Lives in
 * its own hook (separate from `use-streaming-turn`) so the 2104-line
 * reducer doesn't have to grow eight new variants × dedup × bySection.
 *
 * Live mode: synthesized log appears as soon as a few legacy events land
 * (the projection's lazy-synthesis path covers tool-calls / verdicts /
 * decisions). Historical mode: the same shape, populated from the
 * persisted audit:entry rows when they exist, else from synthesis.
 *
 * No SSE merge here — `audit:entry` events are `record:true, sse:false`
 * by design (see `event-manifest.ts`). The hook polls `/process-state`
 * for live updates via TanStack Query's refetchInterval.
 */
import { useMemo } from 'react';
import {
  type AuditEntry,
  type TaskProcessAuditBySection,
  type TaskProcessProvenance,
  type TaskProcessSectionCompleteness,
} from '@/lib/api-client';
import { useTaskProcessState, type UseTaskProcessStateOptions } from './use-task-process-state';

export interface UseAuditProjectionResult {
  /** Chronological audit entries. Empty array when projection lacks audit data. */
  auditLog: AuditEntry[];
  /** Pre-grouped view, mirrors `auditLog` content. */
  bySection: TaskProcessAuditBySection;
  provenance: TaskProcessProvenance;
  completenessBySection: TaskProcessSectionCompleteness[];
  /** True iff the projection actually carried any audit data (real or synthesized). */
  hasAuditData: boolean;
  /** Pass-through for surface-level state. */
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
  gates: [],
  finals: [],
}) as TaskProcessAuditBySection;

const EMPTY_PROVENANCE: TaskProcessProvenance = Object.freeze({
  policyVersions: [],
  modelIds: [],
  oracleIds: [],
  promptHashes: [],
}) as TaskProcessProvenance;

export function useAuditProjection(
  taskId: string | undefined,
  options: UseTaskProcessStateOptions = {},
): UseAuditProjectionResult {
  const state = useTaskProcessState(taskId, options);
  const projection = state.data;

  const derived = useMemo(() => {
    const log = projection?.auditLog ?? [];
    return {
      auditLog: log,
      bySection: projection?.bySection ?? EMPTY_BY_SECTION,
      provenance: projection?.provenance ?? EMPTY_PROVENANCE,
      completenessBySection: projection?.completenessBySection ?? [],
      hasAuditData: log.length > 0,
    };
  }, [projection]);

  return {
    ...derived,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    notFound: state.notFound,
    error: state.error,
    refetch: state.refetch,
  };
}
