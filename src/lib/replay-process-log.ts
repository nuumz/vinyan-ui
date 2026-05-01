/**
 * Pure helper that replays a list of persisted bus events into a
 * `StreamingTurn` snapshot — the same data structure the live SSE
 * reducer (`reduceTurn` in `use-streaming-turn.ts`) produces.
 *
 * This is the single source of truth for "what does a past task's
 * process timeline look like": both live streams and historical replays
 * funnel through the same `reduceTurn`, so the chat UI never needs two
 * parallel rendering paths.
 *
 * Shape note: each persisted event is mapped onto an `SSEEvent`-compatible
 * object before being fed to the reducer. The backend writes the same
 * payload the SSE stream forwards (curated allow-list — see
 * `src/orchestrator/observability/task-event-recorder.ts`).
 *
 * Row → payload taskId backfill (2026-05-02): the recorder's `extractIds`
 * derives a row's authoritative `task_id` from `payload.taskId` first,
 * falling back to `payload.input.id` / `payload.result.id` /
 * `payload.result.trace.taskId`. The persisted row therefore always
 * carries the correct attribution at the row level, but `payload` itself
 * may be missing a top-level `taskId` (e.g. the recorder used the
 * fallback path, or the bus emitter used a nested shape). The reducer's
 * `resolveStepId` and `appendContentDelta` invariant is "every event has
 * a payload-level `taskId`" — without it, child sub-task events collapse
 * onto whichever delegate happened to be running first via
 * `currentRunningStepId`. We restore the invariant here by injecting the
 * row-level `taskId` into the payload when missing. This is faithful to
 * the persisted truth (the row-level value is what the descendants query
 * already filtered/merged by) and keeps live + historical paths in
 * lock-step.
 */
import { emptyTurn, reduceTurn, type StreamingTurn } from '@/hooks/use-streaming-turn';
import type { SSEEvent } from '@/lib/api-client';

export interface PersistedTaskEvent {
  id: string;
  taskId: string;
  sessionId?: string;
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  ts: number;
}

export function replayProcessLog(
  events: PersistedTaskEvent[],
  options: { taskId?: string } = {},
): StreamingTurn {
  // Use the first event's timestamp as `startedAt` so phase timings line up
  // with what the live stream would have shown. Defensive default `Date.now()`
  // so an empty input still returns a valid turn.
  const startedAt = events.length > 0 ? events[0]!.ts : Date.now();
  let turn = emptyTurn({
    taskId: options.taskId ?? events[0]?.taskId ?? '',
    startedAt,
    recovered: true,
  });
  for (const ev of events) {
    const payload =
      ev.payload && typeof (ev.payload as { taskId?: unknown }).taskId === 'string'
        ? ev.payload
        : { ...ev.payload, taskId: ev.taskId };
    const sseEvent: SSEEvent = {
      event: ev.eventType,
      payload,
      ts: ev.ts,
    };
    turn = reduceTurn(turn, sseEvent);
  }
  return turn;
}
