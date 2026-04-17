import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useShadow } from '@/hooks/use-shadow';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { JsonView } from '@/components/ui/json-view';
import { cn, timeAgo } from '@/lib/utils';
import type { ShadowJobSummary, ShadowStatus } from '@/lib/api-client';

type StatusFilter = 'all' | ShadowStatus;

export default function Shadow() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = useShadow(filter === 'all' ? undefined : filter);
  const [selected, setSelected] = useState<ShadowJobSummary | null>(null);

  const data = query.data;
  const jobs = data?.jobs ?? [];
  const counts = data?.counts ?? { pending: 0, running: 0, done: 0, failed: 0 };

  const tabs: ReadonlyArray<TabItem<StatusFilter>> = useMemo(
    () => [
      { id: 'all', label: 'All', count: counts.pending + counts.running + counts.done + counts.failed },
      { id: 'pending', label: 'Pending', count: counts.pending },
      { id: 'running', label: 'Running', count: counts.running },
      { id: 'done', label: 'Done', count: counts.done },
      { id: 'failed', label: 'Failed', count: counts.failed },
    ],
    [counts],
  );

  const loading = !query.data && query.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shadow Queue"
        description="Async validation jobs — test mutations out-of-band before promoting learnings."
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      {data && !data.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <div className="text-sm">Shadow store not configured</div>
          <div className="text-xs text-text-dim mt-1">Requires persistent database to enable.</div>
        </div>
      )}

      {data?.enabled && (
        <>
          <Tabs items={tabs} active={filter} onChange={setFilter} />

          {loading ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {jobs.length === 0 ? (
                <EmptyState
                  message={
                    filter === 'all'
                      ? 'Shadow queue is empty'
                      : `No ${filter} jobs`
                  }
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-dim text-xs">
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Files</th>
                      <th className="px-4 py-2 text-right">Retries</th>
                      <th className="px-4 py-2 text-right">Enqueued</th>
                      <th className="px-4 py-2 text-right">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr
                        key={j.id}
                        onClick={() => setSelected(j)}
                        className={cn(
                          'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                          selected?.id === j.id && 'bg-white/[0.02]',
                        )}
                      >
                        <td className="px-4 py-2 font-mono text-xs truncate max-w-[14rem]" title={j.taskId}>
                          {j.taskId}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={j.status} />
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right">{j.mutationCount}</td>
                        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
                          {j.retryCount}/{j.maxRetries}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                          {timeAgo(j.enqueuedAt)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                          {j.completedAt ? timeAgo(j.completedAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Shadow job"
        subtitle={selected?.id}
        width="xl"
      >
        {selected && <ShadowDetail job={selected} />}
      </DetailDrawer>
    </div>
  );
}

function ShadowDetail({ job }: { job: ShadowJobSummary }) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="Task ID" value={<code className="text-xs">{job.taskId}</code>} />
      <Row label="Status" value={<StatusBadge status={job.status} />} />
      <Row label="Enqueued" value={new Date(job.enqueuedAt).toLocaleString()} />
      {job.startedAt && <Row label="Started" value={new Date(job.startedAt).toLocaleString()} />}
      {job.completedAt && <Row label="Completed" value={new Date(job.completedAt).toLocaleString()} />}
      <Row label="Retries" value={`${job.retryCount}/${job.maxRetries}`} />
      <Row label="Mutations" value={job.mutationCount} />

      {job.mutationFiles.length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Files affected</div>
          <ul className="space-y-1 text-xs font-mono">
            {job.mutationFiles.map((f) => (
              <li key={f} className="bg-bg rounded px-2 py-1 break-all">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.result !== undefined && job.result !== null && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Validation result</div>
          <JsonView data={job.result} collapsibleTopLevel={false} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}
