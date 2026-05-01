import { Copy, ExternalLink, Loader2, MessageSquare, Repeat } from 'lucide-react';
import type { TaskNeedsActionType, TaskSummary } from '@/lib/api-client';
import { ActionMenu } from '@/components/ui/action-menu';
import { StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NeedsActionBadge } from './needs-action-badge';

/**
 * `failed` and `timeout` needs-action types duplicate the StatusBadge —
 * the operator already sees the red `failed` / `timeout` chip from the
 * status column, so re-printing the same word as a needs-action pill
 * just adds noise. We hide those in the row while still surfacing them
 * in the drawer (where context warrants a separate action affordance).
 */
const ROW_HIDDEN_NEEDS_ACTION = new Set<TaskNeedsActionType>(['failed', 'timeout']);

interface TasksTableProps {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onCancel: (task: TaskSummary) => void;
  onRetry: (task: TaskSummary) => void;
  onArchive: (task: TaskSummary) => void;
  onUnarchive: (task: TaskSummary) => void;
  onCopyId: (task: TaskSummary) => void;
  loading: boolean;
}

/**
 * Dense list/table hybrid for the operations console. Each row carries
 * just enough metadata for triage (status, needs-action, goal, route +
 * model + tokens, created/updated, retry indicator). The detail drawer
 * owns everything else.
 */
export function TasksTable({
  tasks,
  selectedTaskId,
  onSelect,
  onCancel,
  onRetry,
  onArchive,
  onUnarchive,
  onCopyId,
  loading,
}: TasksTableProps) {
  if (loading && tasks.length === 0) {
    return (
      <div className="bg-surface rounded-md border border-border py-8 flex items-center justify-center text-xs text-text-dim">
        <Loader2 size={14} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-surface rounded-md border border-border py-8 text-center text-xs text-text-dim">
        No tasks match the current filters.
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-md border border-border overflow-hidden">
      <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_96px_140px_72px_56px_32px] gap-3 px-3 py-1.5 border-b border-border text-[10px] uppercase tracking-wider text-text-dim">
        <span>Task</span>
        <span>Status</span>
        <span>Route / model</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Updated</span>
        <span />
      </div>
      <ul className="divide-y divide-border/50">
        {tasks.map((task) => (
          <TaskRow
            key={task.taskId}
            task={task}
            selected={task.taskId === selectedTaskId}
            onSelect={() => onSelect(task.taskId)}
            onCancel={() => onCancel(task)}
            onRetry={() => onRetry(task)}
            onArchive={() => onArchive(task)}
            onUnarchive={() => onUnarchive(task)}
            onCopyId={() => onCopyId(task)}
          />
        ))}
      </ul>
    </div>
  );
}

interface TaskRowProps {
  task: TaskSummary;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onCopyId: () => void;
}

function TaskRow({
  task,
  selected,
  onSelect,
  onCancel,
  onRetry,
  onArchive,
  onUnarchive,
  onCopyId,
}: TaskRowProps) {
  const updatedRel = formatRelative(task.updatedAt);
  const goal = task.goal ?? task.errorSummary ?? 'No description';
  const isRunning = task.status === 'running' || task.status === 'pending';
  const isRetryable = !isRunning && (
    task.status === 'failed' ||
    task.status === 'timeout' ||
    task.status === 'escalated' ||
    task.status === 'partial' ||
    task.status === 'cancelled'
  );
  const isArchived = task.archivedAt != null;

  const showNeedsActionBadge = !ROW_HIDDEN_NEEDS_ACTION.has(task.needsActionType);

  return (
    <li
      className={cn(
        'group grid grid-cols-[minmax(220px,1fr)_96px_140px_72px_56px_32px] gap-3 px-3 py-1.5 cursor-pointer transition-colors items-center',
        selected ? 'bg-accent/10' : 'hover:bg-white/[0.02]',
      )}
      onClick={onSelect}
      role="row"
    >
      {/* Goal block (lead-in icon + goal + meta) */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && (
            <Loader2 size={11} className="animate-spin text-accent shrink-0" aria-label="Running" />
          )}
          <span className="text-sm text-text truncate" title={goal}>
            {goal}
          </span>
          {showNeedsActionBadge && <NeedsActionBadge type={task.needsActionType} compact />}
          {isArchived && (
            <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border rounded px-1 shrink-0">
              archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-dim font-mono truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyId();
            }}
            className="hover:text-text inline-flex items-center gap-1 shrink-0"
            title={task.taskId}
          >
            {task.taskId.slice(0, 8)} <Copy size={9} />
          </button>
          {task.sessionId && (
            <a
              href={`/sessions/${task.sessionId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-accent hover:underline shrink-0"
            >
              <MessageSquare size={9} /> session
            </a>
          )}
          {task.parentTaskId && (
            <span className="inline-flex items-center gap-1 shrink-0" title={task.parentTaskId}>
              <Repeat size={9} /> {task.parentTaskId.slice(0, 6)}
            </span>
          )}
          {task.errorSummary && (
            <span className="text-red truncate" title={task.errorSummary}>
              {task.errorSummary}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center">
        <StatusBadge status={task.status} />
      </div>

      {/* Route + model */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-dim tabular-nums truncate">
        {typeof task.routingLevel === 'number' && (
          <span className="text-text shrink-0">L{task.routingLevel}</span>
        )}
        <span className="truncate" title={task.modelUsed}>
          {task.modelUsed && task.modelUsed !== 'none' ? task.modelUsed : '—'}
        </span>
      </div>

      {/* Tokens */}
      <div className="flex items-center justify-end text-[11px] font-mono text-text-dim tabular-nums">
        {task.tokensConsumed?.toLocaleString() ?? '—'}
      </div>

      {/* Updated */}
      <div className="flex items-center justify-end text-[10px] text-text-dim tabular-nums">
        {updatedRel}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <ActionMenu
          items={[
            ...(isRunning ? [{ label: 'Cancel', onClick: onCancel, danger: true as const }] : []),
            ...(isRetryable ? [{ label: 'Retry', onClick: onRetry }] : []),
            { label: 'Copy task id', onClick: onCopyId },
            ...(task.sessionId
              ? [
                  {
                    label: 'Open session',
                    onClick: () => {
                      if (task.sessionId) window.location.href = `/sessions/${task.sessionId}`;
                    },
                    icon: ExternalLink,
                  },
                ]
              : []),
            ...(isArchived
              ? [{ label: 'Unarchive', onClick: onUnarchive }]
              : [{ label: 'Archive', onClick: onArchive }]),
          ]}
        />
      </div>
    </li>
  );
}

function formatRelative(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
