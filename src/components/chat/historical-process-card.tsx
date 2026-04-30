/**
 * Historical process card — past-task counterpart of the live
 * `StreamingBubble` debug surfaces.
 *
 * Lazy-loads the persisted bus event log for `taskId` via `useTaskEvents`,
 * replays it through the same `reduceTurn` reducer the live stream uses,
 * and reuses the existing surface components (`PlanSurface`,
 * `ProcessTimeline`, `DiagnosticsDrawer`) to render the result. No
 * duplicate rendering paths.
 *
 * Returns null when the backend reports no recorder is wired
 * (`unsupported`) so the message bubble degrades gracefully to "no
 * historical process available".
 */
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { AgentTimelineCard } from './agent-timeline-card';
import { DiagnosticsDrawer } from './diagnostics-drawer';
import { PlanSurface } from './plan-surface';
import { ProcessTimeline } from './process-timeline';
import { useTaskEvents } from '@/hooks/use-task-events';

interface HistoricalProcessCardProps {
  taskId: string;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg/15 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">
          Process replay
        </span>
        <span className="text-[10px] text-text-dim/70">persisted</span>
      </div>
      {children}
    </div>
  );
}

function StateRow({
  icon,
  tone,
  text,
  spin,
}: {
  icon: React.ReactNode;
  tone: 'dim' | 'red';
  text: string;
  spin?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs ${tone === 'red' ? 'text-red' : 'text-text-dim'}`}
    >
      <span className={spin ? 'animate-spin' : undefined}>{icon}</span>
      <span className={tone === 'dim' ? 'italic' : undefined}>{text}</span>
    </div>
  );
}

export function HistoricalProcessCard({ taskId }: HistoricalProcessCardProps) {
  const { turn, isLoading, error, unsupported } = useTaskEvents(taskId, { enabled: true });

  if (unsupported) {
    return (
      <CardShell>
        <StateRow
          icon={<Inbox size={12} />}
          tone="dim"
          text="Process history unavailable (server has no event log wired)."
        />
      </CardShell>
    );
  }
  if (isLoading) {
    return (
      <CardShell>
        <StateRow icon={<Loader2 size={12} />} tone="dim" text="Loading process…" spin />
      </CardShell>
    );
  }
  if (error) {
    return (
      <CardShell>
        <StateRow
          icon={<AlertTriangle size={12} />}
          tone="red"
          text={`Failed to load process history: ${String((error as Error)?.message ?? error)}`}
        />
      </CardShell>
    );
  }
  if (!turn) {
    return (
      <CardShell>
        <StateRow icon={<Inbox size={12} />} tone="dim" text="No persisted events for this task." />
      </CardShell>
    );
  }

  // Force "completed" status on the replayed turn so the surfaces don't
  // render running spinners on a finished task. The reducer already sets
  // `status='done'` when it sees `task:complete`, but we belt-and-brace
  // here in case a task ended without that event being persisted (manifest
  // drift, tasks that ran before `task:complete` was added to the recorded
  // allow-list, abort/timeout paths). Same brace for orphan plan steps —
  // the `task:complete` reducer normally sweeps `pending|running` to `done`,
  // so without it any unfinished step keeps spinning indefinitely.
  const isTransitional =
    turn.status === 'running' ||
    turn.status === 'awaiting-approval' ||
    turn.status === 'awaiting-human-input';
  const finishedTurn = isTransitional
    ? {
        ...turn,
        status: 'done' as const,
        planSteps: turn.planSteps.map((s) =>
          s.status === 'pending' || s.status === 'running'
            ? { ...s, status: 'done' as const, finishedAt: s.finishedAt ?? Date.now() }
            : s,
        ),
      }
    : turn;

  return (
    <CardShell>
      <div className="space-y-2">
        <AgentTimelineCard
          steps={finishedTurn.planSteps}
          toolCalls={finishedTurn.toolCalls}
          isLive={false}
        />
        <PlanSurface turn={finishedTurn} />
        <ProcessTimeline turn={finishedTurn} />
        <DiagnosticsDrawer turn={finishedTurn} />
      </div>
    </CardShell>
  );
}
