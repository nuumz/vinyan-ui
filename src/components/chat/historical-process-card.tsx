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
import type { TaskProcessGates } from '@/lib/api-client';
import type { ActionableGateName } from './interrupt-banner';
import { ReplayCompletenessBanner } from './replay-completeness-banner';
import { TurnProcessSurfaces } from './turn-process-surfaces';

/**
 * Pure helper — derive the set of gates the user can still act on from
 * the backend projection. A gate is actionable when it is currently
 * open AND has not yet been resolved (decision recorded server-side).
 *
 * This keeps the historical card's "frozen replay" framing in place
 * for everything BUT the still-open gate, where we override readOnly
 * so the user can approve / reject / answer / decide directly from the
 * /tasks drawer Process tab. Without this, an open gate viewed via the
 * task drawer reports "Read-only — no decision recorded" with no way
 * to act, forcing a context switch to the chat surface to take action.
 */
export function deriveActionableGates(
  gates: TaskProcessGates | null | undefined,
): ReadonlySet<ActionableGateName> {
  const set = new Set<ActionableGateName>();
  if (!gates) return set;
  if (gates.approval?.open && !gates.approval.resolved) set.add('approval');
  if (gates.workflowHumanInput?.open && !gates.workflowHumanInput.resolved) set.add('humanInput');
  if (gates.partialDecision?.open && !gates.partialDecision.resolved) set.add('partialDecision');
  return set;
}

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

  // Re-enable action affordances per gate when the backend says the
  // gate is still open. Prevents the historical card from showing a
  // dead "Read-only — no decision recorded" frame on a task that's
  // actually waiting for the user's approve / reject / answer.
  //
  // Gated on a known `sessionId` because the workflow approval /
  // human-input mutations route through `/sessions/:sid/...`. Without
  // a real sessionId from the projection we would POST to a bogus
  // route — better to fall back to read-only than fire a 404.
  const projectionSessionId = projection.data?.lifecycle?.sessionId;
  const actionableGates = useMemo(
    () => (projectionSessionId ? deriveActionableGates(projection.data?.gates) : new Set<never>()),
    [projection.data?.gates, projectionSessionId],
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
          sessionId={projectionSessionId ?? displayTurn.taskId}
          nowMs={nowMs}
          actionableGates={actionableGates}
        />
      </div>
    </CardShell>
  );
}
