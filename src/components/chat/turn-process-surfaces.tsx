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
import { useAuditProjection } from '@/hooks/use-audit-projection';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { buildTurnSurfaceRenderPolicy, type TurnSurfaceMode } from '@/lib/turn-surface-policy';
import { AgentRosterCard } from './agent-roster-card';
import { AuditView } from './audit-view';
import { CodingCliCard } from './coding-cli-card';
import { DiagnosticsDrawer } from './diagnostics-drawer';
import { FinalAnswer } from './final-answer';
import { InterruptBanner, type ActionableGateName } from './interrupt-banner';
import { PartialDecisionCard } from './partial-decision-card';
import { PlanSurface } from './plan-surface';
import { TimelineHistory } from './timeline-history';
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
   * Historical mode override — gates the backend projection reports as
   * still open (`gate.open && !gate.resolved`). Forwarded to
   * `InterruptBanner` and `PartialDecisionCard` so the corresponding
   * action affordances stay enabled while the rest of the surface
   * remains in historical (read-only) styling. Empty / undefined =
   * pure historical replay, no live actions.
   */
  actionableGates?: ReadonlySet<ActionableGateName>;
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
  actionableGates,
}: TurnProcessSurfacesProps) {
  const readOnly = mode === 'historical';
  const policy = useMemo(() => buildTurnSurfaceRenderPolicy(turn, mode), [turn, mode]);
  const showPartialDecision =
    !!turn.pendingPartialDecision && (readOnly || turn.status === 'awaiting-human-input');
  const partialDecisionReadOnly = readOnly && !(actionableGates?.has('partialDecision') ?? false);

  return (
    <>
      <TurnHeader turn={turn} nowMs={nowMs} />
      <div id="interrupt-banner">
        <InterruptBanner
          turn={turn}
          sessionId={sessionId}
          onRetry={readOnly ? undefined : onRetry}
          readOnly={readOnly}
          actionableGates={actionableGates}
        />
      </div>
      {showPartialDecision && (
        <PartialDecisionCard
          sessionId={sessionId}
          pending={turn.pendingPartialDecision!}
          planSteps={turn.planSteps}
          nowMs={nowMs}
          readOnly={partialDecisionReadOnly}
        />
      )}
      {policy.showAgentTimeline && (
        <div id="agentroster">
          <AgentRosterCard
          steps={turn.planSteps}
          toolCalls={turn.toolCalls}
          isLive={!readOnly && turn.status === 'running'}
          nowMs={nowMs}
          subtasks={turn.multiAgentSubtasks}
          collaborationRounds={turn.collaborationRounds}
          groupMode={turn.multiAgentGroupMode}
          winnerAgentId={turn.winnerAgentId}
          winnerReasoning={turn.winnerReasoning}
          decisionRationale={turn.decisionStage?.decisionRationale}
          routingLevel={turn.decisionStage?.routingLevel}
          confidence={turn.decisionStage?.confidence}
          parentTaskId={readOnly ? undefined : turn.taskId}
        />
        </div>
      )}
      {policy.showCodingCli && <CodingCliCard turn={turn} />}
      {policy.showPlanSurface && (
        <div id="plancard">
          <PlanSurface
            turn={turn}
            suppressDelegateOutputs={policy.suppressDelegateOutputsInPlan}
          />
        </div>
      )}
      {policy.showTimelineHistory && <TimelineHistory turn={turn} mode={mode} nowMs={nowMs} />}
      {policy.showAuditView && <AuditViewMount taskId={turn.taskId} mode={mode} />}
      {policy.showFinalAnswer && <FinalAnswer turn={turn} />}
      {policy.showDiagnostics && <DiagnosticsDrawer turn={turn} />}
    </>
  );
}

/**
 * Mount adapter — `AuditView` consumes the projection's audit log, but
 * `TurnProcessSurfaces` is rendered with a `StreamingTurn`. Mount the
 * hook here so historical and live both fetch the same shape from
 * `/process-state`. The hook polls in live mode (audit:entry is record-
 * only by manifest design — see plan PR-2 D1) and is static in
 * historical mode.
 */
function AuditViewMount({ taskId, mode }: { taskId: string; mode: TurnProcessMode }) {
  const live = mode === 'live';
  const audit = useAuditProjection(
    { kind: 'task', taskId },
    {
      enabled: true,
      staleTimeMs: live ? 5_000 : 5 * 60_000,
      refetchIntervalMs: live ? 7_000 : false,
    },
  );
  if (!audit.hasAuditData) return null;
  return (
    <AuditView
      auditLog={audit.auditLog}
      completenessBySection={audit.completenessBySection}
      provenance={audit.provenance}
      byEntity={audit.byEntity}
    />
  );
}
