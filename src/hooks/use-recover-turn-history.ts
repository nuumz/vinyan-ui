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
 * Cache sharing. Reads through `useTaskEvents` so the
 * `['task-event-history', taskId]` cache is shared with the rest of
 * the app — if `useSessionEventHistory` already seeded the per-task
 * slice on session mount, this hook becomes a cache read with no
 * network round-trip. The `prefetchSettled` gate keeps it from
 * firing its own fetch while the session-level prefetch is still in
 * flight (otherwise both endpoints would race and both would land,
 * doubling bandwidth for the same data).
 *
 * Disabled when there's no recovered turn — a freshly-started turn
 * is owned by live SSE and the POST stream from `useSendMessage`.
 */
import { useEffect, useRef } from 'react';
import { useStreamingTurnStore } from '@/hooks/use-streaming-turn';
import { useTaskEvents } from '@/hooks/use-task-events';

export function useRecoverTurnHistory(
  sessionId: string | null,
  taskId: string | null,
  recovered: boolean,
  prefetchSettled: boolean,
) {
  const replayInto = useStreamingTurnStore((s) => s.replayInto);
  const lastReplayedRef = useRef<string | null>(null);

  // Gate on `prefetchSettled` so we don't race the session-level
  // prefetch. The prefetch seeds the same cache (`task-event-history`),
  // so once it lands we read from cache instead of firing a duplicate
  // network call. `prefetchSettled` flips true on success, 404, or
  // error — we never wait forever; we just defer one tick.
  const enabled = Boolean(sessionId && taskId && recovered && prefetchSettled);
  const { events } = useTaskEvents(taskId ?? undefined, { enabled });

  useEffect(() => {
    if (!sessionId || !taskId) return;
    if (!events || events.length === 0) return;
    // Replay once per (session, task). A new running task on the same
    // session creates a different recovered turn (different taskId),
    // which resets the guard and re-runs replay for that task.
    const key = `${sessionId}::${taskId}`;
    if (lastReplayedRef.current === key) return;
    lastReplayedRef.current = key;
    replayInto(sessionId, taskId, events);
  }, [sessionId, taskId, events, replayInto]);
}
