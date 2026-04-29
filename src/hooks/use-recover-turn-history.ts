/**
 * After `hydrateRunningTask` creates a recovered turn shell on browser
 * refresh, fetch the persisted event log for the in-flight task and
 * replay it through the same reducer that drives live SSE. Brings back
 * the "Planning · Decomposing" stage card, plan steps, tool calls, and
 * any other process state that was on screen before the refresh.
 *
 * Why not rely on SSE? SSE forwards only events that fire AFTER the
 * client connects. Events emitted before the page mounted (e.g. the
 * `task:stage_update` that set the stage card) are persisted in
 * `task_events` but invisible to a fresh subscriber.
 *
 * Disabled when there's no recovered turn — a freshly-started turn
 * is owned by live SSE and the POST stream from `useSendMessage`.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useStreamingTurnStore } from '@/hooks/use-streaming-turn';

export function useRecoverTurnHistory(sessionId: string | null, taskId: string | null, recovered: boolean) {
  const replayInto = useStreamingTurnStore((s) => s.replayInto);
  const lastReplayedRef = useRef<string | null>(null);

  const enabled = Boolean(sessionId && taskId && recovered);
  const query = useQuery({
    queryKey: ['recovered-turn-history', taskId],
    queryFn: () => api.getTaskEventHistory(taskId!),
    enabled,
    // We want fresh data on mount/refresh — this is the whole point.
    // refetchOnWindowFocus stays off so a tab-back during a running
    // task does NOT re-replay (live SSE owns updates from then on,
    // and the `lastReplayedRef` guard would skip the call anyway).
    staleTime: 0,
    refetchOnWindowFocus: false,
    // 404 = backend has no recorder wired (no DB or recorder disabled).
    // Treat as "no history available" rather than red-error UI.
    retry: (failureCount, err) => {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!sessionId || !taskId) return;
    const events = query.data?.events;
    if (!events || events.length === 0) return;
    // Replay once per (session, task). A new running task on the same
    // session creates a different recovered turn (different taskId),
    // which resets the guard and re-runs replay for that task.
    const key = `${sessionId}::${taskId}`;
    if (lastReplayedRef.current === key) return;
    lastReplayedRef.current = key;
    replayInto(sessionId, taskId, events);
  }, [sessionId, taskId, query.data, replayInto]);
}
