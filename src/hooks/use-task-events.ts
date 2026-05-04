/**
 * Lazy fetch hook for the persisted process log of a past task.
 *
 * Calls `GET /api/v1/tasks/:id/event-history` (api-client `getTaskEventHistory`)
 * and feeds the raw event list through `replayProcessLog` so consumers
 * receive a fully-formed `StreamingTurn` snapshot — the same shape the
 * live SSE bubble renders.
 *
 * Disabled by default: pass `enabled: true` only when the user opens the
 * "Process" disclosure on a historical message. This keeps `/messages`
 * page loads cheap — we only hit the events endpoint on demand.
 *
 * Descendants by default — historical replay calls
 * `?includeDescendants=true&maxDepth=3` so the Multi-agent / Process
 * Replay card can reconstruct each delegate row's persisted tool history.
 * Sub-agents emit `agent:tool_*` under their own `taskId`, which the
 * legacy per-task filter does not return; without descendants the card
 * collapses to "Reasoning-only delegate — final answer captured…" even
 * though tool calls actually happened. The maxDepth is bounded so a
 * pathological delegation graph cannot inflate response size; the
 * backend additionally caps at 64 tasks (TREE_TASKID_CAP) and surfaces
 * `truncated: true` honestly.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api-client';
import { replayProcessLog } from '@/lib/replay-process-log';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';

export interface UseTaskEventsResult {
  /** Raw events as returned by the backend, ordered ascending by `(ts, id)`
   *  in descendants mode (or per-task `seq` in legacy mode). */
  events: Array<{
    id: string;
    taskId: string;
    sessionId?: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
    ts: number;
    /** Set in descendants mode. Legacy mode omits — reducer treats undefined as `'parent'`. */
    scope?: 'parent' | 'descendant';
  }>;
  /** Reduced view ready for the chat UI, or `null` while loading. */
  turn: StreamingTurn | null;
  isLoading: boolean;
  error: unknown;
  /** True when the backend reports no recorder is wired (404). */
  unsupported: boolean;
  /** Descendants mode — true when the resolver hit the 64-task cap server-side. */
  truncated: boolean;
  /** Descendants mode — discovered taskIds (parent + children). */
  taskIds: string[];
}

const DEFAULT_MAX_DEPTH = 3;

export function useTaskEvents(
  taskId: string | undefined,
  options: { enabled?: boolean; includeDescendants?: boolean; maxDepth?: number } = {},
): UseTaskEventsResult {
  const enabled = (options.enabled ?? true) && Boolean(taskId);
  const includeDescendants = options.includeDescendants ?? true;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const query = useQuery({
    queryKey: ['task-event-history', taskId, includeDescendants, maxDepth],
    queryFn: () =>
      api.getTaskEventHistory(taskId!, { includeDescendants, maxDepth }),
    enabled,
    // Once a task terminates the event log is immutable, so a long
    // staleTime + no refetch on focus is the right steady-state
    // behaviour. The mid-execution case is handled by `use-sse-sync`,
    // which invalidates this query on the same reconcile triggers as
    // the projection — without that, opening the historical Process
    // Replay card mid-run would show a frozen plan checklist (the
    // events array is a partial snapshot until the next refetch).
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Surface 404 (no DB / no recorder) as a soft "unsupported" signal
    // rather than red-error UI. We still want network errors to bubble.
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });
  const events = query.data?.events ?? [];
  const turn = useMemo(() => {
    if (!query.data || events.length === 0) return null;
    return replayProcessLog(events, { taskId });
  }, [query.data, events, taskId]);
  const status = (query.error as { status?: number } | undefined)?.status;
  return {
    events,
    turn,
    isLoading: query.isLoading,
    error: status === 404 ? null : query.error,
    unsupported: status === 404,
    truncated: query.data?.truncated ?? false,
    taskIds: query.data?.taskIds ?? (taskId ? [taskId] : []),
  };
}
