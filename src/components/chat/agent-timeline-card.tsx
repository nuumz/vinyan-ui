import { memo, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Columns3,
  Hourglass,
  Loader2,
  SkipForward,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStep } from '@/hooks/use-streaming-turn';
import { Markdown } from './markdown';

/**
 * Multi-agent activity card. Lifecycle-aware surface for `delegate-sub-agent`
 * fanout. Three problems with the prior live-only design that this version
 * solves:
 *
 *   1. **Queued duplication** — when every delegate is still pending (the
 *      planner has dispatched the rows but their dependency, e.g. an
 *      "Ask the user" step, hasn't completed yet) the card used to render
 *      a full row stack identical to the PlanSurface checklist below it.
 *      We now degrade to a single 1-line "queued · waiting on step N" chip
 *      so PlanSurface owns the data until something actually moves.
 *
 *   2. **Lost audit affordance** — the live-only redesign dropped the
 *      expand-to-read drawer. Restored: each row expands to show the
 *      streaming tail (while running) or the agent's full Markdown output
 *      (after `workflow:delegate_completed`), and a Compare side-by-side
 *      view stacks 2+ completed agents in columns for direct comparison.
 *
 *   3. **Unresolved placeholder leak** — when N delegates share the same
 *      label like "Answer the question from $step1.result" (template var
 *      not yet resolved), the de-dup logic surfaced the raw placeholder
 *      as if it were the goal. We suppress the shared header in that case.
 *
 * State machine (computed once per render from delegateRows):
 *   - QUEUED:   nothing has moved yet                          → 1-line chip
 *   - ACTIVE:   ≥1 running, OR mixed pending/done in flight    → full live card
 *   - COMPLETE: every row in done|failed|skipped               → audit + compare
 */
export interface AgentTimelineCardProps {
  /** Plan steps from the parent turn. Filtered internally to delegate-sub-agent rows. */
  steps: PlanStep[];
  /**
   * Per-step LLM output stream from `StreamingTurn.stepOutputs`. Used for
   * the live snippet/cursor on running rows. Optional — historical replays
   * that don't carry stepOutputs still work, falling back to
   * `step.outputPreview` from `workflow:delegate_completed`.
   */
  stepOutputs?: Record<string, string>;
  /** True while the parent turn is still running — drives live pulses. */
  isLive?: boolean;
}

interface StatusMeta {
  label: string;
  Icon: typeof CircleCheck;
  text: string;
  rowTint: string;
  spin?: boolean;
  pulse?: boolean;
}

