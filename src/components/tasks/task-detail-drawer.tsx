import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Copy, Download, ExternalLink, Repeat, Square, X } from 'lucide-react';
import {
  useArchiveTask,
  useCancelTask,
  useExportTask,
  useRetryTask,
  useTaskDetail,
  useUnarchiveTask,
} from '@/hooks/use-tasks';
import { useResolveApproval } from '@/hooks/use-approvals';
import { useTaskEvents } from '@/hooks/use-task-events';
import type { TaskSummary } from '@/lib/api-client';
import { resolveDrawerNeedsAction } from '@/lib/drawer-gate-resolution';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/badge';
import { JsonView } from '@/components/ui/json-view';
import { TaskApprovalCard } from '@/components/chat/task-approval-card';
import { HistoricalProcessCard } from '@/components/chat/historical-process-card';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { NeedsActionBadge } from './needs-action-badge';

type TabId = 'overview' | 'process' | 'result' | 'trace' | 'events' | 'actions';

const TABS: ReadonlyArray<TabItem<TabId>> = [
  { id: 'overview', label: 'Overview' },
  { id: 'process', label: 'Process' },
  { id: 'result', label: 'Result' },
  { id: 'trace', label: 'Trace' },
  { id: 'events', label: 'Events' },
  { id: 'actions', label: 'Actions' },
];

interface TaskDetailDrawerProps {
  task: TaskSummary | null;
  onClose: () => void;
}

/**
 * Right-side panel shown when an operator selects a task row. Owns the
 * deep view; the table row stays terse on purpose.
 */
