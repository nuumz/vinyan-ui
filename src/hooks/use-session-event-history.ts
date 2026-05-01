/**
 * Session-mount prefetch for cross-task event history.
 *
 * Why this exists. SSE forwards only events that fire AFTER the client
 * connects, and `useTaskEvents` only fires lazily (when a
 * `HistoricalProcessCard` mounts) or `useRecoverTurnHistory` fires
 * (only when a turn is marked `recovered: true`). For a fresh navigation
 * back to an existing session, neither path runs proactively — the
 * historical timeline of past tasks is invisible until the user expands
 * a process card, and the running task's pre-connect events never
 * replay because no card mounts before SSE is wired.
 *
 * What this does. On session mount, hits
 * `GET /api/v1/sessions/:id/event-history` once, groups events by
 * `taskId`, and seeds each task's `['task-event-history', taskId]`
 * React Query cache via `setQueryData`. Subsequent `useTaskEvents`
 * consumers read from cache without a second round-trip. The seeded
 * data uses the same shape the per-task endpoint returns, so existing
 * consumers don't need to know whether the data came from the bulk
 * fetch or a per-task call.
 *
 * Stale handling. Past tasks are immutable (the persisted event log
 * never gets entries once the task terminated), so `staleTime` is
 * long. For a still-running task in the session, the SSE / per-task
 * recovery path takes over after the initial seed — this hook is
 * deliberately a one-shot prefetch, not a live subscription.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface PersistedSessionEvent {
  id: string;
  taskId: string;
  sessionId?: string;
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface UseSessionEventHistoryResult {
  isLoading: boolean;
  error: unknown;
  /** True when the backend reports no recorder is wired (404). */
  unsupported: boolean;
  /** Number of events received in the prefetch. Useful for debugging. */
  eventCount: number;
  /** Number of distinct tasks the events span. */
  taskCount: number;
}

/**
 * Pure helper — group cross-task events by taskId, sort each group by
 * `seq`, and seed the per-task `task-event-history` query cache. Lives
 * outside the hook so the cache-seeding contract is unit-testable
 * without mounting a React tree.
 *
 * Skip-on-fresher-cache invariant. If a per-task fetch already
 * populated the cache (e.g. a `HistoricalProcessCard` mounted before
 * this prefetch settled and called `useTaskEvents` directly), we keep
 * the existing entry whenever its event count is at least as long as
 * our slice. The bulk endpoint may have been cut off mid-stream by the
 * server's pagination cap, so a per-task fetch is authoritative when
 * present.
 */
export function seedTaskCachesFromSessionEvents(
  queryClient: QueryClient,
  events: PersistedSessionEvent[],
): { taskCount: number } {
  if (events.length === 0) return { taskCount: 0 };

  const byTask = new Map<string, PersistedSessionEvent[]>();
  for (const ev of events) {
    const existing = byTask.get(ev.taskId);
    if (existing) {
      existing.push(ev);
    } else {
      byTask.set(ev.taskId, [ev]);
    }
  }

  for (const [taskId, taskEvents] of byTask) {
    taskEvents.sort((a, b) => a.seq - b.seq);
    queryClient.setQueryData(['task-event-history', taskId], (prev: unknown) => {
      if (prev && typeof prev === 'object' && 'events' in prev) {
        const prevEvents = (prev as { events: unknown[] }).events;
        if (Array.isArray(prevEvents) && prevEvents.length >= taskEvents.length) {
          return prev;
        }
      }
      return {
        taskId,
        events: taskEvents,
        // Legacy cursor for parity with per-task endpoint (mode without
        // descendants); takes the highest seq seen.
        lastSeq: taskEvents[taskEvents.length - 1]?.seq,
      };
    });
  }

  return { taskCount: byTask.size };
}

export function useSessionEventHistory(sessionId: string | null): UseSessionEventHistoryResult {
  const queryClient = useQueryClient();
  const enabled = Boolean(sessionId);

  const query = useQuery({
    queryKey: ['session-event-history', sessionId],
    queryFn: () => api.getSessionEventHistory(sessionId!),
    enabled,
    // Past events are immutable — long stale window, no refocus refetch.
    // Once seeded, per-task consumers read from cache; for still-running
    // tasks the live SSE + per-task recovery hook owns updates.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    const events = query.data?.events;
    if (!events || events.length === 0) return;
    seedTaskCachesFromSessionEvents(queryClient, events);
  }, [sessionId, query.data, queryClient]);

  const status = (query.error as { status?: number } | undefined)?.status;
  const eventCount = query.data?.events.length ?? 0;
  const taskCount = query.data ? new Set(query.data.events.map((e) => e.taskId)).size : 0;

  return {
    isLoading: query.isLoading,
    error: status === 404 ? null : query.error,
    unsupported: status === 404,
    eventCount,
    taskCount,
  };
}
