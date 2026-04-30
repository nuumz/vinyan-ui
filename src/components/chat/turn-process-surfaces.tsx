/**
 * Shared composition of the per-turn process surfaces.
 *
 * Both `<StreamingBubble>` (live) and `<HistoricalProcessCard>` (replay)
 * render this single component so the two views stay in lock-step. Each
 * sub-surface is null-friendly — non-workflow turns render as nothing
 * more than the header + final answer, the same compact shape we want.
 *
 * The `mode` prop drives interactive vs read-only behaviour. Live mode
 * threads the session id, "now" tick, and retry callback into the
 * mutation-bearing children. Historical mode forces every gate / error /
 * input card into a read-only snapshot so the past is rendered honestly,
 * not as a fake "approved on timeout" timeline.
 *
 * No fetching, no derivation — the caller must already have a fully
 * reduced `StreamingTurn`. Fetching/replay decoding lives in
 * `useTaskEvents` + `replayProcessLog`.
 */
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { AgentTimelineCard } from './agent-timeline-card';
import { CodingCliCard } from './coding-cli-card';
import { DiagnosticsDrawer } from './diagnostics-drawer';
import { FinalAnswer } from './final-answer';
import { InterruptBanner } from './interrupt-banner';
import { PartialDecisionCard } from './partial-decision-card';
import { PlanSurface } from './plan-surface';
import { ProcessTimeline } from './process-timeline';
import { StageManifestSurface } from './stage-manifest-surface';
import { TurnHeader } from './turn-header';

export type TurnProcessMode = 'live' | 'historical';

interface TurnProcessSurfacesProps {
  turn: StreamingTurn;
  mode: TurnProcessMode;
  /**
   * Live mode: the owning session id; the approval / human-input cards
   * POST decisions through it. Historical mode: still required by the
   * card props for consistency, but the cards never fire mutations
   * because `readOnly` is true.
   */
  sessionId: string;
  /** Wall-clock tick used by the header + partial-decision countdown. */
  nowMs: number;
  /** Live mode only — passed to InterruptBanner for retry on errored turns. */
  onRetry?: () => void;
  /**
   * Historical mode hint — start the stage manifest disclosed so the past
   * task's plan is visible without an extra click. Live mode keeps it
   * collapsed by default to avoid pushing the live work down the bubble.
   */
  defaultExpandStage?: boolean;
}

/**
 * Single source-of-truth for surface composition. Order matches the live
 * bubble's existing layout — re-ordering here would change the live
 * surface, which we explicitly do not want for this refactor.
 */
export function TurnProcessSurfaces({
  turn,
  mode,
  sessionId,
  nowMs,
  onRetry,
  defaultExpandStage = false,
}: TurnProcessSurfacesProps) {
  const readOnly = mode === 'historical';
  const showPartialDecision =
    !!turn.pendingPartialDecision && (readOnly || turn.status === 'awaiting-human-input');

  return (
    <>
      <TurnHeader turn={turn} nowMs={nowMs} />
      <InterruptBanner
        turn={turn}
        sessionId={sessionId}
        onRetry={readOnly ? undefined : onRetry}
        readOnly={readOnly}
      />
      {showPartialDecision && (
        <PartialDecisionCard
          sessionId={sessionId}
          pending={turn.pendingPartialDecision!}
          planSteps={turn.planSteps}
          nowMs={nowMs}
          readOnly={readOnly}
        />
      )}
      <StageManifestSurface turn={turn} defaultExpanded={defaultExpandStage} />
      <AgentTimelineCard
        steps={turn.planSteps}
        toolCalls={turn.toolCalls}
        isLive={!readOnly && turn.status === 'running'}
        nowMs={nowMs}
        subtasks={turn.multiAgentSubtasks}
        showExpandAll={readOnly}
      />
      <CodingCliCard turn={turn} />
      <PlanSurface turn={turn} />
      <ProcessTimeline turn={turn} />
      <FinalAnswer turn={turn} />
      <DiagnosticsDrawer turn={turn} />
    </>
  );
}
