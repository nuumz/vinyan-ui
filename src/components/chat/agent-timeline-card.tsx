import { useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Loader2,
  SkipForward,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStep } from '@/hooks/use-streaming-turn';
import { Markdown } from './markdown';

/**
 * Multi-agent audit card. Renders ONE row per `delegate-sub-agent` plan
 * step with the resolved agent persona, status, duration, and the agent's
 * output preview (expandable). Solves the visibility gap from the
 * 2026-04-29 multi-agent tests where the chat surface only showed the
 * synthesized final answer with no way to see what each sub-agent
 * actually said.
 *
 * Designed to live INSIDE the assistant message bubble (or replay card)
 * — not as a sidebar — so audit drill-down stays in the conversation
 * column the user is already reading. Self-contained: no extra fetches,
 * just projects from the parent turn's planSteps which the reducer
 * already populated from `agent:plan_update` + `workflow:delegate_*`.
 */
export interface AgentTimelineCardProps {
  /** Parent goal text shown in the header for audit context. */
  parentGoal?: string;
  /** Plan steps from the parent turn. The card filters to delegates internally. */
  steps: PlanStep[];
  /** True while the parent turn is still running — drives the live pulse. */
  isLive?: boolean;
  /** Open one delegate by default (e.g. the first failed/timeout). */
  defaultExpandedStepId?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function statusMeta(step: PlanStep): {
  label: string;
  Icon: typeof CircleCheck;
  cls: string;
  spin?: boolean;
} {
  const isTimeout =
    step.status === 'failed' && (step.outputPreview ?? '').toLowerCase().includes('timed out');
  if (isTimeout) {
    return {
      label: 'timed out',
      Icon: CircleAlert,
      cls: 'text-red border-red/30 bg-red/5',
    };
  }
  switch (step.status) {
    case 'done':
      return { label: 'done', Icon: CircleCheck, cls: 'text-green border-green/30 bg-green/5' };
    case 'failed':
      return { label: 'failed', Icon: CircleAlert, cls: 'text-red border-red/30 bg-red/5' };
    case 'skipped':
      return {
        label: 'skipped',
        Icon: SkipForward,
        cls: 'text-text-dim border-border bg-bg/40',
      };
    case 'running':
      return {
        label: 'running',
        Icon: Loader2,
        cls: 'text-blue border-blue/30 bg-blue/5',
        spin: true,
      };
    default:
      return {
        label: 'pending',
        Icon: CircleDashed,
        cls: 'text-text-dim border-border bg-bg/40',
      };
  }
}

export function AgentTimelineCard({
  parentGoal,
  steps,
  isLive = false,
  defaultExpandedStepId,
}: AgentTimelineCardProps) {
  // Filter to delegate-sub-agent rows. Anything else (knowledge-query,
  // llm-reasoning, direct-tool, synthesis) is part of the regular plan
  // checklist rendered by PlanSurface — not duplicated here.
  const delegateRows = useMemo(
    () => steps.filter((s) => s.strategy === 'delegate-sub-agent'),
    [steps],
  );

  const [openId, setOpenId] = useState<string | null>(defaultExpandedStepId ?? null);

  if (delegateRows.length === 0) return null;

  const doneCount = delegateRows.filter(
    (s) => s.status === 'done' || s.status === 'failed' || s.status === 'skipped',
  ).length;
  const totalDuration = delegateRows
    .map((s) =>
      s.startedAt && s.finishedAt ? s.finishedAt - s.startedAt : 0,
    )
    .reduce((max, d) => Math.max(max, d), 0);

  return (
    <div className="mt-3 rounded-md border border-border/60 bg-bg/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-dim font-medium">
        <span className="flex items-center gap-1.5">
          <Users
            size={11}
            className={cn('text-blue', isLive && 'animate-pulse')}
          />
          Sub-agents
          <span className="font-mono normal-case tracking-normal">
            {doneCount}/{delegateRows.length}
          </span>
        </span>
        {totalDuration > 0 && (
          <span className="font-mono normal-case text-text-dim/70 inline-flex items-center gap-1">
            <Clock size={9} /> {formatDuration(totalDuration)} max
          </span>
        )}
      </div>

      {parentGoal && (
        <div
          className="text-xs text-text-dim line-clamp-1"
          title={parentGoal}
        >
          {parentGoal}
        </div>
      )}

      <ul className="space-y-1">
        {delegateRows.map((row) => {
          const meta = statusMeta(row);
          const Icon = meta.Icon;
          const open = openId === row.id;
          const duration =
            row.startedAt && row.finishedAt
              ? formatDuration(row.finishedAt - row.startedAt)
              : row.startedAt && isLive
                ? '…'
                : null;
          const hasOutput = !!row.outputPreview && row.outputPreview.trim().length > 0;
          return (
            <li key={row.id} className="text-xs">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.id)}
                className={cn(
                  'w-full flex items-start gap-2 rounded px-2 py-1.5 border transition-colors',
                  meta.cls,
                  'hover:bg-bg/50',
                )}
                aria-expanded={open}
              >
                {open ? (
                  <ChevronDown size={11} className="mt-0.5 shrink-0 text-text-dim" />
                ) : (
                  <ChevronRight size={11} className="mt-0.5 shrink-0 text-text-dim" />
                )}
                <Bot size={12} className={cn('mt-0.5 shrink-0', meta.spin && 'animate-spin')} />
                <span className="font-mono shrink-0 font-medium">
                  {row.agentId ?? 'agent?'}
                </span>
                <span className="flex-1 text-left text-text/85 line-clamp-1">{row.label}</span>
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase">
                  <Icon size={9} className={cn(meta.spin && 'animate-spin')} />
                  {meta.label}
                </span>
                {duration && (
                  <span className="shrink-0 text-[10px] text-text-dim tabular-nums font-mono">
                    {duration}
                  </span>
                )}
              </button>
              {open && (
                <div className="ml-6 mt-1 border-l border-border/60 pl-3 py-1 space-y-1.5">
                  {row.subTaskId && (
                    <div className="text-[10px] text-text-dim font-mono">
                      sub-task: {row.subTaskId}
                    </div>
                  )}
                  {hasOutput ? (
                    <div className="text-text/90 max-h-64 overflow-auto">
                      <Markdown content={row.outputPreview!} />
                      {row.outputPreview!.length >= 300 && (
                        <div className="mt-1 text-[10px] text-text-dim italic">
                          (preview — full output is in the synthesized final answer above)
                        </div>
                      )}
                    </div>
                  ) : row.status === 'failed' ? (
                    <div className="text-xs text-red bg-red/5 border border-red/20 rounded p-2">
                      [no output captured — agent {meta.label}]
                    </div>
                  ) : row.status === 'running' || row.status === 'pending' ? (
                    <div className="text-xs text-text-dim italic">
                      {row.status === 'running' ? 'agent is working…' : 'waiting to start'}
                    </div>
                  ) : (
                    <div className="text-xs text-text-dim italic">[no output captured]</div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
