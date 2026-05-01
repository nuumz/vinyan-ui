/**
 * Historical process card — past-task counterpart of the live
 * `StreamingBubble` debug surfaces.
 *
 * Lazy-loads the persisted bus event log for `taskId` via `useTaskEvents`,
 * replays it through the same `reduceTurn` reducer the live stream uses,
 * and renders the result through `<TurnProcessSurfaces mode="historical">`
 * so live and replay views stay in lock-step.
 *
 * Replay completeness — the previous version forced every running /
 * awaiting-* turn into `done` and swept pending plan steps to done as a
 * "belt-and-brace". That silently lied for tasks whose terminal event
 * never landed in the persisted log (recorder dropouts, manifest drift,
 * tasks that ran before a recorded event was added). We now classify the
 * log via `replayCompleteness` and render an honest banner instead.
 *
 * Returns null when the backend reports no recorder is wired
 * (`unsupported`) so the message bubble degrades gracefully.
 */
import { useMemo } from 'react';
import { useTaskEvents } from '@/hooks/use-task-events';
import { useTaskProcessState } from '@/hooks/use-task-process-state';
import {
  normalizeReplayedTurnForDisplay,
  selectAuthoritativeCompleteness,
} from '@/lib/replay-completeness';
import { ReplayCompletenessBanner } from './replay-completeness-banner';
import { TurnProcessSurfaces } from './turn-process-surfaces';

interface HistoricalProcessCardProps {
  taskId: string;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg/15 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
          Process replay
        </span>
        <span className="text-[10px] text-text-dim/70">persisted</span>
      </div>
      {children}
    </div>
  );
}

export function HistoricalProcessCard({ taskId }: HistoricalProcessCardProps) {
  const { turn, events, isLoading, error, unsupported } = useTaskEvents(taskId, { enabled: true });
  // Backend-authoritative process projection. The projection is the
  // single source of truth for completeness — when it lands we drop
  // the local classifier and render the backend's verdict. The local
  // classifier remains as a fallback for the brief window before the
  // projection arrives, and for environments that 404 the new endpoint
  // (older agents not yet redeployed).
  const projection = useTaskProcessState(taskId, { enabled: true });

  // Classify the persisted log honestly. Backend projection wins; the
  // local classifier is a fallback only. The selector is pure — see
  // `tests/lib/replay-completeness-adapter.test.ts` for the
  // projection-priority contract.
  const completeness = useMemo(
    () =>
      selectAuthoritativeCompleteness(projection.data, {
        events: events ?? [],
        unsupported,
        error: !!error && !unsupported,
      }),
    [projection.data, events, unsupported, error],
  );

  if (isLoading) {
    return (
      <CardShell>
        <div className="text-[11px] text-text-dim italic">Loading process…</div>
      </CardShell>
    );
  }

  // Non-rendering states: surface the banner, no surfaces.
  if (!turn || completeness.kind === 'empty' || completeness.kind === 'unsupported' || completeness.kind === 'error') {
    return (
      <CardShell>
        <ReplayCompletenessBanner
          completeness={completeness}
          taskId={taskId}
          detail={error ? String((error as Error)?.message ?? error) : undefined}
        />
      </CardShell>
    );
  }

  const displayTurn = normalizeReplayedTurnForDisplay(turn, completeness);

  // Pin "now" to the last event time so the header's elapsed counter shows
  // the wall-clock the task actually ran for, not a count from epoch to
  // present-day. The current-stage spinner / live-pulse classes are gated
  // by `mode='historical'` (readOnly) so no element ticks against this.
  const nowMs = completeness.lastTs ?? Date.now();

  return (
    <CardShell>
      <div className="flex flex-col gap-3">
        <ReplayCompletenessBanner completeness={completeness} taskId={taskId} />
        <TurnProcessSurfaces
          turn={displayTurn}
          mode="historical"
          sessionId={displayTurn.taskId}
          nowMs={nowMs}
          defaultExpandStage
        />
      </div>
    </CardShell>
  );
}
