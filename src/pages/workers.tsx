import { useVinyanStore } from '@/store/vinyan-store';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';

export default function Workers() {
  const workers = useVinyanStore((s) => s.workers);
  const metrics = useVinyanStore((s) => s.metrics);

  const gini = metrics?.workers.traceDiversity ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Workers" description="Fleet status and worker profiles" />

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total" value={workers.length} />
        <StatCard title="Active" value={metrics?.workers.active ?? 0} valueColor="text-green" />
        <StatCard title="Probation" value={metrics?.workers.probation ?? 0} valueColor="text-yellow" />
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Fleet Diversity (Gini)</div>
          <GiniGauge value={gini} />
        </div>
      </div>

      {/* Worker table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {workers.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No workers registered</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Worker ID</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Engine</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Demotions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-xs">{w.id}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{w.config.modelId}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{w.config.engineType ?? 'llm'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="px-4 py-2 tabular-nums">{w.demotionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function GiniGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = value < 0.3 ? 'var(--color-green)' : value < 0.6 ? 'var(--color-yellow)' : 'var(--color-red)';
  const label = value < 0.3 ? 'Balanced' : value < 0.6 ? 'Moderate' : 'Concentrated';

  return (
    <div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>
        {(value * 100).toFixed(0)}%
      </div>
      <div className="w-full h-1.5 bg-border rounded-full mt-1">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-xs text-text-dim mt-1">{label}</div>
    </div>
  );
}
