import { memo, useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleDot,
  CircleSlash,
  Loader2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PlanStep, StreamingTurn, ToolCall } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { ToolCallCard } from './tool-call-card';

interface PlanSurfaceProps {
  turn: StreamingTurn;
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
}

function StepRow({ step, index, tools, output, defaultOpen, isStreaming }: StepRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { Icon, tone, spin, strike } = glyphFor(step.status);
  const hasTools = tools.length > 0;
  const hasOutput = output.length > 0;
  const isExpandable = hasTools || hasOutput;
  const duration =
    step.startedAt != null && step.finishedAt != null
      ? formatDuration(step.finishedAt - step.startedAt)
      : null;

  // Done / pending steps line-clamp the label so long descriptions don't
  // bloat the plan box. The running step keeps its full label visible so
  // the user can read the work currently underway.
  const clampLabel = step.status !== 'running' && step.status !== 'failed';

  return (
    <li className="space-y-1">
      <button
        type="button"
        onClick={() => isExpandable && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-start gap-2 text-left text-xs leading-5',
          isExpandable ? 'cursor-pointer' : 'cursor-default',
        )}
        disabled={!isExpandable}
        aria-expanded={isExpandable ? open : undefined}
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
          {step.label}
        </span>
        {duration && (
          <span className="shrink-0 text-[10px] text-text-dim tabular-nums">{duration}</span>
        )}
        {!duration && hasTools && (
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
function PlanSurfaceImpl({ turn }: PlanSurfaceProps) {
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
  const isTurnStreaming = turn.status === 'running';
  const doneCount = turn.planSteps.filter((s) => s.status === 'done').length;

  return (
    <div className="rounded-md bg-bg/20 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-text-dim font-medium">
        <span>Plan</span>
        <span className="font-mono normal-case tracking-normal">
          {doneCount}/{turn.planSteps.length}
        </span>
      </div>
      <ol className="space-y-1">
        {turn.planSteps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            tools={toolsByStep.get(step.id) ?? []}
            output={turn.stepOutputs[step.id] ?? ''}
            defaultOpen={step.status === 'running' || step.status === 'failed'}
            isStreaming={isTurnStreaming && step.status === 'running'}
          />
        ))}
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
    prev.turn.planSteps === next.turn.planSteps &&
    prev.turn.toolCalls === next.turn.toolCalls &&
    prev.turn.stepOutputs === next.turn.stepOutputs &&
    prev.turn.status === next.turn.status,
);
