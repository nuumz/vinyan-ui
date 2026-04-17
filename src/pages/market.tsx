import { RefreshCw, Gavel } from 'lucide-react';
import { useMarket } from '@/hooks/use-market';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { timeAgo } from '@/lib/utils';

export default function Market() {
  const query = useMarket();
  const data = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market"
        description="Vickrey auction + bidder accuracy — sealed-bid, second-price, anti-collusion."
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
          <Gavel size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">Market scheduler not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Enable <code className="bg-bg px-1 rounded">economy.market.enabled</code> in{' '}
            <code className="bg-bg px-1 rounded">vinyan.json</code>.
          </div>
        </div>
      )}

      {data?.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface rounded-lg border border-border p-4">
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Status</div>
              <Badge variant={data.active ? 'success' : 'neutral'}>
                {data.active ? 'active' : 'bootstrap (Phase A)'}
              </Badge>
            </div>
            {data.phase && (
              <>
                <StatCard
                  title="Phase"
                  value={data.phase.currentPhase}
                  sub="market lifecycle"
                />
                <StatCard
                  title="Auctions"
                  value={data.phase.auctionCount}
                  sub="ran since bootstrap"
                />
                <StatCard
                  title="Bidders Tracked"
                  value={data.bidderStats?.length ?? 0}
                  sub="with accuracy records"
                />
              </>
            )}
          </div>

          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {!data.bidderStats || data.bidderStats.length === 0 ? (
              <EmptyState
                message={data.active ? 'No bids settled yet' : 'Market not active yet'}
                hint={
                  data.active
                    ? 'Bidder accuracy accumulates as auctions settle'
                    : 'Phase A requires min_cost_records + min_bidders to activate'
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-dim text-xs">
                    <th className="px-4 py-2">Bidder</th>
                    <th className="px-4 py-2 text-right">Settlements</th>
                    <th className="px-4 py-2 text-right">Accurate</th>
                    <th className="px-4 py-2 text-right">Accuracy</th>
                    <th className="px-4 py-2 text-right">Avg Penalty</th>
                    <th className="px-4 py-2 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bidderStats.map((b) => {
                    const accuracy = b.settlements > 0 ? b.accurate / b.settlements : null;
                    return (
                      <tr key={b.bidderId} className="border-b border-border/50">
                        <td className="px-4 py-2 font-mono text-xs">{b.bidderId}</td>
                        <td className="px-4 py-2 tabular-nums text-right">{b.settlements}</td>
                        <td className="px-4 py-2 tabular-nums text-right text-green">
                          {b.accurate}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right">
                          {accuracy != null ? `${(accuracy * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
                          {b.avgPenalty.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                          {timeAgo(b.lastUpdated)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
