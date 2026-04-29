import { useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useApprovals, useResolveApproval } from '@/hooks/use-approvals';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm';
import { toast } from '@/store/toast-store';
import { timeAgo } from '@/lib/utils';

type Decision = 'approved' | 'rejected';

export default function Approvals() {
  const approvalsQuery = useApprovals();
  const resolve = useResolveApproval();

  const rows = approvalsQuery.data ?? [];

  const [pending, setPending] = useState<{
    taskId: string;
    decision: Decision;
    reason: string;
    riskScore: number;
  } | null>(null);

  const handleConfirm = async () => {
    if (!pending) return;
    try {
      await resolve.mutateAsync({ taskId: pending.taskId, decision: pending.decision });
      toast.success(`Task ${pending.decision}`);
      setPending(null);
    } catch {
      /* toast already shown by mutation */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description={`${rows.length} task${rows.length !== 1 ? 's' : ''} awaiting human sign-off`}
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => approvalsQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} className={approvalsQuery.isFetching ? 'animate-spin' : ''} />
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
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Risk</th>
                <th className="px-4 py-2">Requested</th>
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
                  <td className="px-4 py-2 text-text truncate max-w-[28rem]" title={row.reason}>
                    {row.reason}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    <RiskBadge score={row.riskScore} />
                  </td>
                  <td className="px-4 py-2 text-text-dim tabular-nums">
                    {row.requestedAt ? timeAgo(row.requestedAt) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 text-xs rounded bg-green/10 text-green border border-green/30 hover:bg-green/20"
                        onClick={() =>
                          setPending({
                            taskId: row.taskId,
                            decision: 'approved',
                            reason: row.reason,
                            riskScore: row.riskScore,
                          })
                        }
                        disabled={resolve.isPending}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 text-xs rounded bg-red/10 text-red border border-red/30 hover:bg-red/20"
                        onClick={() =>
                          setPending({
                            taskId: row.taskId,
                            decision: 'rejected',
                            reason: row.reason,
                            riskScore: row.riskScore,
                          })
                        }
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
            <div className="space-y-2">
              <div>
                Task <span className="font-mono text-xs">{pending.taskId}</span> will be
                {pending.decision === 'approved' ? ' executed.' : ' cancelled.'}
              </div>
              <div className="rounded border border-border bg-bg/50 p-2 text-xs space-y-1">
                <div>
                  <span className="text-text-dim">Reason: </span>
                  <span className="text-text">{pending.reason}</span>
                </div>
                <div>
                  <span className="text-text-dim">Risk score: </span>
                  <span className="font-mono text-text">{pending.riskScore.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-xs text-text-dim">This action is logged and audited.</div>
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

function RiskBadge({ score }: { score: number }) {
  const tone =
    score >= 0.85 ? 'bg-red/10 text-red border-red/30'
    : score >= 0.7 ? 'bg-yellow/10 text-yellow border-yellow/30'
    : 'bg-white/5 text-text-dim border-border';
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${tone} font-mono`}>
      {score.toFixed(2)}
    </span>
  );
}
