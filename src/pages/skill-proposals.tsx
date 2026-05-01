import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, History, RefreshCw, Save, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  useApproveSkillProposal,
  useAutogenPolicySnapshot,
  useDeleteSkillProposal,
  usePatchSkillProposalDraft,
  useRejectSkillProposal,
  useScanSkillProposalDraft,
  useSetSkillProposalTrustTier,
  useSkillProposalRevisions,
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

      <AutogenPolicyBanner />

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
    if (!reason.trim()) {
      toast.error('Reason is required — approvals must be explained (audit trail)');
      return;
    }
    try {
      await approve.mutateAsync({ id: proposal.id, decidedBy, reason });
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
    if (!reason.trim()) {
      toast.error('Reason is required for trust-tier changes (audit trail)');
      return;
    }
    try {
      await setTier.mutateAsync({ id: proposal.id, tier, decidedBy, reason });
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

      {/* SKILL.md draft — inline editor + live scan when editable */}
      {!isDecided ? (
        <SkillDraftEditor proposal={proposal} />
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="bg-bg/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-dim border-b border-border flex items-center justify-between">
            <span>SKILL.md draft</span>
            <span className="text-[10px] text-text-dim">read-only — proposal is {proposal.status}</span>
          </div>
          <pre className="p-3 text-xs text-text whitespace-pre-wrap font-mono overflow-x-auto max-h-[24rem]">
            {proposal.skillMd}
          </pre>
        </div>
      )}

      {/* Revision history — always shown */}
      <SkillProposalRevisions proposalId={proposal.id} />

      {/* Decision form — only for editable proposals */}

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
            placeholder="Reason — required for approve / reject / trust-tier (audit trail)"
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

/**
 * R2 — inline SKILL.md editor with debounced live safety scan.
 *
 * The textarea is local state. Every change resets a 500ms debounce
 * timer; when it fires, we POST to `/skill-proposals/scan` and render
 * the verdict in a findings panel above the textarea. Save Draft
 * commits the bytes via PATCH; the server re-scans authoritatively
 * and updates `safetyFlags` + `status` accordingly. The local
 * verdict is advisory only — never gates server-side enforcement.
 */
function SkillDraftEditor({ proposal }: { proposal: SkillProposal }) {
  const [draft, setDraft] = useState(proposal.skillMd);
  const [editorActor, setEditorActor] = useState('');
  const [editorReason, setEditorReason] = useState('');
  const [scanResult, setScanResult] = useState<{ safe: boolean; flags: string[] } | null>(null);
  const scan = useScanSkillProposalDraft();
  const patch = usePatchSkillProposalDraft();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // G2 — the revision the operator was viewing when they started
  // editing. PATCH includes this so the server can reject stale
  // writes (412). The proposal entity itself carries `latestRevision`
  // (G2-extension) so the optimistic-lock baseline is ALWAYS available
  // — no race window where the separate revisions query hasn't
  // loaded.
  const baseRevision = proposal.latestRevision;

  // Reset draft when the operator switches between proposals OR when
  // the persisted SKILL.md changes (e.g. another operator landed a
  // save and we picked up the cache invalidation).
  useEffect(() => {
    setDraft(proposal.skillMd);
    setScanResult(null);
  }, [proposal.id, proposal.skillMd]);

  // Debounced scan — fires 500ms after the operator stops typing. The
  // mutation hook handles error toasts on failure; we just stash the
  // verdict for the findings panel.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (draft === proposal.skillMd) {
      // No edit yet — show the persisted verdict as the live state.
      setScanResult({ safe: proposal.safetyFlags.length === 0, flags: [...proposal.safetyFlags] });
      return;
    }
    debounceRef.current = setTimeout(() => {
      scan.mutate(draft, {
        onSuccess: (res) => setScanResult({ safe: res.safe, flags: res.flags }),
      });
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleSave = async () => {
    if (!editorActor.trim()) {
      toast.error('Enter your name (actor) — every revision must name a human');
      return;
    }
    if (!draft.trim()) {
      toast.error('Draft cannot be empty');
      return;
    }
    try {
      const res = await patch.mutateAsync({
        id: proposal.id,
        skillMd: draft,
        actor: editorActor,
        reason: editorReason || undefined,
        // G2-extension: baseRevision is sourced from the proposal
        // entity itself, so it is ALWAYS defined when an editable
        // proposal renders. No conditional spread — the optimistic-
        // lock token is mandatory for every save.
        expectedRevision: baseRevision,
      });
      toast.success(`Saved revision ${res.revision}`);
      setEditorReason('');
    } catch {
      // toast handled (warning toast for 412, error for others)
    }
  };

  const dirty = draft !== proposal.skillMd;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-bg/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-dim border-b border-border flex items-center justify-between">
        <span>SKILL.md draft (editable)</span>
        <span className="text-[10px] text-text-dim">
          {dirty ? 'unsaved changes' : 'in sync with persisted draft'}
          {scan.isPending && ' · scanning…'}
        </span>
      </div>
      {scanResult && (
        <div
          className={`px-3 py-2 text-[11px] border-b border-border ${
            scanResult.safe ? 'bg-green/5 text-green' : 'bg-yellow/5 text-yellow'
          }`}
        >
          {scanResult.safe ? (
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Live scan: clean
            </span>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={12} />
                Live scan: {scanResult.flags.length} flag{scanResult.flags.length === 1 ? '' : 's'}
              </div>
              <div className="flex gap-1 flex-wrap">
                {scanResult.flags.map((f) => (
                  <Badge key={f} variant="warning">
                    {f}
                  </Badge>
                ))}
              </div>
              <div className="text-[10px] text-text-dim">
                Saving will keep the proposal quarantined until flags clear.
              </div>
            </div>
          )}
        </div>
      )}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(20, draft.split('\n').length + 2)}
        className="w-full bg-bg p-3 text-xs text-text font-mono focus:outline-none resize-y"
        placeholder="# proposed-skill\n## Approach\n…"
      />
      <div className="bg-bg/50 px-3 py-2 border-t border-border space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
            placeholder="Your name (actor) — required"
            value={editorActor}
            onChange={(e) => setEditorActor(e.target.value)}
          />
          <input
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
            placeholder="What did you change? (optional)"
            value={editorReason}
            onChange={(e) => setEditorReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={patch.isPending || !dirty || !editorActor.trim()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <Save size={12} /> {patch.isPending ? 'Saving…' : `Save draft${dirty ? '' : ' (no changes)'}`}
          </button>
          <button
            type="button"
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              scan.mutate(draft, {
                onSuccess: (res) => setScanResult({ safe: res.safe, flags: res.flags }),
              });
            }}
            disabled={scan.isPending}
            className="px-3 py-1.5 rounded text-xs font-medium border border-border text-text-dim hover:text-text hover:bg-white/5 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} className={scan.isPending ? 'animate-spin' : ''} /> Re-scan
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(proposal.skillMd)}
              className="px-3 py-1.5 rounded text-xs font-medium border border-border text-text-dim hover:text-red hover:bg-red/5"
            >
              Discard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * R2 — revision history panel. Newest first. Shows actor, timestamp,
 * safety flags applied to that revision, and a collapsed body
 * preview. Clicking a row expands the full SKILL.md content for that
 * revision.
 */
function SkillProposalRevisions({ proposalId }: { proposalId: string }) {
  const query = useSkillProposalRevisions(proposalId);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-bg/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-dim border-b border-border flex items-center gap-1.5">
        <History size={11} />
        Revision history{query.data ? ` (${query.data.total})` : ''}
      </div>
      {query.isLoading ? (
        <div className="p-3 text-[11px] text-text-dim">Loading revisions…</div>
      ) : !query.data || query.data.revisions.length === 0 ? (
        <div className="p-3 text-[11px] text-text-dim">No revisions yet.</div>
      ) : (
        <ul className="divide-y divide-border/50 max-h-[18rem] overflow-y-auto">
          {query.data.revisions.map((rev) => {
            const isExpanded = expanded === rev.revision;
            return (
              <li key={rev.id} className="text-xs">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : rev.revision)}
                  className="w-full text-left px-3 py-2 hover:bg-white/2 flex items-center gap-2"
                >
                  <span className="font-mono text-text-dim tabular-nums">v{rev.revision}</span>
                  <span className="text-text">{rev.actor}</span>
                  <span className="text-text-dim">{formatRelative(rev.createdAt)}</span>
                  {rev.safetyFlags.length > 0 && (
                    <Badge variant="warning">{rev.safetyFlags.length} flag{rev.safetyFlags.length === 1 ? '' : 's'}</Badge>
                  )}
                  {rev.reason && <span className="text-text-dim italic ml-auto truncate">{rev.reason}</span>}
                </button>
                {isExpanded && (
                  <div className="bg-bg/40 border-t border-border/50">
                    {rev.safetyFlags.length > 0 && (
                      <div className="px-3 py-1.5 flex gap-1 flex-wrap">
                        {rev.safetyFlags.map((f) => (
                          <Badge key={f} variant="warning">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <pre className="px-3 py-2 text-[11px] text-text font-mono whitespace-pre-wrap overflow-x-auto max-h-[16rem]">
                      {rev.skillMd}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * R1 — autogen policy diagnostics banner.
 *
 * Renders the live adaptive threshold + the deterministic explanation
 * that produced it + the ledger / tracker tail. Shown above the
 * proposals table so an operator triaging the queue sees why the
 * autogen is firing at its current rate.
 */
function AutogenPolicyBanner() {
  const query = useAutogenPolicySnapshot();
  if (query.isLoading || !query.data) return null;
  const snap = query.data;
  if (snap.threshold === null) return null;
  return (
    <div className="border border-border rounded-md p-3 bg-surface text-xs">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-dim">
        <span>Autogen policy</span>
        <span>
          {snap.enabled ? 'adaptive' : 'static'} · {snap.ledger.recentChanges} change
          {snap.ledger.recentChanges === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <div className="text-base font-mono tabular-nums text-text">
          threshold = <span className="text-accent">{snap.threshold}</span>
        </div>
        {snap.signals && (
          <div className="text-[11px] text-text-dim">
            pending {snap.signals.pendingCount} · quarantine{' '}
            {(snap.signals.quarantineRate * 100).toFixed(0)}% · acceptance{' '}
            {(snap.signals.acceptanceRate * 100).toFixed(0)}%
          </div>
        )}
        <div className="text-[11px] text-text-dim">
          tracker {snap.tracker.rows} sigs · {snap.tracker.cooldownActive} in cooldown
          {snap.tracker.bootId && ` · boot ${snap.tracker.bootId.slice(0, 8)}`}
        </div>
      </div>
      {snap.explanation && (
        <div className="mt-1 text-[11px] text-text-dim font-mono">{snap.explanation}</div>
      )}
    </div>
  );
}
