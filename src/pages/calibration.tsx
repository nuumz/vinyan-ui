import { RefreshCw, Target } from 'lucide-react';
import { useCalibration } from '@/hooks/use-calibration';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

export default function Calibration() {
  const query = useCalibration();
  const data = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calibration"
        description="Forward-predictor Brier scores — lower = better calibrated predictions."
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

      {query.isLoading && <EmptyState message="Loading calibration…" />}

      {data && !data.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <Target size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">Forward predictor is not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Enable <code className="bg-bg px-1 rounded">orchestrator.forward_predictor.enabled</code>{' '}
            in vinyan.json.
          </div>
        </div>
      )}

      {data?.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              title="Predictions"
              value={data.traceCount}
              sub="recorded in ledger"
            />
            <StatCard
              title="Recent Brier (avg)"
              value={data.averageBrier != null ? data.averageBrier.toFixed(3) : '—'}
              sub={data.averageBrier != null ? `over ${data.recentBrierScores.length} samples` : 'no resolved outcomes yet'}
              valueColor={
                data.averageBrier == null
                  ? undefined
                  : data.averageBrier <= 0.15
                    ? 'text-green'
                    : data.averageBrier <= 0.3
                      ? 'text-yellow'
                      : 'text-red'
              }
            />
            <StatCard title="Samples" value={data.recentBrierScores.length} sub="most recent outcomes" />
          </div>

          <div className="bg-surface rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
              Recent Brier Scores
            </h3>
            {data.recentBrierScores.length === 0 ? (
              <div className="text-sm text-text-dim">
                No resolved outcomes yet. Brier scores appear once predictions are matched to actual
                task results.
              </div>
            ) : (
              <BrierSparkline scores={data.recentBrierScores} />
            )}
          </div>

          <div className="text-xs text-text-dim">
            Brier score measures probabilistic accuracy: 0 is perfect, 0.25 is a coin flip, 1.0 is
            always wrong. Lower trend = predictor learning. A persistent upward trend indicates
            miscalibration (drift or regime change).
          </div>
        </>
      )}
    </div>
  );
}

function BrierSparkline({ scores }: { scores: number[] }) {
  // Reverse so oldest-first reads left-to-right as a timeline.
  const ordered = [...scores].reverse();
  const width = 800;
  const height = 120;
  const padding = 10;
  const max = Math.max(...ordered, 0.5);
  const min = 0;
  const xStep = ordered.length > 1 ? (width - 2 * padding) / (ordered.length - 1) : 0;

  const points = ordered
    .map((s, i) => {
      const x = padding + i * xStep;
      const y =
        height - padding - ((s - min) / (max - min || 1)) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const avg = ordered.reduce((a, b) => a + b, 0) / ordered.length;
  const avgY = height - padding - ((avg - min) / (max - min || 1)) * (height - 2 * padding);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-24 bg-bg rounded border border-border/50"
      >
        {/* Baseline 0.25 (coin-flip reference) */}
        {(() => {
          const refY =
            height - padding - ((0.25 - min) / (max - min || 1)) * (height - 2 * padding);
          return (
            <line
              x1={padding}
              x2={width - padding}
              y1={refY}
              y2={refY}
              stroke="var(--color-text-dim, #666)"
              strokeDasharray="4 4"
              strokeOpacity="0.3"
            />
          );
        })()}
        {/* Average line */}
        <line
          x1={padding}
          x2={width - padding}
          y1={avgY}
          y2={avgY}
          stroke="var(--color-accent, #58a6ff)"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        {/* Scores polyline */}
        <polyline
          fill="none"
          stroke="var(--color-accent, #58a6ff)"
          strokeWidth="1.5"
          points={points}
        />
      </svg>
      <div className="flex items-center gap-4 text-xs text-text-dim">
        <span className={cn('tabular-nums', avg <= 0.2 ? 'text-green' : avg <= 0.35 ? 'text-yellow' : 'text-red')}>
          avg {avg.toFixed(3)}
        </span>
        <span>· max {max.toFixed(3)}</span>
        <span>· n={ordered.length}</span>
        <span className="ml-auto">oldest → newest</span>
      </div>
    </div>
  );
}
