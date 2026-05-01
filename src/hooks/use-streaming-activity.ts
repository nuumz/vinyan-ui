import { useEffect, useRef, useState } from 'react';
import type { StreamingStatus } from './use-streaming-turn';

const DEFAULT_IDLE_MS = 600;

/**
 * Activity snapshot for the streaming caret. `active` is what the caret
 * tracks; `prevLen` is the baseline used to detect content deltas across
 * renders / events. Exported for tests and for callers that want to
 * derive activity outside of a React component (e.g. during a worker
 * scenario that consumes the same reducer state).
 */
export interface StreamingActivitySnapshot {
  active: boolean;
  prevLen: number;
}

export type StreamingActivityAction = 'none' | 'activate' | 'deactivate';

export const initialStreamingActivity: StreamingActivitySnapshot = {
  active: false,
  prevLen: 0,
};

/**
 * Pure transition function for the streaming caret state. Splits cleanly
 * from the React hook so the rules (delta detection, terminal-status
 * collapse, baseline reset on shrink) are unit-testable without rendering
 * components or scheduling timers.
 *
 * Returns the next snapshot together with an `action` describing what the
 * caller (the hook) should do:
 *   - `activate`   — flip caret on and (re)start the idle-fade timer
 *   - `deactivate` — flip caret off immediately and clear any pending timer
 *   - `none`       — leave UI state alone; only the snapshot changed
 */
export function evaluateStreamingActivity(
  prev: StreamingActivitySnapshot,
  content: string,
  status: StreamingStatus,
): { snapshot: StreamingActivitySnapshot; action: StreamingActivityAction } {
  if (status !== 'running') {
    // Terminal / gated status — caret stops, baseline is reset to whatever
    // the final content is so a subsequent re-run starts from a clean
    // delta calculation.
    return {
      snapshot: { active: false, prevLen: content.length },
      action: prev.active ? 'deactivate' : 'none',
    };
  }

  const len = content.length;
  if (len > prev.prevLen) {
    return {
      snapshot: { active: true, prevLen: len },
      action: 'activate',
    };
  }
  if (len < prev.prevLen) {
    // Reducer can rewrite finalContent (e.g. `task:complete` overwrites the
    // accumulated stream with `result.content`). Treat the shrink as a
    // baseline reset, not as activity — we don't want the caret to flash
    // on settle.
    return {
      snapshot: { active: prev.active, prevLen: len },
      action: 'none',
    };
  }
  return { snapshot: prev, action: 'none' };
}

/**
 * Returns true while the assistant's text is *actually* streaming — i.e.
 * `content` length grew within the last `idleMs` milliseconds AND status is
 * still `running`. Returns false during planning / tool-call / verification
 * phases (status is `running`, no character is being produced), once the
 * stream settles, or once the turn reaches a terminal status.
 *
 * The previous cursor implementation flashed whenever `status === 'running'`,
 * which pulsed the caret for the entire turn including silent multi-second
 * tool runs. This hook is content-driven instead: caret blinks iff text
 * actually changed recently.
 */
export function useStreamingActivity(
  content: string,
  status: StreamingStatus,
  idleMs: number = DEFAULT_IDLE_MS,
): boolean {
  const [active, setActive] = useState(false);
  const snapshotRef = useRef<StreamingActivitySnapshot>({
    active: false,
    prevLen: content.length,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single mount/unmount cleanup — clears any pending fade timer so the
  // component does not setState after teardown.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const { snapshot, action } = evaluateStreamingActivity(
      snapshotRef.current,
      content,
      status,
    );
    snapshotRef.current = snapshot;

    if (action === 'activate') {
      setActive(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setActive(false);
        snapshotRef.current = { ...snapshotRef.current, active: false };
        timerRef.current = null;
      }, idleMs);
    } else if (action === 'deactivate') {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setActive(false);
    }
  }, [content, status, idleMs]);

  return active;
}
