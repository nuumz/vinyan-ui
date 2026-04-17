import { useEconomy } from '@/hooks/use-economy';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';

export default function Economy() {
  const { data: economy } = useEconomy();

  if (!economy) {
    return (
      <div className="space-y-4">
        <PageHeader title="Economy" description="Budget, costs, and market" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (!economy.enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Economy" description="Budget, costs, and market" />
        <div className="bg-surface rounded-lg border border-border p-8 text-center text-text-dim text-sm">
          Economy OS not enabled. Set <code className="bg-bg px-1 rounded text-xs">economy.enabled = true</code> in vinyan.json.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Economy" description="Budget utilization and cost tracking" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Budget Utilization */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Budget Utilization</div>
          {economy.budget.length === 0 ? (
            <div className="text-sm text-text-dim">No budget windows configured</div>
          ) : (
            <div className="space-y-4">
              {economy.budget.map((b) => {
                const pct = b.utilization_pct * 100;
                const barColor = b.exceeded
                  ? 'bg-red'
                  : pct > 80
                    ? 'bg-yellow'
                    : 'bg-green';
                return (
                  <div key={b.window}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-text-dim capitalize">{b.window}</span>
                      <span className="tabular-nums">
                        ${b.spent_usd.toFixed(4)} / ${b.limit_usd.toFixed(2)}
                        <span className="text-text-dim ml-1">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-border rounded-full">
                      <div
                        className={cn('h-full rounded-full transition-all duration-300', barColor)}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    {b.exceeded && (
                      <div className="text-xs text-red mt-1">Budget exceeded — enforcement: {b.enforcement}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cost Summary */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Cost Summary</div>
          <div className="space-y-2">
            <CostRow label="Hour" usd={economy.cost.hour.total_usd} count={economy.cost.hour.count} />
            <CostRow label="Day" usd={economy.cost.day.total_usd} count={economy.cost.day.count} />
            <CostRow label="Month" usd={economy.cost.month.total_usd} count={economy.cost.month.count} />
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-dim">Total ledger entries</span>
                <span className="tabular-nums">{economy.totalEntries}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CostRow({ label, usd, count }: { label: string; usd: number; count: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-dim">{label}</span>
      <span className="tabular-nums">
        ${usd.toFixed(4)} <span className="text-text-dim">({count} tasks)</span>
      </span>
    </div>
  );
}
