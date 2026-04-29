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
 * Visual design notes:
 *   - The row container is intentionally NEUTRAL (no per-row colored
 *     border / background tint by default). Status is conveyed through
 *     the leading icon + the trailing label only. Full-row tinting is
 *     reserved for `running` (subtle blue pulse) and failure states
 *     (very faint red wash) so the card stays scannable when several
 *     delegates run in parallel.
 *   - Persona is a single neutral monospace pill — distinct typeface
 *     for identity, not status. Avoids the prior "doubly color-coded"
 *     look where the persona name's box was tinted with the row's
 *     status colour and competed with the status icon.
 *   - When EVERY delegate row carries the SAME step description (the
 *     typical multi-agent pattern: "Answer the question: $step1.result"
 *     resolves to the same goal text for each persona), the description
 *     is shown ONCE in the card sub-header and omitted per row. This
 *     prevents the same paragraph being repeated 3-4 times stacked.
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

interface StatusMeta {
  /** Lower-case status label shown next to the icon (e.g. "done"). */
  label: string;
  Icon: typeof CircleCheck;
  /** Tailwind colour class applied to the icon + label only. */
  text: string;
  /** Optional row tint for live / failure states. Empty for done / pending. */
  rowTint: string;
  spin?: boolean;
  pulse?: boolean;
}

function statusMeta(step: PlanStep): StatusMeta {
  const isTimeout =
    step.status === 'failed' && (step.outputPreview ?? '').toLowerCase().includes('timed out');
  if (isTimeout) {
    return {
      label: 'timed out',
      Icon: CircleAlert,
      text: 'text-red',
      rowTint: 'bg-red/[0.04]',
    };
  }
  switch (step.status) {
    case 'done':
      return { label: 'done', Icon: CircleCheck, text: 'text-green', rowTint: '' };
    case 'failed':
      return { label: 'failed', Icon: CircleAlert, text: 'text-red', rowTint: 'bg-red/[0.04]' };
    case 'skipped':
      return {
        label: 'skipped',
        Icon: SkipForward,
        text: 'text-text-dim',
        rowTint: '',
      };
    case 'running':
      return {
        label: 'working',
        Icon: Loader2,
        text: 'text-blue',
        rowTint: 'bg-blue/[0.06]',
        spin: true,
        pulse: true,
      };
    default:
      return {
        label: 'pending',
        Icon: CircleDashed,
        text: 'text-text-dim',
        rowTint: '',
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

  // De-dup repeated step description. The most common multi-agent
  // pattern produces N delegates that all share the same `label`
  // ("Answer the question: $step1.result" resolves to identical goal
  // text for each persona). Showing the same paragraph 3-4 times under
  // each row is pure noise — surface it once at card level instead.
  const sharedLabel =
    delegateRows.length > 1 &&
    delegateRows.every((r) => (r.label ?? '') === (delegateRows[0]?.label ?? ''))
      ? (delegateRows[0]?.label ?? null)
      : null;

  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden',
        isLive && runningCount > 0
          ? 'border-blue/25 bg-blue/[0.025]'
          : 'border-border/50 bg-bg/20',
      )}
    >
      {/* Header — counts + live indicator */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-bg/20">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-text-dim">
          {isLive && runningCount > 0 ? (
            <Zap size={11} className="text-blue animate-pulse shrink-0" />
          ) : (
            <Users size={11} className="text-text-dim/80 shrink-0" />
          )}
          <span>Sub-agents</span>
          <span className="font-mono normal-case text-text-dim/60 tabular-nums">
            · {delegateRows.length}
          </span>
        </span>
        <span className="font-mono text-[10px] inline-flex items-center gap-2 normal-case tabular-nums">
          {runningCount > 0 && <span className="text-blue">{runningCount} working</span>}
          {doneCount > 0 && <span className="text-green/85">{doneCount} done</span>}
          {failedCount > 0 && <span className="text-red/85">{failedCount} failed</span>}
          {allDone && doneCount + failedCount === delegateRows.length && doneCount === delegateRows.length && (
            <span className="text-text-dim/60">complete</span>
          )}
        </span>
      </div>

      {/* Shared step description (only when every row carries the same label) */}
      {sharedLabel && (
        <div className="px-3 pt-2 pb-1.5 text-[11.5px] text-text/85 line-clamp-2 border-b border-border/20">
          {sharedLabel}
        </div>
      )}

      {/* Rows — neutral container, status conveyed through icon + label only */}
      <ul className="divide-y divide-border/15">
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
                'flex items-center gap-2.5 px-3 py-1.5',
                meta.rowTint,
                meta.pulse && 'animate-[pulse_2.4s_ease-in-out_infinite]',
              )}
              title={row.label}
            >
              {/* Persona pill — neutral identity, NOT colour-coded by status. */}
              <span className="inline-flex items-center gap-1.5 shrink-0">
                <Bot
                  size={11}
                  className={cn('text-text-dim/70', meta.spin && 'text-blue animate-spin')}
                />
                <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40 text-text/90 min-w-[5.25rem] text-center">
                  {row.agentId ?? 'agent?'}
                </span>
              </span>

              {/* Description — only when not deduped to header. */}
              {!sharedLabel ? (
                <span className="flex-1 text-[11px] text-text/80 line-clamp-1 min-w-0">
                  {row.label}
                </span>
              ) : (
                <span className="flex-1" aria-hidden />
              )}

              {/* Status — icon + label, fixed minimum width so duration aligns. */}
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide tabular-nums min-w-[5.5rem] justify-end',
                  meta.text,
                )}
              >
                <Icon size={10} className={cn(meta.spin && 'animate-spin')} />
                <span>{meta.label}</span>
              </span>

              {/* Duration — fixed-width column so single-digit and m-format
                  durations line up vertically across rows. */}
              {duration && (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-text-dim/70 w-[3.5rem] justify-end">
                  <Clock size={9} className="opacity-70" />
                  <span>{duration}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Live hint — only while at least one delegate is in flight. */}
      {isLive && runningCount > 0 && (
        <div className="px-3 py-1.5 border-t border-border/20 text-[10px] text-text-dim/85 italic">
          Each agent runs independently in parallel — expand the plan below to read each
          response when ready.
        </div>
      )}
    </div>
  );
}
