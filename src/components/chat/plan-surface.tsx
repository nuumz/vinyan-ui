import { memo, useCallback, useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleDot,
  CircleSlash,
  Loader2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  MultiAgentSubtaskView,
  PlanStep,
  StreamingTurn,
  ToolCall,
} from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { ToolCallCard } from './tool-call-card';

interface PlanSurfaceProps {
  turn: StreamingTurn;
  /**
   * When true, AgentTimelineCard above is rendering the per-delegate
   * detail (tool history + manifest panel + final-answer disclosure).
   * Plan rows for `delegate-sub-agent` steps then drop:
   *   - the duplicate per-row agent chip (already de-duped by step suppression)
   *   - the duplicate tool list inside the expanded drawer
   *   - the per-step output (which is empty for delegates anyway, but the
   *     row would still render an expandable affordance)
   *
   * Net effect: delegate rows render as compact one-liners in the linear
   * checklist; "where can I read what each agent did?" routes the eye to
   * AgentTimelineCard above, which is the canonical owner.
   */
  suppressDelegateOutputs?: boolean;
}

interface StatusGlyph {
  Icon: LucideIcon;
  tone: string;
  spin?: boolean;
  strike?: boolean;
}

function glyphFor(status: PlanStep['status']): StatusGlyph {
  switch (status) {
    case 'done':
      return { Icon: Check, tone: 'text-green' };
    case 'running':
      return { Icon: Loader2, tone: 'text-accent', spin: true };
    case 'failed':
      return { Icon: X, tone: 'text-red' };
    case 'skipped':
      return { Icon: CircleSlash, tone: 'text-text-dim', strike: true };
    default:
      return { Icon: CircleDot, tone: 'text-text-dim' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s - m * 60)}s`;
}

interface StepRowProps {
  step: PlanStep;
  index: number;
  tools: ToolCall[];
  output: string;
  defaultOpen: boolean;
  isStreaming: boolean;
  /**
   * True when AgentTimelineCard already shows this delegate's agent chip
   * and per-row duration above. We drop the chip + duration from the plan
   * row to avoid the visible duplication the user flagged on multi-agent
   * replays. Step number + label + status icon stay so the linear plan
   * structure is preserved.
   */
  suppressDelegateChip?: boolean;
  /**
   * Stage-manifest record for this step's delegate sub-agent (when this
   * step is a `delegate-sub-agent`). Lets the row prefix the label with
   * `[agentName]` so steps 2/3/4 in a multi-agent plan are no longer
   * indistinguishable copies of each other. Optional — undefined for
   * non-delegate steps and for legacy turns without manifest data.
   */
  subtask?: MultiAgentSubtaskView;
  /** Click-to-jump target → scroll the matching DelegateRow into view. */
  onJumpTo?: (stepId: string) => void;
}

/** Agent identity prefix used in the plan row. Prefers the registry-resolved
 * name, falls back to the agentId, then the deterministic fallback label.
 * Returns undefined when the step is not delegated to a sub-agent. */
function deriveAgentPrefix(
  step: PlanStep,
  subtask: MultiAgentSubtaskView | undefined,
): string | undefined {
  if (subtask?.agentName) return subtask.agentName;
  if (subtask?.agentId) return subtask.agentId;
  if (subtask?.fallbackLabel) return subtask.fallbackLabel;
  if (step.agentId) return step.agentId;
  return undefined;
}

function StepRow({
  step,
  index,
  tools,
  output,
  defaultOpen,
  isStreaming,
  suppressDelegateChip,
  subtask,
  onJumpTo,
}: StepRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { Icon, tone, spin, strike } = glyphFor(step.status);
  const hasTools = tools.length > 0;
  const hasOutput = output.length > 0;
  const isExpandable = hasTools || hasOutput;
  const isDelegate = step.strategy === 'delegate-sub-agent';
  // Delegate rows that the timeline owns are clickable for "jump to agent"
  // even when not expandable. Plain delegate rows still toggle on click
  // (current behavior). Non-delegate non-expandable rows stay inert.
  const isJumpable = isDelegate && !!onJumpTo;
  // Prefer subtask wall-clock when the step record is missing finishedAt
  // (delegate steps emit completion on the subtask, not always on the
  // parent step). This is what makes steps 2/3/4 finally show durations.
  const startedAt = step.startedAt ?? subtask?.startedAt;
  const finishedAt = step.finishedAt ?? subtask?.completedAt;
  const duration =
    startedAt != null && finishedAt != null
      ? formatDuration(finishedAt - startedAt)
      : null;
  const prefix = deriveAgentPrefix(step, subtask);
  // Done / pending steps line-clamp the label so long descriptions don't
  // bloat the plan box. The running step keeps its full label visible so
  // the user can read the work currently underway.
  const clampLabel = step.status !== 'running' && step.status !== 'failed';

  const handleClick = useCallback(() => {
    if (isJumpable) {
      onJumpTo?.(step.id);
      return;
    }
    if (isExpandable) setOpen((v) => !v);
  }, [isJumpable, isExpandable, onJumpTo, step.id]);

  return (
    <li className="space-y-1">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex w-full items-start gap-2 text-left text-xs leading-5',
          isExpandable || isJumpable ? 'cursor-pointer' : 'cursor-default',
        )}
        disabled={!isExpandable && !isJumpable}
        aria-expanded={isExpandable ? open : undefined}
        title={isJumpable ? 'Jump to this agent in the timeline above' : undefined}
      >
        {isExpandable ? (
          <ChevronRight
            size={11}
            className={cn(
              'mt-1 shrink-0 text-text-dim transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span className="mt-1 inline-block w-[11px] shrink-0" aria-hidden="true" />
        )}
        <Icon
          size={13}
          className={cn('mt-0.5 shrink-0', tone, spin && 'animate-spin')}
        />
        <span className="font-mono text-text-dim shrink-0 w-5 tabular-nums">{index + 1}.</span>
        <span
          className={cn(
            'min-w-0 flex-1',
            strike ? 'line-through text-text-dim' : 'text-text',
            step.status === 'running' && 'font-medium',
            clampLabel && 'line-clamp-1',
          )}
        >
          {prefix && (
            <span className="mr-1.5 font-medium text-text-dim">[{prefix}]</span>
          )}
          {step.label}
        </span>
        {step.agentId && !suppressDelegateChip && !prefix && (
          // Legacy chip path — kept for plans where the subtask manifest
          // never arrived (older turns). When `prefix` is set we already
          // surfaced the persona inline, so the chip would be redundant.
          <span
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/25 text-[10px] font-medium"
            title={`Sub-agent: ${step.agentId}`}
          >
            {step.agentId}
          </span>
        )}
        {duration && !suppressDelegateChip && (
          <span className="shrink-0 text-[10px] text-text-dim tabular-nums">{duration}</span>
        )}
        {!duration && hasTools && !suppressDelegateChip && (
          <span className="shrink-0 text-[10px] text-text-dim tabular-nums">
            {tools.length} tool{tools.length === 1 ? '' : 's'}
          </span>
        )}
      </button>
      {isExpandable && open && (
        <div className="ml-7 space-y-2 border-l border-border/60 pl-3">
          {hasOutput && (
            <div className="text-text/90">
              <Markdown content={output} />
              {isStreaming && (
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-accent align-middle" />
              )}
            </div>
          )}
          {hasTools && (
            <div className="space-y-1">
              {tools.map((t) => (
                <ToolCallCard key={t.id} tool={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Primary surface for an LLM agent turn: plan checklist with each step's
 * own LLM output and tool calls nested under it.
 *
 * - Multi-step plans (`planSteps.length >= 2`) render as a numbered checklist.
 *   The running step auto-expands to stream its output live; done steps
 *   collapse by default with line-clamped labels (one line each) so the box
 *   stays compact. Failed steps auto-expand so error context is visible.
 * - Single- or zero-step turns fall back to a flat tool list — quick chat
 *   Q&A doesn't pay for a plan checklist it doesn't need.
 *
 * Tool→step attribution comes from `tool.planStepId`, set by the reducer
 * at tool-start time. Per-step LLM output comes from `turn.stepOutputs`,
 * populated by routing `agent:text_delta` / `llm:stream_delta` deltas to
 * the currently-running step. Tools without a step (ad-hoc / non-workflow)
 * render in an "Other" group at the bottom.
 */
function PlanSurfaceImpl({ turn, suppressDelegateOutputs = false }: PlanSurfaceProps) {
  // Hooks must run unconditionally — the early-return below skips the rest
  // of the body, so anything using a hook MUST live above the gate.
  const handleJumpToSubtask = useCallback((stepId: string) => {
    const el = document.getElementById(`delegate-row-${stepId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Restart the flash by removing the class first (force reflow) then
    // re-adding. The stylesheet handles prefers-reduced-motion (no animation,
    // static outline instead).
    el.classList.remove('delegate-row-flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('delegate-row-flash');
    window.setTimeout(() => el.classList.remove('delegate-row-flash'), 1400);
  }, []);

  const hasPlan = turn.planSteps.length >= 2;
  const orphanTools = turn.toolCalls.filter((t) => !t.planStepId);

  if (!hasPlan) {
    if (turn.toolCalls.length === 0) return null;
    return (
      <div className="rounded-md border border-border/60 bg-bg/30 p-2.5 space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-text-dim font-medium">
          Tool activity
        </div>
        <div className="space-y-1">
          {turn.toolCalls.map((t) => (
            <ToolCallCard key={t.id} tool={t} />
          ))}
        </div>
      </div>
    );
  }

  const toolsByStep = new Map<string, ToolCall[]>();
  for (const tool of turn.toolCalls) {
    if (!tool.planStepId) continue;
    const list = toolsByStep.get(tool.planStepId) ?? [];
    list.push(tool);
    toolsByStep.set(tool.planStepId, list);
  }
  // O(1) lookup of subtask manifest by stepId. The plan and the manifest
  // share `stepId` as the join key — see stage-manifest.ts buildStageManifest.
  // If a step's subtask is missing (older turns / partial manifest), the
  // delegate row falls back to the legacy chip path.
  const subtasksByStepId = new Map<string, MultiAgentSubtaskView>();
  for (const s of turn.multiAgentSubtasks) {
    if (s.stepId) subtasksByStepId.set(s.stepId, s);
  }
  const isTurnStreaming = turn.status === 'running';
  const doneCount = turn.planSteps.filter((s) => s.status === 'done').length;
  // After end (replay/refresh) the user previously saw the last-running
  // step's output/tools while it streamed. Without preserving SOMETHING
  // open at end the historical card collapses every row, so the parity
  // with the live view breaks. Pick the step with the latest finishedAt
  // as the proxy for "what was streaming when the turn ended".
  const lastFinishedStepId = !isTurnStreaming
    ? turn.planSteps.reduce<{ id: string; ts: number } | null>((acc, s) => {
        const ts = s.finishedAt ?? 0;
        if (!acc || ts > acc.ts) return { id: s.id, ts };
        return acc;
      }, null)?.id
    : undefined;

  return (
    <div className="rounded-md bg-bg/20 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-text-dim font-medium">
        <span>Plan</span>
        <span className="font-mono normal-case tracking-normal">
          {doneCount}/{turn.planSteps.length}
        </span>
      </div>
      <ol className="space-y-1">
        {turn.planSteps.map((step, i) => {
          const isDelegate = step.strategy === 'delegate-sub-agent';
          // Two-tier suppression for delegate rows in multi-agent plans:
          //   1. Caller policy (`suppressDelegateOutputs`) — AgentTimelineCard
          //      is the canonical owner, so PlanSurface drops both chip AND
          //      tool/output expansion.
          //   2. Per-step fallback — even without the policy hint, dedupe
          //      the chip when the manifest carries 2+ delegate subtasks
          //      (legacy callers that haven't threaded the policy yet).
          const ownedByTimeline =
            suppressDelegateOutputs && isDelegate;
          const dedupChipOnly =
            !ownedByTimeline &&
            isDelegate &&
            turn.multiAgentSubtasks.some((s) => s.stepId === step.id) &&
            turn.multiAgentSubtasks.length >= 2;
          const subtask = subtasksByStepId.get(step.id);
          return (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              // Hide tool list for owned-delegate rows — it lives in
              // AgentTimelineCard's expanded drawer above.
              tools={ownedByTimeline ? [] : toolsByStep.get(step.id) ?? []}
              // Per-step output is empty for delegates today, but be
              // explicit so a future change that streams synthesis into
              // a delegate's stepOutputs doesn't accidentally re-duplicate.
              output={ownedByTimeline ? '' : turn.stepOutputs[step.id] ?? ''}
              defaultOpen={
                step.status === 'running' ||
                step.status === 'failed' ||
                step.id === lastFinishedStepId
              }
              isStreaming={isTurnStreaming && step.status === 'running'}
              suppressDelegateChip={ownedByTimeline || dedupChipOnly}
              subtask={subtask}
              // Click-to-jump only when a timeline owns the row above —
              // otherwise the click should still toggle the inline expansion.
              onJumpTo={ownedByTimeline ? handleJumpToSubtask : undefined}
            />
          );
        })}
      </ol>
      {orphanTools.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-text-dim hover:text-text select-none">
            <ChevronRight
              size={11}
              className="transition-transform group-open:rotate-90"
            />
            Other tool activity
            <span className="font-mono tabular-nums">({orphanTools.length})</span>
          </summary>
          <div className="mt-1.5 ml-3 space-y-1 border-l border-border/60 pl-3">
            {orphanTools.map((t) => (
              <ToolCallCard key={t.id} tool={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Memoized — the parent re-renders on every SSE event. PlanSurface only
 * reads four slices (planSteps, toolCalls, stepOutputs, status); the
 * reducer preserves their references when the event doesn't touch them
 * (e.g. an `agent:turn_complete` only mutates `tokensConsumed`). A
 * slice-only comparator avoids re-rendering the whole plan + every nested
 * ToolCallCard on each token-level delta.
 */
export const PlanSurface = memo(
  PlanSurfaceImpl,
  (prev, next) =>
    prev.suppressDelegateOutputs === next.suppressDelegateOutputs &&
    prev.turn.planSteps === next.turn.planSteps &&
    prev.turn.toolCalls === next.turn.toolCalls &&
    prev.turn.stepOutputs === next.turn.stepOutputs &&
    prev.turn.status === next.turn.status &&
    prev.turn.multiAgentSubtasks === next.turn.multiAgentSubtasks,
);
