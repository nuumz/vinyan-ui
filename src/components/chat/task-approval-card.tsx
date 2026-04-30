import { Check, ShieldAlert, X } from 'lucide-react';
import { useResolveApproval } from '@/hooks/use-approvals';
import type { PendingApproval } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface TaskApprovalCardProps {
  pending: PendingApproval;
}

/**
 * Inline card surfaced in the chat session for an A6 high-risk task gate
 * (`ApprovalGate.requestApproval`). Distinct from `WorkflowApprovalCard`
 * which handles the Phase E workflow plan-ready prompt — this one targets
 * the per-task risk gate visible at `/approvals` and on the Tasks page
 * banner. Without rendering it inline the user can park a session with no
 * visible cue that one of their tasks is paused waiting for sign-off; the
 * only way to discover the block was to navigate away to `/approvals`.
 *
 * Backend state is owned by `ApprovalGate` (in-memory). Resolution goes
 * through `POST /api/v1/tasks/:id/approval` (mounted as `useResolveApproval`)
 * which both invalidates `qk.approvals` and `qk.tasks` so the card
 * disappears as soon as the resolve mutation lands.
 */
export function TaskApprovalCard({ pending }: TaskApprovalCardProps) {
  const resolve = useResolveApproval();
  const busy = resolve.isPending;
  const elapsed = Date.now() - pending.requestedAt;

  const onApprove = () => {
    if (busy) return;
    resolve.mutate({ taskId: pending.taskId, decision: 'approved' });
  };
  const onReject = () => {
    if (busy) return;
    resolve.mutate({ taskId: pending.taskId, decision: 'rejected' });
  };

  return (
    <div className="border border-yellow/30 bg-yellow/5 rounded-md p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ShieldAlert size={14} className="text-yellow shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-sm font-medium text-yellow">
            <span>Approval required</span>
            <span className="font-mono text-[10px] text-text-dim normal-case tracking-normal">
              {pending.taskId}
            </span>
            <span className="ml-auto text-[10px] text-text-dim font-mono tabular-nums">
              risk {pending.riskScore.toFixed(2)} · {formatElapsed(elapsed)}
            </span>
          </div>
          <div className="text-xs text-text mt-1 wrap-break-word">{pending.reason}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-green/15 hover:bg-green/25 border border-green/40 text-green',
            busy && 'opacity-50 cursor-not-allowed hover:bg-green/15',
          )}
        >
          <Check size={11} /> Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-red/10 hover:bg-red/20 border border-red/40 text-red',
            busy && 'opacity-50 cursor-not-allowed hover:bg-red/10',
          )}
        >
          <X size={11} /> Reject
        </button>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return m < 60 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
