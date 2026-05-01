import { useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  useApproveSkillProposal,
  useDeleteSkillProposal,
  useRejectSkillProposal,
  useSetSkillProposalTrustTier,
  useSkillProposals,
} from '@/hooks/use-skill-proposals';
import type { SkillProposal, SkillProposalStatus, SkillProposalTrust } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { ConfirmDialog } from '@/components/ui/confirm';
import { toast } from '@/store/toast-store';

type TabId = 'all' | 'pending' | 'quarantined' | 'approved' | 'rejected';

const TAB_ITEMS: ReadonlyArray<TabItem<TabId>> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'quarantined', label: 'Quarantined' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

/**
 * Skill Proposals — agent-managed procedural memory.
 *
 * Backs `skill_proposals` (mig 029). Every proposal stays quarantined
 * until a human approves it (A6 / A8). Quarantined proposals cannot be
 * one-click approved; the SKILL.md must be edited (or recreated) so
 * the safety scanner clears.
 */
export default function SkillProposals() {
  const [tab, setTab] = useState<TabId>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allQuery = useSkillProposals();
  const tabQuery = useSkillProposals(tab === 'all' ? {} : { status: tab });

  const counts = useMemo(() => {
    const buckets: Record<TabId, number> = {
      all: 0,
      pending: 0,
      quarantined: 0,
      approved: 0,
      rejected: 0,
    };
    for (const p of allQuery.data?.proposals ?? []) {
      buckets.all += 1;
      buckets[p.status as TabId] = (buckets[p.status as TabId] ?? 0) + 1;
    }
    return buckets;
  }, [allQuery.data]);

  const proposals = tabQuery.data?.proposals ?? [];
  const selected = proposals.find((p) => p.id === selectedId) ?? null;

  const tabsWithCounts: ReadonlyArray<TabItem<TabId>> = TAB_ITEMS.map((t) => ({
    ...t,
    count: counts[t.id],
  }));

  return (
    <div className="space-y-3 pb-4">
      <PageHeader
        title="Skill Proposals"
        description={`${counts.all} proposal${counts.all === 1 ? '' : 's'} · ${
          counts.quarantined
        } quarantined · profile: ${tabQuery.data?.profile ?? 'default'}`}
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => {
              tabQuery.refetch();
              allQuery.refetch();
            }}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={tabQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <Tabs<TabId>
        items={tabsWithCounts}
        active={tab}
        onChange={(id) => {
          setTab(id);
          setSelectedId(null);
        }}
        variant="pills"
      />

      {tabQuery.isLoading ? (
        <CardSkeleton />
      ) : proposals.length === 0 ? (
        <EmptyState
          message={tab === 'all' ? 'No proposals yet' : `No ${tab} proposals`}
          hint={
            tab === 'pending'
              ? 'Proposals appear here when the auto-generator detects a repeated successful pattern, or when an external system POSTs to /api/v1/skill-proposals.'
              : undefined
          }
        />
      ) : (
        <ProposalsTable
          proposals={proposals}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.proposedName : 'Proposal'}
        subtitle={selected?.proposedCategory}
      >
        {selected && <ProposalDetail proposal={selected} onClose={() => setSelectedId(null)} />}
      </DetailDrawer>
    </div>
  );
}

function ProposalsTable({
  proposals,
  selectedId,
  onSelect,
}: {
  proposals: ReadonlyArray<SkillProposal>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-surface rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-bg/50 border-b border-border">
          <tr className="text-left text-[10px] uppercase tracking-wider text-text-dim">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Trust</th>
            <th className="px-3 py-2 font-medium">Successes</th>
            <th className="px-3 py-2 font-medium">Safety flags</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Decided by</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`border-b border-border/50 last:border-0 cursor-pointer hover:bg-white/2 ${
                  isSelected ? 'bg-accent/5' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="text-text font-mono">{p.proposedName}</div>
                  <div className="text-[10px] text-text-dim">
                    {p.capabilityTags.join(' · ') || '—'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <ProposalStatusBadge status={p.status} />
                </td>
                <td className="px-3 py-2">
                  <TrustTierBadge tier={p.trustTier} />
                </td>
                <td className="px-3 py-2 text-text-dim font-mono tabular-nums">{p.successCount}</td>
                <td className="px-3 py-2">
                  {p.safetyFlags.length === 0 ? (
                    <span className="text-text-dim">—</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {p.safetyFlags.map((f) => (
                        <Badge key={f} variant="warning">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-text-dim font-mono tabular-nums">
                  {formatRelative(p.createdAt)}
                </td>
                <td className="px-3 py-2 text-text-dim">
                  {p.decidedBy ? (
                    <div title={p.decisionReason ?? undefined}>{p.decidedBy}</div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProposalDetail({ proposal, onClose }: { proposal: SkillProposal; onClose: () => void }) {
  const approve = useApproveSkillProposal();
  const reject = useRejectSkillProposal();
  const setTier = useSetSkillProposalTrustTier();
  const del = useDeleteSkillProposal();
  const [decidedBy, setDecidedBy] = useState('');
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleApprove = async () => {
    if (!decidedBy.trim()) {
      toast.error('Enter your name (decidedBy) so the audit trail is complete');
      return;
    }
    try {
      await approve.mutateAsync({ id: proposal.id, decidedBy, reason: reason || undefined });
      toast.success('Proposal approved');
      onClose();
    } catch {
      // toast handled
    }
  };

  const handleReject = async () => {
    if (!decidedBy.trim()) {
      toast.error('Enter your name (decidedBy)');
      return;
    }
    if (!reason.trim()) {
      toast.error('Reason is required for rejection');
      return;
    }
    try {
      await reject.mutateAsync({ id: proposal.id, decidedBy, reason });
      toast.info('Proposal rejected');
      onClose();
    } catch {
      // toast handled
    }
  };

  const handlePromote = async (tier: SkillProposalTrust) => {
    if (!decidedBy.trim()) {
      toast.error('Enter your name (decidedBy)');
      return;
    }
    try {
      await setTier.mutateAsync({ id: proposal.id, tier, decidedBy });
      toast.success(`Trust tier set to ${tier}`);
    } catch {
      // toast handled
    }
  };

  const isQuarantined = proposal.status === 'quarantined';
  const isPending = proposal.status === 'pending';
  const isApproved = proposal.status === 'approved';
  const isDecided = proposal.status === 'approved' || proposal.status === 'rejected';

  return (
    <div className="space-y-4 p-4">
      {/* Status panel */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <DetailRow label="Status" value={<ProposalStatusBadge status={proposal.status} />} />
        <DetailRow label="Trust tier" value={<TrustTierBadge tier={proposal.trustTier} />} />
        <DetailRow label="Profile" value={proposal.profile} />
        <DetailRow
          label="Success count"
          value={<span className="font-mono tabular-nums">{proposal.successCount}</span>}
        />
        <DetailRow label="Created" value={new Date(proposal.createdAt).toLocaleString()} />
        {proposal.decidedAt && (
          <DetailRow label="Decided" value={new Date(proposal.decidedAt).toLocaleString()} />
        )}
        {proposal.decidedBy && <DetailRow label="Decided by" value={proposal.decidedBy} />}
      </div>

      {/* Safety flags */}
      {proposal.safetyFlags.length > 0 && (
        <div className="border border-yellow/30 bg-yellow/5 rounded-md p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-yellow mb-2">
            <ShieldAlert size={14} />
            Safety flags ({proposal.safetyFlags.length})
          </div>
          <div className="flex gap-1 flex-wrap">
            {proposal.safetyFlags.map((f) => (
              <Badge key={f} variant="warning">
                {f}
              </Badge>
            ))}
          </div>
          {isQuarantined && (
            <p className="text-[11px] text-text-dim mt-2">
              Quarantined proposals cannot be one-click approved. Edit the SKILL.md to remove the
              flagged content (e.g. embedded credentials, hidden Unicode), then re-create the
              proposal — the safety scanner will re-evaluate on insert.
            </p>
          )}
        </div>
      )}

      {/* Provenance */}
      <div className="border border-border rounded-md p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">Provenance</div>
        <div className="text-xs">
          <div className="text-text-dim">Capability tags</div>
          <div className="font-mono">
            {proposal.capabilityTags.length === 0
              ? '—'
              : proposal.capabilityTags.join(' · ')}
          </div>
        </div>
        <div className="text-xs">
          <div className="text-text-dim">Tools required</div>
          <div className="font-mono">
            {proposal.toolsRequired.length === 0 ? '—' : proposal.toolsRequired.join(' · ')}
          </div>
        </div>
        <div className="text-xs">
          <div className="text-text-dim">Source tasks</div>
          {proposal.sourceTaskIds.length === 0 ? (
            <div className="text-text-dim">—</div>
          ) : (
            <div className="flex gap-1 flex-wrap font-mono">
              {proposal.sourceTaskIds.map((id) => (
                <a
                  key={id}
                  href={`/tasks?search=${encodeURIComponent(id)}`}
                  className="text-accent hover:underline"
                >
                  {id.slice(0, 8)}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SKILL.md preview */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="bg-bg/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-dim border-b border-border">
          SKILL.md draft
        </div>
        <pre className="p-3 text-xs text-text whitespace-pre-wrap font-mono overflow-x-auto max-h-[24rem]">
          {proposal.skillMd}
        </pre>
      </div>

      {/* Decision */}
      {!isDecided && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-text-dim">Decision</div>
          <input
            className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            placeholder="Your name (decidedBy) — required"
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value)}
          />
          <textarea
            className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            placeholder={`Reason (optional for approve, required for reject)`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            {isPending && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={approve.isPending}
                className="px-3 py-1.5 rounded text-xs font-medium bg-green/15 border border-green/30 text-green hover:bg-green/25 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Check size={12} /> {approve.isPending ? 'Approving…' : 'Approve'}
              </button>
            )}
            <button
              type="button"
              onClick={handleReject}
              disabled={reject.isPending}
              className="px-3 py-1.5 rounded text-xs font-medium bg-red/15 border border-red/30 text-red hover:bg-red/25 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <X size={12} /> {reject.isPending ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      )}

      {/* Trust-tier promotion */}
      {isApproved && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-text-dim">Trust tier</div>
          <input
            className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
            placeholder="Your name (decidedBy) — required"
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value)}
          />
          <div className="flex gap-1 flex-wrap">
            {(['quarantined', 'community', 'trusted', 'official'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => handlePromote(tier)}
                disabled={setTier.isPending || tier === proposal.trustTier}
                className="px-2 py-1 rounded text-[11px] font-medium bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <ShieldCheck size={11} /> {tier}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete */}
      <div className="pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={del.isPending}
          className="px-2 py-1 rounded text-[11px] text-text-dim hover:text-red hover:bg-red/5 inline-flex items-center gap-1"
        >
          <Trash2 size={11} /> Delete proposal
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          del.mutate(proposal.id, {
            onSuccess: () => {
              toast.info('Proposal deleted');
              onClose();
            },
          });
        }}
        title="Delete proposal?"
        description={
          <>
            This will permanently remove proposal{' '}
            <span className="font-mono">{proposal.proposedName}</span> and its provenance. The audit
            trail in event logs is preserved but the row itself disappears.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        busy={del.isPending}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: SkillProposalStatus }) {
  const variantMap: Record<SkillProposalStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
    pending: 'info',
    quarantined: 'warning',
    approved: 'success',
    rejected: 'neutral',
  };
  return <Badge variant={variantMap[status]}>{status}</Badge>;
}

function TrustTierBadge({ tier }: { tier: SkillProposalTrust }) {
  const variantMap: Record<SkillProposalTrust, 'warning' | 'neutral' | 'info' | 'success'> = {
    quarantined: 'warning',
    community: 'neutral',
    trusted: 'info',
    official: 'success',
    builtin: 'success',
  };
  return <Badge variant={variantMap[tier]}>{tier}</Badge>;
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(diff / 86_400_000);
  return `${d}d ago`;
}
