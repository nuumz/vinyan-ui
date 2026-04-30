/**
 * Replay completeness banner — sits at the top of the historical process
 * card. Honest about whether the persisted event log captured the task in
 * full, paused on a user gate, or was truncated. Replaces the previous
 * fake "everything ran to done" normalization.
 *
 * Visual weight follows signal value:
 *   - `complete`: render a single dim meta strip (event count + timestamps).
 *     The TurnHeader's "Done" status already conveys success; a green
 *     bordered "Replay complete" banner alongside it was visible noise.
 *   - everything else: keep the bordered banner — those states (terminal
 *     error, missing-terminal, paused gate, unsupported, error) carry
 *     real warnings the user should not miss.
 */
import {
  AlertTriangle,
  HelpCircle,
  Inbox,
  Pause,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReplayCompleteness } from '@/lib/replay-completeness';
import { cn } from '@/lib/utils';

interface ReplayCompletenessBannerProps {
  completeness: ReplayCompleteness;
  taskId?: string;
  /**
   * Optional context line — e.g. error message from the loader. Shown
   * verbatim in the right rail; truncated visually but not in DOM.
   */
  detail?: string;
}

interface ToneSpec {
  Icon: LucideIcon;
  tone: string;
  bg: string;
  border: string;
  label: string;
}

// Tones for non-`complete` states only. The `complete` state renders a
// minimal meta strip below and never reaches this map.
const TONES: Record<Exclude<ReplayCompleteness['kind'], 'complete'>, ToneSpec> = {
  'terminal-error': {
    Icon: XCircle,
    tone: 'text-red',
    bg: 'bg-red/[0.04]',
    border: 'border-red/30',
    label: 'Terminal error',
  },
  'missing-terminal': {
    Icon: AlertTriangle,
    tone: 'text-yellow',
    bg: 'bg-yellow/[0.04]',
    border: 'border-yellow/30',
    label: 'Replay interrupted — no terminal event',
  },
  'awaiting-user': {
    Icon: Pause,
    tone: 'text-blue',
    bg: 'bg-blue/[0.04]',
    border: 'border-blue/25',
    label: 'Recording paused on a user gate',
  },
  empty: {
    Icon: Inbox,
    tone: 'text-text-dim',
    bg: 'bg-bg/15',
    border: 'border-border/40',
    label: 'No persisted events for this task',
  },
  unsupported: {
    Icon: Inbox,
    tone: 'text-text-dim',
    bg: 'bg-bg/15',
    border: 'border-border/40',
    label: 'Process history unavailable',
  },
  error: {
    Icon: HelpCircle,
    tone: 'text-red',
    bg: 'bg-red/[0.04]',
    border: 'border-red/30',
    label: 'Failed to load process history',
  },
};

function formatTs(ms?: number): string | null {
  if (!ms) return null;
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, { hour12: false });
  } catch {
    return null;
  }
}

function describeTerminal(kind: ReplayCompleteness['kind'], terminal?: string): string | undefined {
  if (kind !== 'terminal-error') return undefined;
  if (terminal === 'task:timeout') return 'task timed out';
  if (terminal === 'worker:error') return 'worker error';
  return terminal;
}

export function ReplayCompletenessBanner({
  completeness,
  taskId,
  detail,
}: ReplayCompletenessBannerProps) {
  const first = formatTs(completeness.firstTs);
  const last = formatTs(completeness.lastTs);

  // Happy path — single dim meta strip; the TurnHeader carries the real
  // "Done" status. We keep timestamps + event count because they remain
  // useful for power users even when nothing went wrong.
  if (completeness.kind === 'complete') {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-dim/85 font-mono tabular-nums">
        {taskId && <span title="Task id">{taskId}</span>}
        <span title="Recorded events">{completeness.eventCount} events</span>
        {first && <span title="First event">{first}</span>}
        {last && last !== first && <span title="Last event">→ {last}</span>}
      </div>
    );
  }

  const t = TONES[completeness.kind];
  const Icon = t.Icon;
  const terminalLabel = describeTerminal(completeness.kind, completeness.terminalEventType);

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2',
        t.bg,
        t.border,
      )}
    >
      <Icon size={13} className={cn('mt-0.5 shrink-0', t.tone)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className={cn('text-[12px] font-medium', t.tone)}>
          {t.label}
          {terminalLabel && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-text-dim font-mono">
              {terminalLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-text-dim font-mono tabular-nums">
          {taskId && <span title="Task id">task: {taskId}</span>}
          <span title="Recorded events">{completeness.eventCount} events</span>
          {first && <span title="First event">{first}</span>}
          {last && last !== first && <span title="Last event">→ {last}</span>}
        </div>
        {detail && (
          <div className="text-[11px] text-text-dim wrap-break-word">{detail}</div>
        )}
      </div>
    </div>
  );
}
