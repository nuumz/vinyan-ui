/**
 * Turn surface render policy — single source-of-truth for "what surfaces
 * does this turn render, and which one of them owns each piece of content".
 *
 * Each information type has exactly one canonical owner:
 *
 *   | Information type            | Owner                                   |
 *   |-----------------------------|-----------------------------------------|
 *   | post-prompt decision        | TaskCard (non-delegate) / AgentRosterCard header (delegate) |
 *   | multi-agent execution       | AgentRosterCard                         |
 *   | linear plan checklist       | PlanSurface                             |
 *   | final synthesized answer    | FinalAnswer (live) / MessageBubble (historical) |
 *   | chronological audit feed    | TimelineHistory                         |
 *   | low-level diagnostics       | DiagnosticsDrawer                       |
 *
 * Pure function. No React, no hooks. The policy depends only on the reduced
 * `StreamingTurn` and the rendering mode — same input → same output.
 */
import type { StreamingTurn } from '@/hooks/use-streaming-turn';

export type TurnSurfaceMode = 'live' | 'historical';

/**
 * Section identifiers the UI uses to thread "start expanded" hints through
 * the policy without hard-coding individual `defaultExpanded` props.
 */
export type TurnSurfaceSection =
  | 'agentTimeline'
  | 'planSurface'
  | 'timelineHistory'
  | 'diagnostics';

export interface TurnSurfaceRenderPolicy {
  showAgentTimeline: boolean;
  showPlanSurface: boolean;
  showCodingCli: boolean;
  showFinalAnswer: boolean;
  /**
   * Unified chronological timeline (TimelineHistory). Replaces the legacy
   * `showProcessTimeline` from Slice 2 onwards; Phase B (Slice 3) folds in
   * the StageManifestSurface decision row, plan-step transitions, tool
   * lifecycle, sub-agent spawn/return, gate events, and oracle/critic
   * verdicts.
   */
  showTimelineHistory: boolean;
  showDiagnostics: boolean;
  /**
   * A8 audit surface — single-screen four-tab review (Reasoning / Tool
   * calls / Decisions / Trace). Drives the rendering of `<AuditView>`
   * inside `TurnProcessSurfaces`. The view itself is a no-op when its
   * audit log is empty, so the policy can default to true once the
   * projection is wired and let the component decide whether to render
   * anything visible.
   */
  showAuditView: boolean;
  /**
   * True when AgentTimelineCard owns the per-delegate detail (expanded
   * drawer with tools + manifest + final answer disclosure). PlanSurface
   * uses this to suppress the delegate chip AND to render delegate rows as
   * non-expandable so the same tool list / output isn't shown in two
   * places. False for single-agent or non-workflow turns where PlanSurface
   * is the only place that view exists.
   */
  suppressDelegateOutputsInPlan: boolean;
  /**
   * True when AgentRosterCard also owns the post-prompt decision metadata
   * (group-mode chip, decision rationale, routing level, confidence) for
   * the per-turn surface. Non-delegate flows surface the same metadata via
   * `TaskCard`'s current-turn strip.
   */
  agentTimelineOwnsDecisionMeta: boolean;
  /** Sections rendered expanded by default. */
  defaultOpenSections: ReadonlySet<TurnSurfaceSection>;
}

const EMPTY_SET: ReadonlySet<TurnSurfaceSection> = new Set();

/**
 * Build the render policy for a reduced turn. Designed to be called once
 * per render in `TurnProcessSurfaces` and threaded down to the children —
 * memoizing by `(turn, mode)` is the caller's responsibility (the policy
 * is small enough that re-creating it per render is cheaper than the
 * cache lookup for a 1-deep inline call).
 */
export function buildTurnSurfaceRenderPolicy(
  turn: StreamingTurn,
  mode: TurnSurfaceMode,
): TurnSurfaceRenderPolicy {
  const hasDecisionContext = !!turn.decisionStage || turn.todoList.length > 0;
  const hasDelegateRows = turn.planSteps.some(
    (s) => s.strategy === 'delegate-sub-agent',
  );
  const hasPlan = turn.planSteps.length >= 2 || turn.toolCalls.length > 0;
  const hasCodingCli = Object.keys(turn.codingCliSessions ?? {}).length > 0;
  const hasFinalAnswer = !!turn.finalContent && turn.finalContent.length > 0;
  const hasProcessLog = turn.processLog.length > 0;
  // DiagnosticsDrawer carries phase timings, oracle / critic verdicts,
  // reasoning fragments, and the global tool wall. Render it whenever any
  // of those streams produced anything — its summary line null-checks
  // emptiness and returns null itself for a totally quiet turn.
  const hasDiagnostics =
    turn.phaseTimings.length > 0 ||
    turn.oracleVerdicts.length > 0 ||
    turn.criticVerdicts.length > 0 ||
    turn.reasoning.length > 0 ||
    !!turn.thinking ||
    turn.toolCalls.length > 0;

  // The de-dup signal: AgentTimelineCard renders one row per delegate AND
  // already exposes its tool history + objective + final answer disclosure.
  // We only need to suppress in PlanSurface when the manifest has 2+ rows
  // (a single delegate keeps its output in PlanSurface so non-multi-agent
  // workflows don't lose their per-step expansion).
  const suppressDelegateOutputsInPlan =
    hasDelegateRows && turn.multiAgentSubtasks.length >= 2;

  const defaultOpenSections: ReadonlySet<TurnSurfaceSection> =
    mode === 'historical' && hasDecisionContext
      ? new Set<TurnSurfaceSection>(['timelineHistory'])
      : EMPTY_SET;

  // FinalAnswer is the live-mode home for the streaming markdown answer.
  // In historical mode the user-visible reply is already rendered by
  // `MessageBubble.content` *outside* of `TurnProcessSurfaces`, so emitting
  // FinalAnswer inside `HistoricalProcessCard` would duplicate the same
  // markdown twice in one bubble. Live mode has no MessageBubble for the
  // in-flight turn, so FinalAnswer remains the canonical owner there
  // (and carries the streaming caret).
  const showFinalAnswer = hasFinalAnswer && mode === 'live';

  // AuditView is data-driven — render the chrome whenever the surrounding
  // turn has any signal worth auditing (a tool call, a decision context,
  // or process-log activity) and let `<AuditView>` hide itself when its
  // own audit log is empty. Renders for both live and historical modes.
  const showAuditView = hasPlan || hasDecisionContext || hasProcessLog || hasDelegateRows;

  return {
    showAgentTimeline: hasDelegateRows,
    showPlanSurface: hasPlan,
    showCodingCli: hasCodingCli,
    showFinalAnswer,
    showTimelineHistory: hasProcessLog || hasDecisionContext,
    showDiagnostics: hasDiagnostics,
    showAuditView,
    suppressDelegateOutputsInPlan,
    agentTimelineOwnsDecisionMeta: hasDelegateRows,
    defaultOpenSections,
  };
}