export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const detailQuery = useTaskDetail(task?.taskId);

  if (!task) return null;
  const detail = detailQuery.data;

  return (
    <aside
      className={cn(
        'fixed inset-y-0 right-0 w-full md:w-[40rem] max-w-[95vw] z-30',
        'bg-surface border-l border-border flex flex-col shadow-xl',
      )}
      role="dialog"
      aria-label="Task detail"
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={task.status} />
            {/*
              The drawer is allowed to read the more specific
              `pendingGates` map from the detail response — once it
              loads we trust that authoritative signal over the row's
              cached needsActionType. This stops the header from
              showing "Awaiting decision" when the gate has already
              been resolved (or vice-versa).
            */}
            <NeedsActionBadge
              type={resolveDrawerNeedsAction(task.needsActionType, detail?.pendingGates ?? null)}
            />
            {task.archivedAt != null && (
              <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border rounded px-1">
                archived
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold mt-1 line-clamp-2" title={task.goal}>
            {task.goal ?? task.errorSummary ?? 'No description'}
          </h3>
          <div className="text-[10px] font-mono text-text-dim mt-0.5 truncate" title={task.taskId}>
            {task.taskId}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-text-dim hover:text-text hover:bg-white/5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>

      <Tabs items={TABS} active={tab} onChange={setTab} className="px-3" />

      <div className="flex-1 overflow-auto p-4">
        {tab === 'overview' && <OverviewTab task={task} />}
        {tab === 'process' && <ProcessTab taskId={task.taskId} />}
        {tab === 'result' && <ResultTab task={task} />}
        {tab === 'trace' && <TraceTab task={task} />}
        {tab === 'events' && <EventsTab taskId={task.taskId} />}
        {tab === 'actions' && (
          <ActionsTab
            task={task}
            pendingApproval={detail?.pendingApproval ?? null}
            pendingGates={detail?.pendingGates ?? null}
            onClose={onClose}
          />
        )}
      </div>
    </aside>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-baseline py-1 text-xs">
      <span className="text-text-dim uppercase tracking-wider text-[10px]">{label}</span>
      <span className={cn('text-text', mono && 'font-mono', 'break-words')}>{value}</span>
    </div>
  );
}

function OverviewTab({ task }: { task: TaskSummary }) {
  return (
    <div className="space-y-3">
      <section className="rounded-md border border-border bg-bg/30 px-3 py-2">
        <Field label="Status" value={<span>{task.status}</span>} />
        <Field label="Result" value={task.resultStatus ?? '—'} />
        <Field label="Created" value={new Date(task.createdAt).toLocaleString()} />
        <Field label="Updated" value={new Date(task.updatedAt).toLocaleString()} />
        {task.archivedAt != null && (
          <Field label="Archived" value={new Date(task.archivedAt).toLocaleString()} />
        )}
      </section>

      <section className="rounded-md border border-border bg-bg/30 px-3 py-2">
        <Field label="Task id" value={task.taskId} mono />
        {task.sessionId && (
          <Field
            label="Session"
            value={
              <a className="text-accent hover:underline inline-flex items-center gap-1" href={`/sessions/${task.sessionId}`}>
                {task.sessionId.slice(0, 8)} <ExternalLink size={10} />
              </a>
            }
            mono
          />
        )}
        {task.parentTaskId && <Field label="Parent" value={task.parentTaskId} mono />}
        {(task.retryChildren ?? []).length > 0 && (
          <Field
            label="Children"
            value={(task.retryChildren ?? []).map((c) => c.slice(0, 8)).join(', ')}
            mono
          />
        )}
      </section>

      <section className="rounded-md border border-border bg-bg/30 px-3 py-2">
        {typeof task.routingLevel === 'number' && <Field label="Route" value={`L${task.routingLevel}`} />}
        {task.approach && <Field label="Approach" value={task.approach} />}
        {task.modelUsed && task.modelUsed !== 'none' && <Field label="Model" value={task.modelUsed} mono />}
        {task.workerId && <Field label="Worker" value={task.workerId} mono />}
        {typeof task.tokensConsumed === 'number' && (
          <Field label="Tokens" value={task.tokensConsumed.toLocaleString()} />
        )}
        {typeof task.durationMs === 'number' && task.durationMs > 0 && (
          <Field label="Duration" value={formatDuration(task.durationMs)} />
        )}
        {typeof task.qualityScore === 'number' && (
          <Field label="Quality" value={task.qualityScore.toFixed(2)} />
        )}
      </section>

      {task.affectedFiles && task.affectedFiles.length > 0 && (
        <section className="rounded-md border border-border bg-bg/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Affected files</div>
          <ul className="space-y-0.5 font-mono text-[11px] text-text">
            {task.affectedFiles.map((f) => (
              <li key={f} className="truncate" title={f}>
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      {task.errorSummary && (
        <section className="rounded-md border border-red/30 bg-red/5 px-3 py-2 text-xs text-red wrap-break-word">
          {task.errorSummary}
        </section>
      )}
    </div>
  );
}

function ProcessTab({ taskId }: { taskId: string }) {
  // Reuses the same surface the chat bubble uses for past tasks — the
  // single source-of-truth for historical replay so the operations
  // console doesn't fork a parallel renderer.
  return <HistoricalProcessCard taskId={taskId} />;
}

function ResultTab({ task }: { task: TaskSummary }) {
  const result = task.result;
  if (!result) {
    return <div className="text-xs text-text-dim italic">No result envelope yet.</div>;
  }
  return (
    <div className="space-y-3">
      {result.answer && (
        <section className="rounded-md border border-border bg-bg/30 px-3 py-2 text-sm whitespace-pre-wrap">
          {result.answer}
        </section>
      )}
      {result.escalationReason && (
        <section className="rounded-md border border-yellow/30 bg-yellow/5 px-3 py-2 text-xs text-yellow">
          Escalation: {result.escalationReason}
        </section>
      )}
      {result.mutations && result.mutations.length > 0 && (
        <section className="rounded-md border border-border bg-bg/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Mutations</div>
          <ul className="space-y-1">
            {result.mutations.map((m, i) => (
              <li key={i} className="text-xs">
                <span className="font-mono text-text">{m.file}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.qualityScore && (
        <Field
          label="Quality"
          value={`${result.qualityScore.composite.toFixed(2)} (${result.qualityScore.dimensionsAvailable}D ${result.qualityScore.phase})`}
        />
      )}
    </div>
  );
}

function TraceTab({ task }: { task: TaskSummary }) {
  const trace = task.result?.trace;
  if (!trace) {
    return <div className="text-xs text-text-dim italic">No trace recorded.</div>;
  }
  return (
    <div className="space-y-3">
      <JsonView data={trace as unknown} />
    </div>
  );
}

function EventsTab({ taskId }: { taskId: string }) {
  const { events, isLoading, unsupported, error } = useTaskEvents(taskId);

  if (unsupported) {
    return (
      <div className="text-xs text-text-dim italic">
        Event recorder not wired. Re-run with a database to see persisted events.
      </div>
    );
  }
  if (isLoading) {
    return <div className="text-xs text-text-dim">Loading events…</div>;
  }
  if (error) {
    return <div className="text-xs text-red">Failed to load events: {String((error as Error).message)}</div>;
  }
  if (events.length === 0) {
    return <div className="text-xs text-text-dim italic">No persisted events for this task.</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
        {events.length} event{events.length === 1 ? '' : 's'}
      </div>
      <ul className="space-y-1">
        {events.map((ev) => (
          <li key={ev.id} className="rounded border border-border bg-bg/30 px-2 py-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-accent truncate">{ev.eventType}</span>
              <span className="text-text-dim font-mono tabular-nums shrink-0">{new Date(ev.ts).toLocaleTimeString()}</span>
            </div>
            <details className="mt-0.5">
              <summary className="text-[10px] text-text-dim cursor-pointer">payload</summary>
              <pre className="text-[10px] font-mono text-text mt-1 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(ev.payload, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionsTab({
  task,
  pendingApproval,
  pendingGates,
  onClose,
}: {
  task: TaskSummary;
  pendingApproval: { riskScore: number; reason: string; requestedAt: number } | null;
  pendingGates: { partialDecision: boolean; humanInput: boolean; approval: boolean } | null;
  onClose: () => void;
}) {
  const cancel = useCancelTask();
  const retry = useRetryTask();
  const archive = useArchiveTask();
  const unarchive = useUnarchiveTask();
  const exportMutation = useExportTask();
  const resolveApproval = useResolveApproval();

  const isRunning = task.status === 'running' || task.status === 'pending';
  const isRetryable = !isRunning && (
    task.status === 'failed' ||
    task.status === 'timeout' ||
    task.status === 'escalated' ||
    task.status === 'partial' ||
    task.status === 'cancelled'
  );
  const isArchived = task.archivedAt != null;

  return (
    <div className="space-y-4">
      {pendingApproval && (
        <TaskApprovalCard
          pending={{ taskId: task.taskId, ...pendingApproval }}
        />
      )}

      <section className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">Lifecycle</div>
        <div className="flex flex-wrap gap-2">
          {isRunning && (
            <ActionButton
              icon={Square}
              label="Cancel running task"
              tone="danger"
              busy={cancel.isPending}
              onClick={() => {
                cancel.mutate(task.taskId, {
                  onSuccess: () => {
                    toast.info('Task cancelled');
                  },
                });
              }}
            />
          )}
          {isRetryable && (
            <ActionButton
              icon={Repeat}
              label="Retry"
              busy={retry.isPending}
              onClick={() => {
                retry.mutate(
                  { taskId: task.taskId, reason: 'manual-retry-from-tasks-console' },
                  {
                    onSuccess: () => toast.success('Retry submitted'),
                  },
                );
              }}
            />
          )}
          {!isArchived ? (
            <ActionButton
              icon={Archive}
              label="Archive"
              busy={archive.isPending}
              onClick={() => {
                archive.mutate(task.taskId, {
                  onSuccess: () => {
                    toast.info('Task archived');
                    onClose();
                  },
                });
              }}
            />
          ) : (
            <ActionButton
              icon={ArchiveRestore}
              label="Unarchive"
              busy={unarchive.isPending}
              onClick={() => unarchive.mutate(task.taskId, { onSuccess: () => toast.info('Task restored') })}
            />
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">Navigation & data</div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            icon={Copy}
            label="Copy task id"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(task.taskId);
                toast.success('Task id copied');
              } catch {
                toast.error('Could not copy');
              }
            }}
          />
          {task.sessionId && (
            <ActionButton
              icon={ExternalLink}
              label="Open session"
              onClick={() => {
                if (task.sessionId) window.location.href = `/sessions/${task.sessionId}`;
              }}
            />
          )}
          <ActionButton
            icon={Download}
            label="Export JSON"
            busy={exportMutation.isPending}
            onClick={() => {
              exportMutation.mutate(task.taskId, {
                onSuccess: (data) => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `task-${task.taskId.slice(0, 8)}.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  toast.success('Export downloaded');
                },
              });
            }}
          />
        </div>
      </section>

      {!pendingApproval && pendingGates?.partialDecision && (
        <section className="rounded-md border border-yellow/30 bg-yellow/5 px-3 py-3 space-y-2">
          <div className="text-xs text-yellow font-medium">Awaiting decision · partial result</div>
          <p className="text-[11px] text-text leading-relaxed">
            One sub-agent failed but the others delivered usable output. The workflow paused waiting
            for you to choose how to handle the partial result. The task is{' '}
            <span className="font-mono">partial</span>, not <span className="font-mono">failed</span>.
          </p>
          <ul className="text-[11px] text-text-dim list-disc list-inside space-y-0.5">
            <li>
              <span className="text-text font-medium">Continue</span> — ship the partial result
              (use the responses from agents that succeeded).
            </li>
            <li>
              <span className="text-text font-medium">Abort</span> — stop the task and surface the
              partial-failure reason.
            </li>
          </ul>
          {task.sessionId && (
            <a
              href={`/sessions/${task.sessionId}`}
              className="inline-flex items-center gap-1 text-accent text-xs hover:underline"
            >
              Resolve in session <ExternalLink size={11} />
            </a>
          )}
        </section>
      )}

      {!pendingApproval && pendingGates?.humanInput && (
        <section className="rounded-md border border-blue/30 bg-blue/5 px-3 py-2 text-xs text-text">
          <div className="text-blue font-medium mb-1">Workflow asked a question</div>
          <p className="text-[11px] text-text-dim mb-2">
            Open the originating session to type your answer. The workflow will resume as soon as
            your reply lands.
          </p>
          {task.sessionId && (
            <a
              href={`/sessions/${task.sessionId}`}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Open session <ExternalLink size={11} />
            </a>
          )}
        </section>
      )}

      {!pendingApproval &&
        !pendingGates?.partialDecision &&
        !pendingGates?.humanInput &&
        task.needsActionType === 'stale-running' && (
          <section className="rounded-md border border-yellow/30 bg-yellow/5 px-3 py-2 text-xs text-yellow">
            This task hasn't reported progress in over 30 minutes. Cancel it if it's stuck.
          </section>
        )}

      {!pendingApproval &&
        !pendingGates?.partialDecision &&
        !pendingGates?.humanInput &&
        task.needsActionType === 'coding-cli-approval' && (
          <section className="rounded-md border border-yellow/30 bg-yellow/5 px-3 py-2 text-xs text-yellow">
            External coding CLI is waiting for an approval. Open the session to resolve.
          </section>
        )}

      {pendingApproval && (
        <section className="text-[11px] text-text-dim">
          Resolve the approval above to clear the gate.
          <button
            type="button"
            className="ml-2 text-accent hover:underline"
            disabled={resolveApproval.isPending}
            onClick={() =>
              resolveApproval.mutate({ taskId: task.taskId, decision: 'approved' })
            }
          >
            <Check size={11} className="inline mr-1" /> approve
          </button>
        </section>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  busy?: boolean;
  tone?: 'danger' | 'default';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors',
        tone === 'danger'
          ? 'bg-red/10 hover:bg-red/20 border-red/40 text-red'
          : 'bg-surface hover:bg-white/5 border-border text-text',
        busy && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Icon size={11} /> {label}
    </button>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}
