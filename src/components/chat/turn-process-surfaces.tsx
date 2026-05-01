/**
 * Shared composition of the per-turn process surfaces.
 *
 * Both `<StreamingBubble>` (live) and `<HistoricalProcessCard>` (replay)
 * render this single component so the two views stay in lock-step. Surface
 * visibility, default-open hints, and "who owns what" de-dup live in
 * `buildTurnSurfaceRenderPolicy` — this component only orchestrates the
 * order; the policy decides whether each one renders.
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
import { useMemo } from 'react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { buildTurnSurfaceRenderPolicy, type TurnSurfaceMode } from '@/lib/turn-surface-policy';
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

export type TurnProcessMode = TurnSurfaceMode;

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
   *
   * When set, forces stage manifest open even if the policy's default-open
   * set didn't include it (e.g. a caller wants the panel pre-expanded for
   * a debug drilldown). Leave undefined to defer to the policy.
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
  defaultExpandStage,
}: TurnProcessSurfacesProps) {
  const readOnly = mode === 'historical';
  const policy = useMemo(() => buildTurnSurfaceRenderPolicy(turn, mode), [turn, mode]);
  const showPartialDecision =
    !!turn.pendingPartialDecision && (readOnly || turn.status === 'awaiting-human-input');
  const stageOpen =
    defaultExpandStage ?? policy.defaultOpenSections.has('stageManifest');

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
      {policy.showStageManifest && (
        <StageManifestSurface turn={turn} defaultExpanded={stageOpen} />
      )}
      {policy.showAgentTimeline && (
        <AgentTimelineCard
          steps={turn.planSteps}
          toolCalls={turn.toolCalls}
          isLive={!readOnly && turn.status === 'running'}
          nowMs={nowMs}
          subtasks={turn.multiAgentSubtasks}
          groupMode={turn.multiAgentGroupMode}
          winnerAgentId={turn.winnerAgentId}
          winnerReasoning={turn.winnerReasoning}
          decisionRationale={turn.decisionStage?.decisionRationale}
          routingLevel={turn.decisionStage?.routingLevel}
          confidence={turn.decisionStage?.confidence}
        />
      )}
      {policy.showCodingCli && <CodingCliCard turn={turn} />}
      {policy.showPlanSurface && (
        <PlanSurface
          turn={turn}
          suppressDelegateOutputs={policy.suppressDelegateOutputsInPlan}
        />
      )}
      {policy.showProcessTimeline && <ProcessTimeline turn={turn} />}
      {policy.showFinalAnswer && <FinalAnswer turn={turn} />}
      {policy.showDiagnostics && <DiagnosticsDrawer turn={turn} />}
    </>
  );
}
