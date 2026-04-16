import { useEffect } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green/10 text-green border-green/30'
      : status === 'probation'
        ? 'bg-yellow/10 text-yellow border-yellow/30'
        : status === 'demoted'
          ? 'bg-red/10 text-red border-red/30'
          : 'bg-gray-800 text-gray-500 border-gray-700';
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', color)}>{status}</span>;
}

function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

export default function Workers() {
  const workers = useVinyanStore((s) => s.workers);
  const metrics = useVinyanStore((s) => s.metrics);
  const fetchWorkers = useVinyanStore((s) => s.fetchWorkers);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  const activeCount = workers.filter((w) => w.status === 'active').length;
  const gini = metrics?.workers.traceDiversity ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Workers</h2>
        <p className="text-sm text-text-dim mt-0.5">Fleet status and worker profiles</p>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Total</div>
          <div className="text-2xl font-bold tabular-nums">{workers.length}</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Active</div>
          <div className="text-2xl font-bold tabular-nums text-green">{activeCount}</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Probation</div>
          <div className="text-2xl font-bold tabular-nums text-yellow">{metrics?.workers.probation ?? 0}</div>
        </div>
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
