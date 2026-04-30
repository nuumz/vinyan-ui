/**
 * Replay completeness — classifies the persisted bus event log for a past
 * task so the historical UI can tell the user whether what they are
 * looking at is the *whole* task or only the events that happened to be
 * recorded. Replaces the previous "force everything to done" hack which
 * silently lied when the log was truncated, the recorder dropped events,
 * or the task ran before the recorder existed.
 *
 * Pure function — input is the raw event list returned by the events API
 * (already curated against `event-manifest.ts`). Output is a small
 * descriptor consumed by `<ReplayCompletenessBanner>` and
 * `normalizeReplayedTurnForDisplay`.
 *
 * No backend round-trips here; classification is rule-based on event types.
 */

export type ReplayCompletenessKind =
  /** `task:complete` arrived and the reducer settled to `done`. */
  | 'complete'
  /** `task:timeout` or `worker:error` arrived; settled to `error`. */
  | 'terminal-error'
  /**
   * Log ended while still mid-flight — no terminal task event. The task
   * may have crashed without a final emission, the recorder may have
   * dropped events, or it may legitimately still be running on another
   * client (a race the historical view does not handle). UI shows an
   * "interrupted" banner; do NOT pretend the task finished.
   */
  | 'missing-terminal'
  /**
   * Log was paused on a workflow gate (approval / human-input / partial
   * decision) and never resumed in the persisted log. Distinct from
   * `missing-terminal` because the executor was *waiting on the user*
   * when the recording stopped, not running.
   */
  | 'awaiting-user'
  /** No events at all. Recorder unwired, or task is too old. */
  | 'empty'
  /** Backend reports `404` (no event log). */
  | 'unsupported'
  /** Network or JSON error. */
  | 'error';

export interface ReplayCompleteness {
  kind: ReplayCompletenessKind;
  eventCount: number;
  /** ms epoch of the first event in the log, when present. */
  firstTs?: number;
  /** ms epoch of the last event. Mirrors `firstTs`. */
  lastTs?: number;
  /** Event type that landed the task into a terminal state, when one did. */
  terminalEventType?: string;
}

interface CompletenessInputEvent {
  eventType: string;
  ts: number;
  payload?: Record<string, unknown>;
}

/**
 * Event types that close the lifecycle. `task:complete` is the happy path;
 * `task:timeout` and `worker:error` are honest terminal failures.
 *
 * `workflow:plan_rejected` also closes the lifecycle when followed by a
 * `task:complete` (the executor emits both), but on its own it is just a
 * gate event — we still wait for `task:complete` / `task:timeout` to
 * declare the task itself terminated.
 */
const TERMINAL_EVENTS: ReadonlySet<string> = new Set([
  'task:complete',
  'task:timeout',
  'worker:error',
]);

/**
 * Workflow gate events. If the log's most recent event is one of these and
 * no matching `*_provided` / `*_approved` / `*_rejected` follow-up
 * arrived, the recording stopped while waiting for user input.
 *
 * Pairing rule: `_needed` is matched by `_provided`; `plan_ready` (with
 * `awaitingApproval=true`) is matched by `plan_approved` or
 * `plan_rejected`.
 */
const GATE_OPEN_EVENTS: ReadonlySet<string> = new Set([
  'workflow:plan_ready',
  'workflow:human_input_needed',
  'workflow:partial_failure_decision_needed',
]);

const GATE_CLOSE_EVENTS: ReadonlySet<string> = new Set([
  'workflow:plan_approved',
  'workflow:plan_rejected',
  'workflow:human_input_provided',
  'workflow:partial_failure_decision_provided',
]);

/**
 * Classify a persisted event log. Pure: returns the same descriptor for
 * the same input.
 *
 * Special inputs:
 *   - `events.length === 0` and no error → `empty`
 *   - caller passes `unsupported: true` → `unsupported` (404 from API)
 *   - caller passes `error: true` → `error`
 */
export function replayCompleteness(
  events: ReadonlyArray<CompletenessInputEvent>,
  opts: { unsupported?: boolean; error?: boolean } = {},
): ReplayCompleteness {
  if (opts.error) return { kind: 'error', eventCount: 0 };
  if (opts.unsupported) return { kind: 'unsupported', eventCount: 0 };
  if (events.length === 0) return { kind: 'empty', eventCount: 0 };

  const firstTs = events[0]!.ts;
  const lastTs = events[events.length - 1]!.ts;

  // Pass over the whole log — the most recent terminal event wins (a task
  // that timed out then was retried will have the retry's terminal event
  // last). For gate detection we track open/close pairs in chronological
  // order; the gate is "open at end" only if more opens than closes.
  let terminalEventType: string | undefined;
  let gateDepth = 0;
  for (const ev of events) {
    if (TERMINAL_EVENTS.has(ev.eventType)) {
      terminalEventType = ev.eventType;
      gateDepth = 0; // a terminal event always closes any open gate
      continue;
    }
    if (GATE_OPEN_EVENTS.has(ev.eventType)) {
      // `workflow:plan_ready` only opens an approval gate when the
      // payload sets `awaitingApproval=true`. Without that, plan_ready
      // is just a "plan finalized" announcement and the workflow runs
      // without pause — a missing terminal in that case is genuinely a
      // missing-terminal, not awaiting-user.
      if (ev.eventType === 'workflow:plan_ready') {
        const awaiting = ev.payload?.awaitingApproval;
        if (awaiting === true) gateDepth += 1;
      } else {
        gateDepth += 1;
      }
      continue;
    }
    if (GATE_CLOSE_EVENTS.has(ev.eventType)) {
      gateDepth = Math.max(0, gateDepth - 1);
    }
  }

  if (terminalEventType === 'task:complete') {
    return { kind: 'complete', eventCount: events.length, firstTs, lastTs, terminalEventType };
  }
  if (terminalEventType) {
    return {
      kind: 'terminal-error',
      eventCount: events.length,
      firstTs,
      lastTs,
      terminalEventType,
    };
  }
  if (gateDepth > 0) {
    return { kind: 'awaiting-user', eventCount: events.length, firstTs, lastTs };
  }
  return { kind: 'missing-terminal', eventCount: events.length, firstTs, lastTs };
}

/**
 * Honest replacement for the old "force everything to done" logic in
 * `HistoricalProcessCard`. Specifically does NOT mutate the reducer-derived
 * status or sweep plan steps to done — that lied when the persisted log
 * was incomplete. The reducer already swept on `task:complete` if the
 * event was persisted; if it was not, the truth is "log ended mid-flight"
 * and the UI shows that via {@link ReplayCompleteness}.
 *
 * Currently a near-identity. Kept as a typed seam so future per-completeness
 * adjustments (e.g. fading out steps that have no events) can land in one
 * place without spreading conditionals through the surfaces.
 */
export function normalizeReplayedTurnForDisplay<T>(turn: T, _completeness: ReplayCompleteness): T {
  return turn;
}
