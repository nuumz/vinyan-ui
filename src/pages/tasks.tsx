import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import {
  useArchiveTask,
  useCancelTask,
  useRetryTask,
  useSubmitTask,
  useTasks,
  useUnarchiveTask,
} from '@/hooks/use-tasks';
import type { ListTasksParams, TaskSummary } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { toast } from '@/store/toast-store';
import { TasksSummaryStrip } from '@/components/tasks/tasks-summary-strip';
import { TasksToolbar } from '@/components/tasks/tasks-toolbar';
import { TasksTable } from '@/components/tasks/tasks-table';
import { TaskDetailDrawer } from '@/components/tasks/task-detail-drawer';

const DEFAULT_TASK_BUDGET = { maxTokens: 50_000, maxDurationMs: 180_000, maxRetries: 3 } as const;
const TIMEOUT_RETRY_BUDGET = { maxTokens: 50_000, maxDurationMs: 240_000, maxRetries: 3 } as const;

type TabId =
  | 'all'
  | 'running'
  | 'needs-action'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'archived';

const TAB_ITEMS: ReadonlyArray<TabItem<TabId>> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'needs-action', label: 'Needs action' },
  { id: 'completed', label: 'Completed' },
  { id: 'partial', label: 'Partial' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'archived', label: 'Archived' },
];

/**
 * Tasks Operations Console.
 *
 * Replaces the legacy `/tasks` simple list. The page is a triage-first
 * surface: summary strip → status tabs → filters → dense list → detail
 * drawer. Process replay reuses the existing `HistoricalProcessCard`
 * (lock-step with the chat bubble) so the drawer's Process tab is
 * structurally identical to the live process view.
 */
