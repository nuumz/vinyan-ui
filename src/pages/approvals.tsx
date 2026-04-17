import { useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useApprovals, useResolveApproval } from '@/hooks/use-approvals';
import { useTasks } from '@/hooks/use-tasks';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm';
import { toast } from '@/store/toast-store';
import { timeAgo } from '@/lib/utils';

type Decision = 'approved' | 'rejected';

interface PendingRow {
  taskId: string;
  goal?: string;
  submittedAt?: number;
  status?: string;
}

export default function Approvals() {
  const approvalsQuery = useApprovals();
  const tasksQuery = useTasks();
  const resolve = useResolveApproval();

  const pendingIds = approvalsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  const rows: PendingRow[] = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.taskId, t]));
    return pendingIds.map((id) => {
      const t = byId.get(id);
      return {
        taskId: id,
        goal: (t as { goal?: string } | undefined)?.goal,
        status: t?.status,
        submittedAt: (t as { submittedAt?: number } | undefined)?.submittedAt,
      };
    });
  }, [pendingIds, tasks]);

  const [pending, setPending] = useState<{ taskId: string; decision: Decision } | null>(null);

  const handleConfirm = async () => {
    if (!pending) return;
    try {
      await resolve.mutateAsync(pending);
      toast.success(`Task ${pending.decision}`);
      setPending(null);
    } catch {
      /* toast already shown by mutation */
    }
  };

  const isRefetching = approvalsQuery.isFetching || tasksQuery.isFetching;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description={`${rows.length} task${rows.length !== 1 ? 's' : ''} awaiting human sign-off`}
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => {
              approvalsQuery.refetch();
              tasksQuery.refetch();
            }}
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            message="No pending approvals"
            hint="High-risk tasks will appear here when they need sign-off"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Task</th>
                <th className="px-4 py-2">Goal</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.taskId} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={14} className="text-yellow shrink-0" />
                      <span className="font-mono text-xs truncate max-w-[12rem]" title={row.taskId}>
                        {row.taskId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-text-dim truncate max-w-[28rem]">
                    {row.goal ?? <span className="text-text-dim/60">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {row.status ? <StatusBadge status={row.status} /> : <span className="text-text-dim">—</span>}
                  </td>
                  <td className="px-4 py-2 text-text-dim tabular-nums">
                    {row.submittedAt ? timeAgo(row.submittedAt) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 text-xs rounded bg-green/10 text-green border border-green/30 hover:bg-green/20"
                        onClick={() => setPending({ taskId: row.taskId, decision: 'approved' })}
                        disabled={resolve.isPending}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 text-xs rounded bg-red/10 text-red border border-red/30 hover:bg-red/20"
                        onClick={() => setPending({ taskId: row.taskId, decision: 'rejected' })}
                        disabled={resolve.isPending}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => (resolve.isPending ? undefined : setPending(null))}
        onConfirm={handleConfirm}
        title={pending?.decision === 'approved' ? 'Approve task?' : 'Reject task?'}
        description={
          pending ? (
            <div>
              <div>
                Task <span className="font-mono text-xs">{pending.taskId}</span> will be
                {pending.decision === 'approved' ? ' executed.' : ' cancelled.'}
              </div>
              <div className="mt-2 text-xs text-text-dim">This action is logged and audited.</div>
            </div>
          ) : null
        }
        confirmLabel={pending?.decision === 'approved' ? 'Approve' : 'Reject'}
        variant={pending?.decision === 'rejected' ? 'danger' : 'default'}
        busy={resolve.isPending}
      />
    </div>
  );
}
