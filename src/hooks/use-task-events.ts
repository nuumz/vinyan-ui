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
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api-client';
import { replayProcessLog } from '@/lib/replay-process-log';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';

export interface UseTaskEventsResult {
  /** Raw events as returned by the backend, ordered by `seq` ascending. */
  events: Array<{
    id: string;
    taskId: string;
    sessionId?: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
    ts: number;
  }>;
  /** Reduced view ready for the chat UI, or `null` while loading. */
  turn: StreamingTurn | null;
  isLoading: boolean;
  error: unknown;
  /** True when the backend reports no recorder is wired (404). */
  unsupported: boolean;
}

export function useTaskEvents(
  taskId: string | undefined,
  options: { enabled?: boolean } = {},
): UseTaskEventsResult {
  const enabled = (options.enabled ?? true) && Boolean(taskId);
  const query = useQuery({
    queryKey: ['task-event-history', taskId],
    queryFn: () => api.getTaskEventHistory(taskId!),
    enabled,
    // Past tasks are immutable — the event log never gets new entries
    // once the task has terminated. Long staleTime + no refetch on focus
    // mirrors that.
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
  };
}