function statusMeta(step: PlanStep): StatusMeta {
  const isTimeout =
    step.status === 'failed' && (step.outputPreview ?? '').toLowerCase().includes('timed out');
  if (isTimeout) {
    return { label: 'timed out', Icon: CircleAlert, text: 'text-red', rowTint: 'bg-red/[0.04]' };
  }
  switch (step.status) {
    case 'done':
      return { label: 'done', Icon: CircleCheck, text: 'text-green', rowTint: '' };
    case 'failed':
      return { label: 'failed', Icon: CircleAlert, text: 'text-red', rowTint: 'bg-red/[0.04]' };
    case 'skipped':
      return { label: 'skipped', Icon: SkipForward, text: 'text-text-dim', rowTint: '' };
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
      return { label: 'queued', Icon: CircleDashed, text: 'text-text-dim', rowTint: '' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

// `$step1.result`, `${step1.result}`, `step1.result` — any of these signal
// an unresolved planner template. Surfacing them as the goal misleads the
// reader into thinking "step1.result" is the actual question.
const PLACEHOLDER_RE = /\$?\{?\s*step\d+\.[a-z_]+\s*\}?/i;
function looksUnresolved(label: string): boolean {
  return PLACEHOLDER_RE.test(label);
}

function liveTail(text: string, max: number): string {
  if (text.length <= max) return text;
  return '…' + text.slice(-max);
}

// First non-delegate step that hasn't completed yet — typically what the
// queued delegates are waiting on. Powers the QUEUED chip's "waiting on X".
function findBlockingStep(allSteps: PlanStep[], delegateIds: Set<string>): PlanStep | null {
  for (const step of allSteps) {
    if (delegateIds.has(step.id)) break;
    if (step.status === 'pending' || step.status === 'running') return step;
  }
  return null;
}

interface DelegateRowProps {
  step: PlanStep;
  liveText: string;
  isLive: boolean;
  defaultOpen: boolean;
}

function DelegateRow({ step, liveText, isLive, defaultOpen }: DelegateRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = statusMeta(step);
  const Icon = meta.Icon;

  const duration =
    step.startedAt && step.finishedAt
      ? formatDuration(step.finishedAt - step.startedAt)
      : step.startedAt && isLive
        ? '…'
        : null;

  const isStreaming = step.status === 'running' && liveText.length > 0;
  const hasFinalOutput = !!step.outputPreview && step.outputPreview.trim().length > 0;
  const expandable = isStreaming || hasFinalOutput || step.status === 'failed';

  return (
    <li
      className={cn(
        'border-b border-border/15 last:border-b-0',
        meta.rowTint,
        meta.pulse && 'animate-[pulse_2.4s_ease-in-out_infinite]',
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
          expandable ? 'cursor-pointer hover:bg-bg/30' : 'cursor-default',
        )}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
      >
        {expandable ? (
          <ChevronRight
            size={11}
            className={cn(
              'shrink-0 text-text-dim transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span className="inline-block w-[11px] shrink-0" aria-hidden />
        )}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Bot
            size={11}
            className={cn('text-text-dim/70', meta.spin && 'text-blue animate-spin')}
          />
          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40 text-text/90 min-w-[5.25rem] text-center">
            {step.agentId ?? 'agent?'}
          </span>
        </span>
        {!open && isStreaming ? (
          <span className="flex-1 text-[11px] text-text/75 line-clamp-1 min-w-0 italic">
            {liveTail(liveText, 90)}
            <span className="ml-0.5 inline-block h-2.5 w-1 animate-pulse bg-accent align-middle" />
          </span>
        ) : (
          <span className="flex-1" aria-hidden />
        )}
        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide tabular-nums min-w-[5.5rem] justify-end',
            meta.text,
          )}
        >
          <Icon size={10} className={cn(meta.spin && 'animate-spin')} />
          <span>{meta.label}</span>
        </span>
        {duration && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-text-dim/70 w-[3.5rem] justify-end">
            <Clock size={9} className="opacity-70" />
            <span>{duration}</span>
          </span>
        )}
      </button>
      {open && expandable && (
        <div className="ml-7 mb-2 mr-3 border-l border-border/40 pl-3 space-y-1.5 text-xs">
          {step.subTaskId && (
            <div className="text-[10px] font-mono text-text-dim/70">sub-task: {step.subTaskId}</div>
          )}
          {isStreaming ? (
            <div className="text-text/90">
              <Markdown content={liveText} />
              <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-accent align-middle" />
            </div>
          ) : hasFinalOutput ? (
            <div className="text-text/90 max-h-72 overflow-auto">
              <Markdown content={step.outputPreview ?? ''} />
              {(step.outputPreview ?? '').length >= 300 && (
                <div className="mt-1 text-[10px] italic text-text-dim">
                  (preview from delegate_completed — full output is in the synthesized answer)
                </div>
              )}
            </div>
          ) : step.status === 'failed' ? (
            <div className="rounded border border-red/25 bg-red/5 p-2 text-red/90">
              [no output captured — agent {meta.label}]
            </div>
          ) : (
            <div className="italic text-text-dim">[no output captured]</div>
          )}
        </div>
      )}
    </li>
  );
}

function CompareDrawer({ rows }: { rows: PlanStep[] }) {
  const cols = rows.filter((r) => r.outputPreview && r.outputPreview.trim().length > 0);
  if (cols.length < 2) return null;
  return (
    <div className="border-t border-border/30 bg-bg/10 p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-dim font-medium mb-2">
        Side-by-side · {cols.length} agents
      </div>
      <div
        className="grid gap-3 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(220px, 1fr))` }}
      >
        {cols.map((row) => (
          <div
            key={row.id}
            className="rounded border border-border/40 bg-bg/30 p-2 text-xs space-y-1.5 min-w-0"
          >
            <div className="flex items-center gap-1.5 pb-1 border-b border-border/30">
              <Bot size={10} className="text-text-dim/70" />
              <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40">
                {row.agentId ?? 'agent?'}
              </span>
              {row.startedAt && row.finishedAt && (
                <span className="ml-auto text-[10px] text-text-dim/70 font-mono tabular-nums">
                  {formatDuration(row.finishedAt - row.startedAt)}
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-auto text-[11.5px] text-text/85">
              <Markdown content={row.outputPreview ?? ''} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueuedChip({ count, blocking }: { count: number; blocking: PlanStep | null }) {
  return (
    <div className="rounded-md border border-border/40 bg-bg/15 px-3 py-1.5 flex items-center gap-2 text-[11px] text-text-dim">
      <Hourglass size={11} className="text-text-dim/80 shrink-0" />
      <span>
        <span className="font-medium text-text/85">{count}</span> sub-agent
        {count === 1 ? '' : 's'} queued
      </span>
      {blocking && (
        <span className="text-text-dim/70 truncate min-w-0" title={blocking.label}>
          · waiting on{' '}
          <span className="text-text/80">
            {blocking.label.length > 60 ? `${blocking.label.slice(0, 60)}…` : blocking.label}
          </span>
        </span>
      )}
    </div>
  );
}

function AgentTimelineCardImpl({ steps, stepOutputs = {}, isLive = false }: AgentTimelineCardProps) {
  const delegateRows = useMemo(
    () => steps.filter((s) => s.strategy === 'delegate-sub-agent'),
    [steps],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of delegateRows) {
      switch (r.status) {
        case 'running':
          running++;
          break;
        case 'done':
          done++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
          skipped++;
          break;
        default:
          pending++;
      }
    }
    return { pending, running, done, failed, skipped, total: delegateRows.length };
  }, [delegateRows]);

  // Shared label de-dup — only when every row carries the same label AND
  // the label isn't an unresolved placeholder.
  const sharedLabel = useMemo(() => {
    if (delegateRows.length < 2) return null;
    const first = delegateRows[0]?.label ?? '';
    if (!first) return null;
    if (looksUnresolved(first)) return null;
    return delegateRows.every((r) => r.label === first) ? first : null;
  }, [delegateRows]);

  const totalDuration = useMemo(() => {
    return delegateRows.reduce((max, r) => {
      if (r.startedAt && r.finishedAt) return Math.max(max, r.finishedAt - r.startedAt);
      return max;
    }, 0);
  }, [delegateRows]);

  const [showCompare, setShowCompare] = useState(false);

  if (delegateRows.length === 0) return null;

  const allTerminal = counts.pending === 0 && counts.running === 0;
  const isQueued =
    counts.running === 0 && counts.done === 0 && counts.failed === 0 && counts.skipped === 0;

  // STATE A — queued: compact 1-line chip, no full card.
  if (isQueued) {
    const delegateIds = new Set(delegateRows.map((r) => r.id));
    const blocking = findBlockingStep(steps, delegateIds);
    return <QueuedChip count={counts.total} blocking={blocking} />;
  }

  // STATE B/C — full card.
  const headerLabel = allTerminal
    ? counts.failed > 0
      ? `Multi-agent complete · ${counts.done} done · ${counts.failed} failed`
      : `Multi-agent complete · ${counts.done} done`
    : `Multi-agent run · ${counts.running} working`;

  const completedRowsForCompare = delegateRows.filter(
    (r) => r.status === 'done' && r.outputPreview && r.outputPreview.trim().length > 0,
  );

  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden',
        isLive && counts.running > 0
          ? 'border-blue/25 bg-blue/[0.025]'
          : 'border-border/50 bg-bg/20',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-bg/20">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-text-dim min-w-0">
          {isLive && counts.running > 0 ? (
            <Zap size={11} className="text-blue animate-pulse shrink-0" />
          ) : (
            <Users size={11} className="text-text-dim/80 shrink-0" />
          )}
          <span className="normal-case text-text/80 truncate">{headerLabel}</span>
        </span>
        <span className="font-mono text-[10px] inline-flex items-center gap-2 normal-case tabular-nums shrink-0">
          {counts.pending > 0 && <span className="text-text-dim/80">{counts.pending} queued</span>}
          {counts.running > 0 && !allTerminal && (
            <span className="text-blue/85">{counts.running} working</span>
          )}
          {counts.done > 0 && <span className="text-green/85">{counts.done} done</span>}
          {counts.failed > 0 && <span className="text-red/85">{counts.failed} failed</span>}
          {counts.skipped > 0 && (
            <span className="text-text-dim/80">{counts.skipped} skipped</span>
          )}
          {allTerminal && totalDuration > 0 && (
            <span className="text-text-dim/70 inline-flex items-center gap-0.5">
              <Clock size={9} className="opacity-70" />
              {formatDuration(totalDuration)}
            </span>
          )}
        </span>
      </div>

      {sharedLabel && (
        <div className="px-3 pt-2 pb-1.5 text-[11.5px] text-text/85 line-clamp-2 border-b border-border/20">
          {sharedLabel}
        </div>
      )}

      <ul>
        {delegateRows.map((row) => (
          <DelegateRow
            key={row.id}
            step={row}
            liveText={stepOutputs[row.id] ?? ''}
            isLive={isLive}
            defaultOpen={row.status === 'failed'}
          />
        ))}
      </ul>

      {isLive && counts.running > 0 && (
        <div className="px-3 py-1.5 border-t border-border/20 text-[10px] text-text-dim/85 italic">
          Each agent runs independently in parallel — click a row to read what they're writing live.
        </div>
      )}

      {allTerminal && completedRowsForCompare.length >= 2 && (
        <>
          <div className="border-t border-border/20 bg-bg/10 px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-text-dim italic truncate">
              Click a row to read each answer · or compare them side-by-side.
            </span>
            <button
              type="button"
              onClick={() => setShowCompare((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-accent hover:text-accent/80"
            >
              <Columns3 size={10} />
              {showCompare ? 'Hide compare' : 'Compare side-by-side'}
            </button>
          </div>
          {showCompare && <CompareDrawer rows={completedRowsForCompare} />}
        </>
      )}
    </div>
  );
}

export const AgentTimelineCard = memo(AgentTimelineCardImpl);
