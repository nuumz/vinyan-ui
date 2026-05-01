/**
 * Backend-authoritative task process state.
 *
 * Calls `GET /api/v1/tasks/:id/process-state` (api-client
 * `getTaskProcessState`) and returns the projection verbatim. Frontend
 * components MUST consume `data.lifecycle.status`, `data.gates.*`,
 * `data.plan`, `data.codingCliSessions`, etc. directly — they MUST NOT
 * re-classify the underlying raw events. The backend is the single
 * source of truth.
 *
 * Use this in:
 *   - The historical process card (replaces client-side replay folding).
 *   - The task drawer (replaces local `pendingGates` reconstruction).
 *   - On reconnect / visibility focus / terminal events to reconcile
 *     the live `useStreamingTurn` cache.
 *
 * The hook is disabled by default — pass `enabled: true` only when a
 * consumer surface needs it (drawer open, process disclosure expanded).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { TaskProcessProjection } from '@/lib/api-client';

export interface UseTaskProcessStateOptions {
  /** Default `false` — opt-in to keep the bundled task list cheap. */
  enabled?: boolean;
  /**
   * How long to consider the projection fresh. Past tasks are immutable
   * (5 min) but live tasks should poll briefly so gate transitions
   * surface promptly without waiting for the user to refocus the tab.
   */
  staleTimeMs?: number;
  /** Polling cadence while the task is still running. */
  refetchIntervalMs?: number | false;
}

export interface UseTaskProcessStateResult {
  data: TaskProcessProjection | null;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  /** True when the backend reports the task is unknown (404). */
  notFound: boolean;
  /** Trigger a manual refetch (e.g. after the user resolves a gate). */
  refetch: () => void;
}

export function useTaskProcessState(
  taskId: string | undefined,
  options: UseTaskProcessStateOptions = {},
): UseTaskProcessStateResult {
  const enabled = (options.enabled ?? false) && Boolean(taskId);
  const query = useQuery({
    queryKey: ['task-process-state', taskId],
    queryFn: () => api.getTaskProcessState(taskId!),
    enabled,
    staleTime: options.staleTimeMs ?? 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: options.refetchIntervalMs ?? false,
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });
  const status = (query.error as { status?: number } | undefined)?.status;
  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: status === 404 ? null : query.error,
    notFound: status === 404,
    refetch: () => {
      void query.refetch();
    },
  };
}
