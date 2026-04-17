import { useMemo, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { usePeers } from '@/hooks/use-peers';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { cn, timeAgo } from '@/lib/utils';
import type { PeerTrustLevel, PeerTrustRecord } from '@/lib/api-client';

const trustVariant: Record<PeerTrustLevel, 'success' | 'info' | 'warning' | 'neutral'> = {
  trusted: 'success',
  established: 'info',
  provisional: 'warning',
  untrusted: 'neutral',
};

export default function Peers() {
  const query = usePeers();
  const [selected, setSelected] = useState<PeerTrustRecord | null>(null);

  const data = query.data;
  const peers = data?.peers ?? [];

  const summary = useMemo(() => {
    const counts = { trusted: 0, established: 0, provisional: 0, untrusted: 0 };
    for (const p of peers) counts[p.trustLevel]++;
    return counts;
  }, [peers]);

  const loading = !query.data && query.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Peers"
        description="A2A peers with empirical trust scores — Wilson LB progression, inactivity-decayed."
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
          <Users size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">A2A peer trust manager not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Enable <code className="bg-bg px-1 rounded">network.instances.enabled</code> in{' '}
            <code className="bg-bg px-1 rounded">vinyan.json</code>.
          </div>
        </div>
      )}

      {data?.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Trusted" count={summary.trusted} variant="success" />
            <SummaryCard label="Established" count={summary.established} variant="info" />
            <SummaryCard label="Provisional" count={summary.provisional} variant="warning" />
            <SummaryCard label="Untrusted" count={summary.untrusted} variant="neutral" />
          </div>

          {loading ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {peers.length === 0 ? (
                <EmptyState
                  message="No peers registered"
                  hint="Peers auto-register on first A2A interaction"
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-dim text-xs">
                      <th className="px-4 py-2">Peer</th>
                      <th className="px-4 py-2">Trust</th>
                      <th className="px-4 py-2 text-right">Wilson LB</th>
                      <th className="px-4 py-2 text-right">Interactions</th>
                      <th className="px-4 py-2 text-right">Accuracy</th>
                      <th className="px-4 py-2 text-right">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map((p) => {
                      const accuracy = p.interactions > 0 ? p.accurate / p.interactions : null;
                      return (
                        <tr
                          key={p.peerId}
                          onClick={() => setSelected(p)}
                          className={cn(
                            'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                            selected?.peerId === p.peerId && 'bg-white/[0.02]',
                          )}
                        >
                          <td className="px-4 py-2 font-mono text-xs truncate max-w-[18rem]" title={p.peerId}>
                            {p.peerId}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={trustVariant[p.trustLevel]}>{p.trustLevel}</Badge>
                          </td>
                          <td className="px-4 py-2 tabular-nums text-right">
                            {p.wilsonLB.toFixed(3)}
                          </td>
                          <td className="px-4 py-2 tabular-nums text-right text-text-dim">
                            {p.interactions}
                          </td>
                          <td className="px-4 py-2 tabular-nums text-right text-text-dim">
                            {accuracy != null ? `${(accuracy * 100).toFixed(0)}%` : '—'}
                          </td>
                          <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                            {timeAgo(p.lastInteraction)}
                          </td>
                        </tr>
                      );
                    })}
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
        title={selected?.peerId ?? ''}
        subtitle={selected?.instanceId}
      >
        {selected && <PeerDetail peer={selected} />}
      </DetailDrawer>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: 'success' | 'info' | 'warning' | 'neutral';
}) {
  const color =
    variant === 'success'
      ? 'text-green'
      : variant === 'info'
        ? 'text-accent'
        : variant === 'warning'
          ? 'text-yellow'
          : 'text-text-dim';
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-xs text-text-dim uppercase tracking-wider">{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums', color)}>{count}</div>
    </div>
  );
}

function PeerDetail({ peer }: { peer: PeerTrustRecord }) {
  const accuracy = peer.interactions > 0 ? peer.accurate / peer.interactions : null;
  return (
    <div className="space-y-3 text-sm">
      <Row label="Peer ID" value={<code className="text-xs">{peer.peerId}</code>} />
      <Row label="Instance ID" value={<code className="text-xs">{peer.instanceId}</code>} />
      <Row label="Trust level" value={<Badge variant={trustVariant[peer.trustLevel]}>{peer.trustLevel}</Badge>} />
      <Row label="Wilson LB" value={peer.wilsonLB.toFixed(4)} />
      <Row label="Interactions" value={peer.interactions} />
      <Row label="Accurate" value={peer.accurate} />
      <Row
        label="Accuracy"
        value={accuracy != null ? `${(accuracy * 100).toFixed(1)}%` : '—'}
      />
      <Row label="Consecutive failures" value={peer.consecutiveFailures} />
      <Row label="Last interaction" value={new Date(peer.lastInteraction).toLocaleString()} />
      {peer.promotedAt && <Row label="Promoted" value={timeAgo(peer.promotedAt)} />}
      {peer.demotedAt && <Row label="Demoted" value={timeAgo(peer.demotedAt)} />}
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
