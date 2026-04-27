import { useEffect, useState } from 'react';
import { Check, ShieldQuestion, X } from 'lucide-react';
import { useResolveWorkflowApproval } from '@/hooks/use-approvals';
import type { PendingApproval } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

interface WorkflowApprovalCardProps {
  sessionId: string;
  pending: PendingApproval;
  /**
   * Default approval timeout enforced by the backend (`approvalTimeoutMs`,
   * 600s by default). Used for the elapsed bar so users can see the deadline
   * before the workflow self-rejects.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Inline "Approve / Reject" prompt for the Phase E workflow gate.
 *
 * Wired by streaming-bubble whenever `turn.pendingApproval` is set. The
 * backend pauses the workflow executor at this gate (`workflow:plan_ready`
 * with `awaitingApproval=true`).
 *
 * Timeout semantics: when the countdown hits 0, the backend treats an
 * absent user as implicit approval and emits `workflow:plan_approved`
 * automatically — the card surfaces this as "Auto-approving…" rather than
 * a rejection.
 *
 * The mutation only POSTs the decision; tear-down comes from the matching
 * `workflow:plan_approved` / `workflow:plan_rejected` SSE event — the
 * reducer clears `pendingApproval` and unmounts this card.
 */
export function WorkflowApprovalCard({
  sessionId,
  pending,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WorkflowApprovalCardProps) {
  const resolve = useResolveWorkflowApproval();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.max(0, now - pending.at);
  const remaining = Math.max(0, timeoutMs - elapsed);
  const remainingPct = Math.min(100, (elapsed / timeoutMs) * 100);
  const remainingLabel = formatRemaining(remaining);

  const busy = resolve.isPending;

  const onApprove = () => {
    if (busy) return;
    resolve.mutate({ sessionId, taskId: pending.taskId, decision: 'approved' });
  };
  const onReject = () => {
    if (busy) return;
    resolve.mutate({
      sessionId,
      taskId: pending.taskId,
      decision: 'rejected',
      reason: 'User rejected from chat',
    });
  };

  return (
    <div className="bg-yellow/5 border border-yellow/30 rounded-md p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <ShieldQuestion size={14} className="text-yellow shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-yellow font-medium">Approve workflow plan?</div>
          {pending.goal && (
            <div className="text-xs text-text-dim mt-0.5 wrap-break-word">{pending.goal}</div>
          )}
        </div>
        <span
          className="text-[10px] text-text-dim font-mono tabular-nums shrink-0"
          title={`Approval window: ${formatRemaining(timeoutMs)}`}
        >
          {remainingLabel}
        </span>
      </div>

      {pending.steps.length > 0 && (
        <ol className="space-y-1 pl-1">
          {pending.steps.map((step, i) => (
            <li
              key={step.id}
              className="flex items-start gap-2 text-xs text-text wrap-break-word"
            >
              <span className="text-text-dim font-mono tabular-nums shrink-0 w-5">
                {i + 1}.
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-text">{step.description}</span>
                {step.strategy && step.strategy !== 'auto' && (
                  <span className="ml-1.5 text-[10px] text-text-dim font-mono">
                    [{step.strategy}]
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Countdown bar */}
      <div
        className="h-1 w-full bg-yellow/10 rounded overflow-hidden"
        aria-hidden="true"
      >
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-linear',
            remainingPct < 75 ? 'bg-yellow/60' : 'bg-red/70',
          )}
          style={{ width: `${remainingPct}%` }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || remaining <= 0}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-green/15 hover:bg-green/25 border border-green/40 text-green',
            (busy || remaining <= 0) && 'opacity-50 cursor-not-allowed hover:bg-green/15',
          )}
        >
          <Check size={11} /> Approve & run
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy || remaining <= 0}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
            'bg-red/10 hover:bg-red/20 border border-red/40 text-red',
            (busy || remaining <= 0) && 'opacity-50 cursor-not-allowed hover:bg-red/10',
          )}
        >
          <X size={11} /> Reject
        </button>
        {remaining <= 0 && (
          <span className="text-[11px] text-yellow">
            Window expired — auto-approving…
          </span>
        )}
      </div>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}
