import { useMemo, useState } from 'react';
import { RefreshCw, BookOpenCheck } from 'lucide-react';
import { useMemory, useApproveMemory, useRejectMemory } from '@/hooks/use-memory';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { cn } from '@/lib/utils';
import type { MemoryProposal } from '@/lib/api-client';

type Decision = 'approve' | 'reject';

interface PendingAction {
  proposal: MemoryProposal;
  decision: Decision;
}

export default function Memory() {
  const query = useMemory();
  const approve = useApproveMemory();
  const reject = useRejectMemory();

  const [selected, setSelected] = useState<MemoryProposal | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reviewer, setReviewer] = useState(() => localStorage.getItem('vinyan-reviewer') ?? '');
  const [reason, setReason] = useState('');

  const proposals = query.data ?? [];
  const loading = !query.data && query.isLoading;

  const isPending = approve.isPending || reject.isPending;

  const handleSubmit = async () => {
    if (!pending) return;
    const handle = pending.proposal.slug;
    if (!reviewer.trim()) return;
    localStorage.setItem('vinyan-reviewer', reviewer.trim());

    try {
      if (pending.decision === 'approve') {
        await approve.mutateAsync({ handle, reviewer: reviewer.trim() });
      } else {
        if (!reason.trim()) return;
        await reject.mutateAsync({ handle, reviewer: reviewer.trim(), reason: reason.trim() });
      }
      setPending(null);
      setReason('');
      if (selected?.slug === handle) setSelected(null);
    } catch {
      /* toast handled in hook */
    }
  };

  const headerActions = (
    <button
      type="button"
      onClick={() => query.refetch()}
      className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
      title="Refresh"
    >
      <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Memory"
        description="Agent-proposed lessons awaiting human review — approved ones merge into learned.md"
        actions={headerActions}
      />

      {loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {proposals.length === 0 ? (
            <EmptyState
              message="No pending proposals"
              hint="Memory proposals accumulate in .vinyan/memory/pending/ after tasks"
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Slug</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Summary</th>
                  <th className="px-4 py-2 text-right">Confidence</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <ProposalRow
                    key={p.filename}
                    proposal={p}
                    selected={selected?.filename === p.filename}
                    onSelect={() => setSelected(p)}
                    onApprove={(ev) => {
                      ev.stopPropagation();
                      setPending({ proposal: p, decision: 'approve' });
                    }}
                    onReject={(ev) => {
                      ev.stopPropagation();
                      setPending({ proposal: p, decision: 'reject' });
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.slug ?? ''}
        subtitle={selected?.filename}
        width="xl"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              {selected.category && <Badge variant="info">{selected.category}</Badge>}
              {selected.confidence != null && (
                <span className="text-xs text-text-dim">
                  confidence: {selected.confidence.toFixed(2)}
                </span>
              )}
            </div>
            {selected.description && <p className="text-text-dim">{selected.description}</p>}
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Proposal</div>
              <pre className="bg-bg rounded p-3 text-xs whitespace-pre-wrap font-mono">
                {selected.content}
              </pre>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPending({ proposal: selected, decision: 'approve' })}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-green/10 text-green border border-green/30 hover:bg-green/20"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setPending({ proposal: selected, decision: 'reject' })}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-red/10 text-red border border-red/30 hover:bg-red/20"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>

      {pending && (
        <ReviewDialog
          pending={pending}
          reviewer={reviewer}
          setReviewer={setReviewer}
          reason={reason}
          setReason={setReason}
          busy={isPending}
          onCancel={() => {
            if (!isPending) {
              setPending(null);
              setReason('');
            }
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function ProposalRow({
  proposal,
  selected,
  onSelect,
  onApprove,
  onReject,
}: {
  proposal: MemoryProposal;
  selected: boolean;
  onSelect: () => void;
  onApprove: (e: React.MouseEvent) => void;
  onReject: (e: React.MouseEvent) => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={cn(
        'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
        selected && 'bg-white/[0.02]',
      )}
    >
      <td className="px-4 py-2 font-mono text-xs">{proposal.slug}</td>
      <td className="px-4 py-2">
        {proposal.category ? <Badge variant="info">{proposal.category}</Badge> : '—'}
      </td>
      <td className="px-4 py-2 text-text-dim text-xs truncate max-w-[28rem]">
        {proposal.description ?? '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {proposal.confidence != null ? proposal.confidence.toFixed(2) : '—'}
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onApprove}
            className="px-2 py-0.5 text-xs rounded bg-green/10 text-green border border-green/30 hover:bg-green/20"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            className="px-2 py-0.5 text-xs rounded bg-red/10 text-red border border-red/30 hover:bg-red/20"
          >
            Reject
          </button>
        </div>
      </td>
    </tr>
  );
}

function ReviewDialog({
  pending,
  reviewer,
  setReviewer,
  reason,
  setReason,
  busy,
  onCancel,
  onSubmit,
}: {
  pending: PendingAction;
  reviewer: string;
  setReviewer: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const variant = pending.decision === 'approve' ? 'approve' : 'reject';
  const canSubmit =
    reviewer.trim().length > 0 && (pending.decision !== 'reject' || reason.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div className="relative bg-surface border border-border rounded-lg w-[30rem] max-w-[90vw] p-5 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <BookOpenCheck size={18} className="text-accent shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold capitalize">
              {variant} proposal: <code className="text-sm font-mono">{pending.proposal.slug}</code>
            </h3>
            <p className="text-xs text-text-dim mt-1">
              A1 compliance: reviewer name is required and logged in the audit trail.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-text-dim uppercase tracking-wider">Reviewer</label>
          <input
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="your name or handle"
            disabled={busy}
            className="w-full px-3 py-2 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>

        {pending.decision === 'reject' && (
          <div className="space-y-2">
            <label className="text-xs text-text-dim uppercase tracking-wider">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="why is this proposal being rejected?"
              disabled={busy}
              className="w-full px-3 py-2 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent disabled:opacity-50 resize-y"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !canSubmit}
            className={cn(
              'px-3 py-1.5 text-sm rounded border transition-colors disabled:opacity-50',
              pending.decision === 'approve'
                ? 'bg-green/10 border-green/30 text-green hover:bg-green/20'
                : 'bg-red/10 border-red/30 text-red hover:bg-red/20',
            )}
          >
            {busy ? 'Working…' : pending.decision === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