export default function Tasks() {
  // ── Filter state ────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [routingLevel, setRoutingLevel] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<'ui' | 'api' | 'all'>('all');
  const [approach, setApproach] = useState('');
  const [hasError, setHasError] = useState(false);
  const [sort, setSort] = useState<NonNullable<ListTasksParams['sort']>>('created-desc');
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState<'reasoning' | 'code'>('reasoning');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params: ListTasksParams = useMemo(() => {
    const next: ListTasksParams = {
      limit: pageSize,
      offset,
      search: search.trim() || undefined,
      source,
      approach: approach.trim() || undefined,
      hasError: hasError || undefined,
      sort,
      routingLevel,
    };
    if (tab === 'running') next.status = ['running', 'pending'];
    else if (tab === 'completed') next.status = ['completed'];
    else if (tab === 'partial') next.status = ['partial', 'uncertain', 'escalated'];
    else if (tab === 'failed') next.status = ['failed', 'timeout'];
    else if (tab === 'cancelled') next.status = ['cancelled'];
    else if (tab === 'needs-action') next.needsAction = 'any';
    else if (tab === 'archived') next.visibility = 'archived';
    return next;
  }, [tab, search, source, approach, hasError, sort, pageSize, offset, routingLevel]);

  const tasksQuery = useTasks(params);
  const submitTask = useSubmitTask();
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();
  const archiveTask = useArchiveTask();
  const unarchiveTask = useUnarchiveTask();

  const tasks = tasksQuery.data?.tasks ?? [];
  const total = tasksQuery.data?.total ?? 0;
  const counts = tasksQuery.data?.counts;
  const selectedTask = useMemo(
    () => tasks.find((t) => t.taskId === selectedId) ?? null,
    [tasks, selectedId],
  );

  const hasActiveFilters =
    !!search.trim() ||
    routingLevel !== undefined ||
    source !== 'all' ||
    !!approach.trim() ||
    hasError ||
    sort !== 'created-desc';

  const clearFilters = () => {
    setSearch('');
    setRoutingLevel(undefined);
    setSource('all');
    setApproach('');
    setHasError(false);
    setSort('created-desc');
    setOffset(0);
  };

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    try {
      await submitTask.mutateAsync({
        goal,
        taskType,
        budget: DEFAULT_TASK_BUDGET,
      });
      setGoal('');
      setShowForm(false);
      toast.success('Task submitted');
    } catch {
      // toast surfaced by mutation
    }
  };

  const handleRetry = (task: TaskSummary) => {
    const retryGoal = task.goal || task.errorSummary || task.result?.answer;
    if (!retryGoal?.trim()) {
      toast.error('Cannot retry: no goal available');
      return;
    }
    retryTask.mutate(
      {
        taskId: task.taskId,
        reason: 'manual-retry-from-tasks-console',
        ...(task.needsActionType === 'timeout' ? { maxDurationMs: TIMEOUT_RETRY_BUDGET.maxDurationMs } : {}),
      },
      {
        onSuccess: () => toast.success('Retry submitted'),
        onError: (err) => {
          // Fall back to a fresh sibling submission when the parent isn't tracked.
          const status = (err as { status?: number } | undefined)?.status;
          if (status === 404) {
            submitTask.mutate({
              goal: retryGoal,
              taskType: task.affectedFiles?.length ? 'code' : 'reasoning',
              targetFiles: task.affectedFiles,
              budget: TIMEOUT_RETRY_BUDGET,
            });
          }
        },
      },
    );
  };

  const handleCancel = (task: TaskSummary) => {
    cancelTask.mutate(task.taskId, {
      onSuccess: () => toast.info('Task cancelled'),
    });
  };

  const handleArchive = (task: TaskSummary) => {
    archiveTask.mutate(task.taskId, { onSuccess: () => toast.info('Task archived') });
  };

  const handleUnarchive = (task: TaskSummary) => {
    unarchiveTask.mutate(task.taskId, { onSuccess: () => toast.info('Task restored') });
  };

  const handleCopyId = async (task: TaskSummary) => {
    try {
      await navigator.clipboard.writeText(task.taskId);
      toast.success('Task id copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="space-y-2 pb-4">
      <PageHeader
        title="Tasks"
        description={`${total} task${total === 1 ? '' : 's'} matching · auto-refreshes via SSE`}
        actions={
          <>
            <button
              type="button"
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
              onClick={() => tasksQuery.refetch()}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={tasksQuery.isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? 'Cancel' : 'New Task'}
            </button>
          </>
        }
      />

      {showForm && (
        <div className="bg-surface rounded-md border border-border p-3 space-y-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-text-dim block mb-1">Goal</label>
            <input
              className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder-gray-500 focus:outline-none focus:border-accent"
              placeholder="Describe the task…"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-bg border border-border rounded px-2 py-1 h-7 text-xs text-text"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as 'reasoning' | 'code')}
              aria-label="Task type"
            >
              <option value="reasoning">Reasoning</option>
              <option value="code">Code</option>
            </select>
            <button
              type="button"
              className="px-3 py-1 h-7 rounded text-xs font-medium bg-green/20 text-green border border-green/30 hover:bg-green/30 transition-colors disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitTask.isPending || !goal.trim()}
            >
              {submitTask.isPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      <TasksSummaryStrip
        counts={counts}
        total={total}
        loading={tasksQuery.isLoading}
        activeTab={tab}
        onSelect={(id) => {
          setTab(id);
          setOffset(0);
        }}
      />

      <Tabs<TabId>
        items={TAB_ITEMS.map((t) => ({
          ...t,
          count:
            t.id === 'needs-action'
              ? counts?.needsActionTotal
              : t.id === 'partial'
                ? (counts?.byStatus?.partial ?? 0) +
                  (counts?.byStatus?.uncertain ?? 0) +
                  (counts?.byStatus?.escalated ?? 0)
                : t.id === 'cancelled'
                  ? counts?.byStatus?.cancelled
                  : undefined,
        }))}
        active={tab}
        onChange={(id) => {
          setTab(id);
          setOffset(0);
        }}
        variant="pills"
      />

      <TasksToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setOffset(0);
        }}
        routingLevel={routingLevel}
        onRoutingLevelChange={(v) => {
          setRoutingLevel(v);
          setOffset(0);
        }}
        source={source}
        onSourceChange={(v) => {
          setSource(v);
          setOffset(0);
        }}
        approach={approach}
        onApproachChange={(v) => {
          setApproach(v);
          setOffset(0);
        }}
        hasError={hasError}
        onHasErrorChange={(v) => {
          setHasError(v);
          setOffset(0);
        }}
        sort={sort}
        onSortChange={(v) => {
          setSort(v);
          setOffset(0);
        }}
        pageSize={pageSize}
        onPageSizeChange={(v) => {
          setPageSize(v);
          setOffset(0);
        }}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <TasksTable
        tasks={tasks}
        selectedTaskId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onCancel={handleCancel}
        onRetry={handleRetry}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onCopyId={handleCopyId}
        loading={tasksQuery.isLoading}
      />

      <Pagination
        total={total}
        offset={offset}
        pageSize={pageSize}
        onPrev={() => setOffset((o) => Math.max(0, o - pageSize))}
        onNext={() => setOffset((o) => o + pageSize)}
      />

      {selectedTask && (
        <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function Pagination({
  total,
  offset,
  pageSize,
  onPrev,
  onNext,
}: {
  total: number;
  offset: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, total);
  const hasPrev = offset > 0;
  const hasNext = end < total;
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-text-dim font-mono tabular-nums">
      <span>
        {start}–{end} of {total}
      </span>
      <button
        type="button"
        disabled={!hasPrev}
        onClick={onPrev}
        className="p-1 rounded border border-border hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        <ChevronLeft size={12} />
      </button>
      <button
        type="button"
        disabled={!hasNext}
        onClick={onNext}
        className="p-1 rounded border border-border hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
