import { useEffect, useState } from 'react';
import { Check, ShieldAlert, ShieldQuestion, X } from 'lucide-react';
import { useResolveWorkflowApproval } from '@/hooks/use-approvals';
import type { PendingApproval } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

interface WorkflowApprovalCardProps {
  sessionId: string;
  pending: PendingApproval;
  /**
   * Optional hard override for the countdown duration. When omitted the
   * card uses `pending.timeoutMs` from the backend (preferred) and falls
   * back to the agent-discretion default. Kept on the props for parity with
   * existing call sites that may want to force a window in test setups.
   */
  timeoutMs?: number;
  /**
   * Historical replay mode. Hides the approve/reject buttons and the
   * countdown bar; the card becomes a "approval was requested" record
   * showing the plan that was on the table when the gate fired. The
   * resolution itself is rendered separately by the replay path because
   * `pendingApproval` is cleared by the reducer when the gate resolves —
   * so seeing this card in historical mode means the recording stopped
   * mid-gate.
   */
  readOnly?: boolean;
}

/**
 * Default review window for `agent-discretion` mode (3 min). Pinned to the
 * backend's `DEFAULT_APPROVAL_TIMEOUT_MS` — keep them in sync.
 */
const DEFAULT_AGENT_DISCRETION_TIMEOUT_MS = 180_000;

/**
 * Inline approval prompt for the workflow gate.
 *
 * Two modes (driven by `pending.approvalMode`):
 *   - 'agent-discretion': the plan is clear; the user has a 3-minute review
 *     window. If they don't respond, Vinyan auto-decides (read-only plans
 *     get approved; mutating / destructive plans get rejected). The card
 *     shows the countdown + an "auto-deciding…" state at the deadline.
 *   - 'human-required':   the plan asks the user to choose / confirm /
 *     clarify. Vinyan CANNOT auto-decide. The card hides the auto-approval
 *     copy entirely; approve/reject buttons remain enabled until the
 *     backend tears the gate down (via `workflow:plan_approved` /
 *     `workflow:plan_rejected`).
 *
 * The mutation only POSTs the decision; tear-down comes from the matching
 * `workflow:plan_approved` / `workflow:plan_rejected` SSE event — the
 * reducer clears `pendingApproval` and unmounts this card.
 */
export function WorkflowApprovalCard({
  sessionId,
  pending,
  timeoutMs: timeoutOverride,
  readOnly = false,
}: WorkflowApprovalCardProps) {
  const resolve = useResolveWorkflowApproval();
  const [now, setNow] = useState(() => Date.now());

  const approvalMode: 'agent-discretion' | 'human-required' =
    pending.approvalMode ?? 'agent-discretion';
  const isHumanRequired = approvalMode === 'human-required';
  // Backend is the source of truth — pending.timeoutMs is the window the
  // executor will honor before timing out the gate. Only fall through to
  // a frontend default when neither prop nor pending carries one.
  const effectiveTimeoutMs =
    timeoutOverride ?? pending.timeoutMs ?? DEFAULT_AGENT_DISCRETION_TIMEOUT_MS;

  useEffect(() => {
    if (readOnly) return; // no live ticking in historical mode
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [readOnly]);

  const elapsed = Math.max(0, now - pending.at);
  const remaining = Math.max(0, effectiveTimeoutMs - elapsed);
  const remainingPct = Math.min(100, (elapsed / effectiveTimeoutMs) * 100);
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

  // Mode-specific palette + copy. Human-required uses a sterner red accent
  // because the workflow CANNOT proceed without the user's call.
  const accent = isHumanRequired
    ? {
        wrap: 'bg-red/5 border-red/30',
        icon: <ShieldAlert size={14} className="text-red shrink-0 mt-0.5" />,
        title: 'text-red',
        bar: { lit: 'bg-red/60', dim: 'bg-red/10' },
      }
    : {
        wrap: 'bg-yellow/5 border-yellow/30',
        icon: <ShieldQuestion size={14} className="text-yellow shrink-0 mt-0.5" />,
        title: 'text-yellow',
        bar: { lit: 'bg-yellow/60', dim: 'bg-yellow/10' },
      };
  const titleText = readOnly
    ? isHumanRequired
      ? 'Human decision was required'
      : 'Approval was requested'
    : isHumanRequired
      ? 'Human decision required'
      : 'Review workflow plan';
  const subtitle = readOnly
    ? 'Recording stopped before the gate resolved.'
    : isHumanRequired
      ? 'Vinyan cannot continue without your decision.'
      : `Vinyan will auto-decide after ${formatRemaining(effectiveTimeoutMs)} if you do not respond.`;
  // Human-required: buttons stay enabled until the backend tears the card
  // down. Agent-discretion: lock buttons once the timer expires (Vinyan
  // is auto-deciding — the user's button press would race the auto verdict).
  const buttonsDisabled = busy || (!isHumanRequired && remaining <= 0);

  return (
    <div className={cn('border rounded-md p-3 space-y-2.5', accent.wrap)}>
      <div className="flex items-start gap-2">
        {accent.icon}
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-medium', accent.title)}>{titleText}</div>
          <div className="text-xs text-text-dim mt-0.5">{subtitle}</div>
          {pending.goal && (
            <div className="text-xs text-text mt-1 wrap-break-word">{pending.goal}</div>
          )}
        </div>
        {!isHumanRequired && (
          <span
            className="text-[10px] text-text-dim font-mono tabular-nums shrink-0"
            title={`Approval window: ${formatRemaining(effectiveTimeoutMs)}`}
          >
            {remainingLabel}
          </span>
        )}
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

      {/* Countdown bar — agent-discretion only. Human-required has no
          deadline-driven progress; showing one would imply an auto verdict.
          Historical replay never shows a countdown — there is nothing to
          count down toward. */}
      {!isHumanRequired && !readOnly && (
        <div
          className={cn('h-1 w-full rounded overflow-hidden', accent.bar.dim)}
          aria-hidden="true"
        >
          <div
            className={cn(
              'h-full transition-all duration-1000 ease-linear',
              remainingPct < 75 ? accent.bar.lit : 'bg-red/70',
            )}
            style={{ width: `${remainingPct}%` }}
          />
        </div>
      )}

      {!readOnly ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onApprove}
            disabled={buttonsDisabled}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
              'bg-green/15 hover:bg-green/25 border border-green/40 text-green',
              buttonsDisabled && 'opacity-50 cursor-not-allowed hover:bg-green/15',
            )}
          >
            <Check size={11} /> Approve & run
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={buttonsDisabled}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
              'bg-red/10 hover:bg-red/20 border border-red/40 text-red',
              buttonsDisabled && 'opacity-50 cursor-not-allowed hover:bg-red/10',
            )}
          >
            <X size={11} /> Reject
          </button>
          {!isHumanRequired && remaining <= 0 && (
            <span className="text-[11px] text-yellow">
              Window expired — Vinyan is deciding…
            </span>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-text-dim italic">Read-only — no decision recorded.</div>
      )}
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
