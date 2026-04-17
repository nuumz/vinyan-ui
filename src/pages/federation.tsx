import { RefreshCw, Landmark } from 'lucide-react';
import { useFederation } from '@/hooks/use-federation';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn, formatUsd } from '@/lib/utils';

export default function Federation() {
  const query = useFederation();
  const data = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Federation"
        description="Shared budget pool across instances — local contribution, local consumption, A3 deterministic."
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

      {query.isLoading && <EmptyState message="Loading pool status…" />}

      {data && !data.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <Landmark size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">Federation budget pool not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Enable <code className="bg-bg px-1 rounded">economy.federation.enabled</code> in{' '}
            <code className="bg-bg px-1 rounded">vinyan.json</code> to share budget across A2A
            peers.
          </div>
        </div>
      )}

      {data?.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Contributed"
              value={formatUsd(data.pool.total_contributed_usd, 3)}
              sub="from local tasks"
              valueColor="text-green"
            />
            <StatCard
              title="Consumed"
              value={formatUsd(data.pool.total_consumed_usd, 3)}
              sub="by delegated tasks"
              valueColor="text-yellow"
            />
            <StatCard
              title="Remaining"
              value={formatUsd(data.pool.remaining_usd, 3)}
              sub={data.pool.exhausted ? 'POOL EXHAUSTED' : 'available for delegation'}
              valueColor={data.pool.exhausted ? 'text-red' : undefined}
            />
            <div className="bg-surface rounded-lg border border-border p-4">
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Status</div>
              <Badge variant={data.pool.exhausted ? 'error' : 'success'}>
                {data.pool.exhausted ? 'exhausted' : 'healthy'}
              </Badge>
            </div>
          </div>

          {/* Utilization bar */}
          {data.pool.total_contributed_usd > 0 && (
            <div className="bg-surface rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
                Pool Utilization
              </h3>
              <UtilizationBar
                contributed={data.pool.total_contributed_usd}
                consumed={data.pool.total_consumed_usd}
              />
            </div>
          )}

          <div className="text-xs text-text-dim">
            Each instance contributes a fraction of its local budget to this pool. Delegation
            requests consume from here. No global coordinator — per-instance bookkeeping is
            authoritative (A3: deterministic governance).
          </div>
        </>
      )}
    </div>
  );
}

function UtilizationBar({
  contributed,
  consumed,
}: {
  contributed: number;
  consumed: number;
}) {
  const pct = contributed > 0 ? Math.min(100, (consumed / contributed) * 100) : 0;
  const color = pct >= 90 ? 'bg-red' : pct >= 70 ? 'bg-yellow' : 'bg-green';
  return (
    <div>
      <div className="flex justify-between text-xs text-text-dim mb-1.5">
        <span>{formatUsd(consumed, 3)} consumed</span>
        <span className="tabular-nums">{pct.toFixed(1)}%</span>
        <span>{formatUsd(contributed, 3)} contributed</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
