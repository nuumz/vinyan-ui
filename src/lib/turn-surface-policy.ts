/**
 * Turn surface render policy — single source-of-truth for "what surfaces
 * does this turn render, and which one of them owns each piece of content".
 *
 * Why this exists: live and historical bubbles share `<TurnProcessSurfaces>`
 * but each surface had its own ad-hoc null-check + de-dup logic ("only show
 * if X", "drop chip if Y"). That worked while the bubble had four panels;
 * adding StageManifest + CodingCli pushed it past readable, and the user
 * flagged visible duplication in multi-agent replays (per-agent answer in
 * AgentTimelineCard AND in PlanSurface AND in FinalAnswer).
 *
 * The policy assigns one canonical owner per information type and lets the
 * other surfaces degrade to references / no-ops:
 *
 *   | Information type            | Owner                     | Others           |
 *   |-----------------------------|---------------------------|------------------|
 *   | post-prompt decision        | StageManifestSurface (non-delegate) / AgentTimelineCard (delegate) | StageManifest is suppressed when delegate rows exist; decision meta (group mode, rationale, routing, confidence) folds into the timeline header instead |
 *   | multi-agent execution       | AgentTimelineCard         | PlanSurface chip suppressed; delegate rows non-expandable |
 *   | linear plan checklist       | PlanSurface               | StageManifest does not list steps |
 *   | final synthesized answer    | FinalAnswer               | (none)           |
 *   | orchestration audit log     | ProcessTimeline           | collapsed by default when delegate timeline above |
 *   | low-level diagnostics       | DiagnosticsDrawer         | collapsed always |
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
  | 'stageManifest'
  | 'agentTimeline'
  | 'planSurface'
  | 'processTimeline'
  | 'diagnostics';

export interface TurnSurfaceRenderPolicy {
  showStageManifest: boolean;
  showAgentTimeline: boolean;
  showPlanSurface: boolean;
  showCodingCli: boolean;
  showFinalAnswer: boolean;
  showProcessTimeline: boolean;
  showDiagnostics: boolean;
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
   * True when AgentTimelineCard also owns the post-prompt decision metadata
   * (group-mode chip, decision rationale, routing level, confidence). Set
   * whenever AgentTimelineCard renders — the StageManifestSurface card is
   * suppressed in delegate flows because its header (decision label, group
   * chip, done/total) duplicates AgentTimelineCard's own header, and the
   * remaining metadata folds into AgentTimelineCard inline. Non-delegate
   * flows (single-agent, direct-tool, todoList-alone, full-pipeline) keep
   * StageManifestSurface as the canonical owner.
   */
  agentTimelineOwnsDecisionMeta: boolean;
  /**
   * Sections to render expanded by default. Live mode keeps everything
   * collapsed (the live header carries the action; surfaces unfurl on
   * demand). Historical mode opens the StageManifest so a past task's
   * decision context is visible without an extra click.
   */
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

  const defaultOpenSections =
    mode === 'historical'
      ? new Set<TurnSurfaceSection>(hasDecisionContext ? ['stageManifest'] : [])
      : EMPTY_SET;

  return {
    showStageManifest: hasDecisionContext && !hasDelegateRows,
    showAgentTimeline: hasDelegateRows,
    showPlanSurface: hasPlan,
    showCodingCli: hasCodingCli,
    showFinalAnswer: hasFinalAnswer,
    showProcessTimeline: hasProcessLog,
    showDiagnostics: hasDiagnostics,
    suppressDelegateOutputsInPlan,
    agentTimelineOwnsDecisionMeta: hasDelegateRows,
    defaultOpenSections,
  };
}
