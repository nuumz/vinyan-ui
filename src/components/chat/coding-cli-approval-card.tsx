import { useState } from 'react';
import { Check, ShieldAlert, ShieldCheck, ShieldQuestion, Terminal, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import type { CodingCliApprovalEntry } from '@/hooks/coding-cli-state';
import { providerLabel } from './coding-cli-shared';

interface CodingCliApprovalCardProps {
  codingCliSessionId: string;
  providerId: 'claude-code' | 'github-copilot';
  pending: CodingCliApprovalEntry;
}

const SCOPE_ICON: Record<CodingCliApprovalEntry['scope'], typeof ShieldAlert> = {
  git: ShieldAlert,
  shell: Terminal,
  edit: ShieldQuestion,
  tool: ShieldCheck,
  unknown: ShieldQuestion,
};

const SCOPE_LABEL: Record<CodingCliApprovalEntry['scope'], string> = {
  git: 'git mutation',
  shell: 'shell command',
  edit: 'file edit',
  tool: 'tool invocation',
  unknown: 'unknown action',
};

/**
 * Inline approval prompt for an external CLI permission request.
 *
 * The CLI raised a prompt; Vinyan's policy chain decided whether to
 * auto-approve or require the human. When `policyDecision === 'require-human'`,
 * this card is rendered with both buttons enabled. When the policy
 * already auto-resolved, this card is rendered briefly as an audit trail —
 * the underlying state's `pendingApproval` is already cleared by the
 * `coding-cli:approval_resolved` event before the user sees it.
 *
 * Calls POST /coding-cli/sessions/:id/{approve|reject}. The backend
 * resolves the gate and emits `coding-cli:approval_resolved`, which the
 * reducer uses to tear down this card.
 */
export function CodingCliApprovalCard({
  codingCliSessionId,
  providerId,
  pending,
}: CodingCliApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const isHuman = pending.policyDecision === 'require-human';
  const Icon = SCOPE_ICON[pending.scope];

  const onResolve = async (decision: 'approved' | 'rejected') => {
    if (busy) return;
    setBusy(true);
    try {
      if (decision === 'approved') {
        await api.codingCli.approve(codingCliSessionId, pending.taskId, pending.requestId);
      } else {
        await api.codingCli.reject(codingCliSessionId, pending.taskId, pending.requestId);
      }
    } catch (err) {
      toast.error(`Failed to send decision: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const accent = isHuman
    ? { wrap: 'bg-red/5 border-red/30', title: 'text-red' }
    : { wrap: 'bg-yellow/5 border-yellow/30', title: 'text-yellow' };

  return (
    <div className={cn('border rounded-md p-3 space-y-2', accent.wrap)}>
      <div className="flex items-start gap-2">
        <Icon size={14} className={cn('shrink-0 mt-0.5', accent.title)} />
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-medium flex items-center gap-1.5 flex-wrap', accent.title)}>
            <span>{providerLabel(providerId)}</span>
            <span className="text-text-dim">·</span>
            <span>{SCOPE_LABEL[pending.scope]}</span>
            {isHuman && (
              <span className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red/15 text-red border border-red/30 font-mono">
                human required
              </span>
            )}
          </div>
          <div className="text-xs text-text-dim mt-0.5">{pending.summary}</div>
          {pending.policyReason && (
            <div className="text-[11px] text-text-dim/80 mt-0.5 italic">
              policy: {pending.policyReason}
            </div>
          )}
        </div>
      </div>

      {pending.detail && (
        <pre className="text-[11px] text-text wrap-break-word bg-surface-deep border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap font-mono">
          {pending.detail.slice(0, 1024)}
          {pending.detail.length > 1024 ? '\n…' : ''}
        </pre>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onResolve('approved')}
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
          onClick={() => onResolve('rejected')}
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
