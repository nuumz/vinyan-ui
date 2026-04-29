import { useMemo } from 'react';
import {
  Bot,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Loader2,
  SkipForward,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStep } from '@/hooks/use-streaming-turn';

/**
 * Live multi-agent activity card. Surfaces the per-sub-agent status
 * during a running `delegate-sub-agent` workflow so the user can see
 * which persona is working RIGHT NOW, what they are doing, and how
 * each task is progressing — without expanding the plan checklist.
 *
 * Designed as a complementary surface to PlanSurface:
 *   - PlanSurface = full plan checklist (all step types incl. setup +
 *     synthesis), expand-to-read each step's output.
 *   - AgentTimelineCard = focused parallel-agent activity feed, only
 *     delegate steps, status-first emphasis (pulsing while running),
 *     no output text (that lives in the plan expansion).
 *
 * Positioned ABOVE the plan checklist when the workflow has multiple
 * agents — it answers the at-a-glance question "what are the agents
 * doing right now" before the user has to scan the plan rows.
 */
export interface AgentTimelineCardProps {
  /** Plan steps from the parent turn. Filtered internally to delegate-sub-agent rows. */
  steps: PlanStep[];
  /** True while the parent turn is still running — drives live pulses. */
  isLive?: boolean;
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
  pulse?: boolean;
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
        label: 'working…',
        Icon: Loader2,
        cls: 'text-blue border-blue/40 bg-blue/10',
        spin: true,
        pulse: true,
      };
    default:
      return {
        label: 'pending',
        Icon: CircleDashed,
        cls: 'text-text-dim border-border bg-bg/40',
      };
  }
}

export function AgentTimelineCard({ steps, isLive = false }: AgentTimelineCardProps) {
  // Filter to delegate-sub-agent rows. Anything else (knowledge-query,
  // llm-reasoning, direct-tool, synthesis) belongs in the plan checklist
  // — duplicating them here would be visual noise.
  const delegateRows = useMemo(
    () => steps.filter((s) => s.strategy === 'delegate-sub-agent'),
    [steps],
  );

  if (delegateRows.length === 0) return null;

  const doneCount = delegateRows.filter((s) => s.status === 'done').length;
  const failedCount = delegateRows.filter(
    (s) => s.status === 'failed' || s.status === 'skipped',
  ).length;
  const runningCount = delegateRows.filter((s) => s.status === 'running').length;
  const allDone = doneCount + failedCount === delegateRows.length;

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 space-y-1.5',
        isLive && runningCount > 0
          ? 'border-blue/30 bg-blue/5'
          : 'border-border/60 bg-bg/30',
      )}
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-dim font-medium">
        <span className="flex items-center gap-1.5">
          {isLive && runningCount > 0 ? (
            <Zap size={11} className="text-blue animate-pulse" />
          ) : (
            <Users size={11} className="text-text-dim/80" />
          )}
          {isLive && runningCount > 0
            ? `${runningCount} agent${runningCount === 1 ? '' : 's'} working`
            : allDone
              ? 'Sub-agents'
              : `${runningCount + failedCount + doneCount}/${delegateRows.length} sub-agents`}
        </span>
        <span className="font-mono normal-case text-text-dim/70 inline-flex items-center gap-2">
          {doneCount > 0 && (
            <span className="text-green/80">{doneCount} done</span>
          )}
          {failedCount > 0 && <span className="text-red/80">{failedCount} failed</span>}
        </span>
      </div>

      <ul className="space-y-1">
        {delegateRows.map((row) => {
          const meta = statusMeta(row);
          const Icon = meta.Icon;
          const duration =
            row.startedAt && row.finishedAt
              ? formatDuration(row.finishedAt - row.startedAt)
              : row.startedAt && isLive
                ? '…'
                : null;
          return (
            <li
              key={row.id}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1 border text-xs',
                meta.cls,
                meta.pulse && 'animate-[pulse_2s_ease-in-out_infinite]',
              )}
              title={row.label}
            >
              <Bot size={12} className={cn('shrink-0', meta.spin && 'animate-spin')} />
              <span className="font-mono shrink-0 font-medium min-w-[5rem]">
                {row.agentId ?? 'agent?'}
              </span>
              <span className="flex-1 text-text/85 line-clamp-1 text-[11px]">
                {row.label}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase">
                <Icon size={9} className={cn(meta.spin && 'animate-spin')} />
                {meta.label}
              </span>
              {duration && (
                <span className="shrink-0 text-[10px] text-text-dim tabular-nums font-mono inline-flex items-center gap-0.5">
                  <Clock size={9} />
                  {duration}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {isLive && runningCount > 0 && (
        <div className="text-[10px] text-text-dim italic pt-0.5">
          Each agent runs independently in parallel — expand the plan below to read each
          response when ready.
        </div>
      )}
    </div>
  );
}
