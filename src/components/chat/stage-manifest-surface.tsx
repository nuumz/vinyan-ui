/**
 * Stage manifest surface — compact "decision context" card derived from
 * the durable backend stage manifest (workflow:decision_recorded,
 * workflow:todo_created/_updated). Surfaces what Vinyan decided to do
 * and which group mode (multi-agent / competition / debate / comparison)
 * the workflow runs in — read-only and complementary to PlanSurface.
 *
 * What this surface OWNS (uniquely):
 *   - decisionKind label (Multi-agent workflow, Single-agent workflow, …)
 *   - multiAgentGroupMode chip (Competition / Debate / Comparison / …)
 *   - decisionRationale (planner's rewritten goal, when set)
 *   - routingLevel + confidence + bucket counts
 *
 * What this surface explicitly does NOT render:
 *   - The list of plan steps. PlanSurface is the single source of truth
 *     for step-by-step display (durations, agent badges, per-step output
 *     drilldown). Rendering a parallel numbered list here was visible
 *     duplication that the user flagged on the historical replay view.
 *
 * Returns null for non-workflow turns (no decisionStage, no todos), so
 * conversational replies stay clean.
 */
import { memo, useState } from 'react';
import {
  Brain,
  ChevronRight,
  ListChecks,
} from 'lucide-react';
import type {
  MultiAgentGroupMode,
  StreamingTurn,
  WorkflowDecisionKind,
  WorkflowTodoItemView,
} from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

interface StageManifestSurfaceProps {
  turn: StreamingTurn;
  /**
   * Open the metadata panel (rationale + routing + conf + counts) by
   * default. Historical mode flips this on so users see the decision
   * context without an extra click; live mode keeps it collapsed to
   * preserve the live bubble's compact shape.
   */
  defaultExpanded?: boolean;
}

const DECISION_LABEL: Record<WorkflowDecisionKind, string> = {
  conversational: 'Conversational reply',
  'direct-tool': 'Direct tool call',
  'single-agent': 'Single-agent workflow',
  'multi-agent': 'Multi-agent workflow',
  'human-input-required': 'Human input required',
  'approval-required': 'Approval required',
  'full-pipeline': 'Full pipeline (code mutation)',
  unknown: 'Unknown decision',
};

const GROUP_MODE_LABEL: Record<MultiAgentGroupMode, string> = {
  parallel: 'Parallel',
  competition: 'Competition',
  debate: 'Debate',
  comparison: 'Comparison',
  pipeline: 'Pipeline',
};

function summarizeTodos(todos: ReadonlyArray<WorkflowTodoItemView>) {
  // We only surface `done/total` in the header and `failed`/`skipped`
  // hints in the expanded panel — `running`/`pending` are visible on
  // PlanSurface step icons, so duplicating them here was visible noise.
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of todos) {
    switch (t.status) {
      case 'done':
        done++;
        break;
      case 'failed':
        failed++;
        break;
      case 'skipped':
        skipped++;
        break;
    }
  }
  return { done, failed, skipped, total: todos.length };
}

function StageManifestSurfaceImpl({ turn, defaultExpanded = false }: StageManifestSurfaceProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const decision = turn.decisionStage;
  const todos = turn.todoList;
  const groupMode = turn.multiAgentGroupMode;

  // Show nothing for non-workflow turns. The bubble keeps its existing
  // composition without an empty stage card.
  if (!decision && todos.length === 0) return null;

  const counts = summarizeTodos(todos);
  const decisionKind = decision?.decisionKind ?? 'unknown';
  const decisionLabel = DECISION_LABEL[decisionKind] ?? DECISION_LABEL.unknown;

  // Only failure / skip buckets remain — they highlight degraded outcomes
  // that PlanSurface's status icons already indicate but the user might
  // miss at a glance. Done counts are summarized by the header `done/total`
  // ratio and are not repeated here.
  const degradationBits: string[] = [];
  if (counts.failed > 0) degradationBits.push(`${counts.failed} failed`);
  if (counts.skipped > 0) degradationBits.push(`${counts.skipped} skipped`);

  const hasExpandable =
    !!decision?.decisionRationale ||
    decision?.routingLevel !== undefined ||
    decision?.confidence !== undefined ||
    degradationBits.length > 0;

  return (
    <div className="rounded-md border border-border/40 bg-bg/15">
      <button
        type="button"
        onClick={() => hasExpandable && setExpanded((v) => !v)}
        disabled={!hasExpandable}
        aria-expanded={hasExpandable ? expanded : undefined}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-left',
          hasExpandable ? 'cursor-pointer hover:bg-bg/25' : 'cursor-default',
        )}
      >
        {hasExpandable ? (
          <ChevronRight
            size={11}
            className={cn(
              'shrink-0 text-text-dim transition-transform',
              expanded && 'rotate-90',
            )}
          />
        ) : (
          <span className="inline-block w-2.75 shrink-0" aria-hidden />
        )}
        <ListChecks size={12} className="shrink-0 text-text-dim/85" />
        <span className="flex-1 min-w-0 truncate text-[11.5px] text-text/90">
          <span className="font-medium">{decisionLabel}</span>
          {groupMode && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-accent">
              {GROUP_MODE_LABEL[groupMode]}
            </span>
          )}
        </span>
        {counts.total > 0 && (
          <span
            className="shrink-0 text-[10px] font-mono tabular-nums text-text-dim"
            title="Done out of total"
          >
            {counts.done}/{counts.total}
          </span>
        )}
      </button>

      {hasExpandable && expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {decision?.decisionRationale && (
            <div className="flex items-start gap-2 text-[11px] text-text-dim">
              <Brain size={11} className="shrink-0 mt-0.5 opacity-70" />
              <span className="wrap-break-word">{decision.decisionRationale}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-text-dim font-mono tabular-nums">
            {decision?.routingLevel !== undefined && (
              <span title="Routing level">L{decision.routingLevel}</span>
            )}
            {decision?.confidence !== undefined && (
              <span title="Confidence">conf {(decision.confidence * 100).toFixed(0)}%</span>
            )}
            {degradationBits.length > 0 && (
              <span className="text-yellow/85">{degradationBits.join(' · ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const StageManifestSurface = memo(StageManifestSurfaceImpl);

// Export label maps for tests + external label rendering.
export { DECISION_LABEL, GROUP_MODE_LABEL };
