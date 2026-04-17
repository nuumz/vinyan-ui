import { useMemo } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useHMS } from '@/hooks/use-hms';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/badge';
import { JsonView } from '@/components/ui/json-view';
import { cn, timeAgo } from '@/lib/utils';

export default function HMS() {
  const query = useHMS();
  const data = query.data;

  const configEntries = useMemo(
    () => (data?.config && typeof data.config === 'object' ? data.config : null),
    [data?.config],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="HMS"
        description="Hallucination Mitigation System — claim grounding, overconfidence detection, risk scoring."
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

      {query.isLoading && <EmptyState message="Loading HMS report…" />}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              title="Analyzed"
              value={data.summary.totalAnalyzed}
              sub="traces with risk score"
            />
            <StatCard
              title="High Risk"
              value={data.summary.highRiskCount}
              sub="risk ≥ 0.6"
              valueColor={data.summary.highRiskCount > 0 ? 'text-red' : undefined}
            />
            <StatCard
              title="Avg Risk"
              value={data.summary.avgRisk != null ? data.summary.avgRisk.toFixed(2) : '—'}
              sub={data.summary.avgRisk != null ? 'across recent traces' : 'no data yet'}
              valueColor={
                data.summary.avgRisk == null
                  ? undefined
                  : data.summary.avgRisk >= 0.6
                    ? 'text-red'
                    : data.summary.avgRisk >= 0.3
                      ? 'text-yellow'
                      : 'text-green'
              }
            />
          </div>

          {/* Config */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck size={14} />
              Configuration
            </h3>
            {configEntries ? (
              <JsonView data={configEntries} collapsibleTopLevel={false} />
            ) : (
              <div className="bg-surface border border-border rounded p-3 text-sm text-text-dim">
                HMS not configured — add <code className="bg-bg px-1 rounded">hms</code> section to
                vinyan.json.
              </div>
            )}
          </div>

          {/* Recent risk-scored traces */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={14} />
              Recent Risk Scores
            </h3>
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {data.recentTraces.length === 0 ? (
                <EmptyState
                  message="No risk-scored traces yet"
                  hint="Traces accumulate risk scores as Phase Verify runs HMS analysis"
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-dim text-xs">
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2">Outcome</th>
                      <th className="px-4 py-2">Approach</th>
                      <th className="px-4 py-2 text-right">Risk</th>
                      <th className="px-4 py-2 text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTraces.map((t) => {
                      const risk = t.riskScore ?? 0;
                      const riskColor =
                        risk >= 0.7 ? 'text-red' : risk >= 0.4 ? 'text-yellow' : 'text-green';
                      return (
                        <tr key={t.id} className="border-b border-border/50">
                          <td className="px-4 py-2 font-mono text-xs truncate max-w-[14rem]" title={t.taskId}>
                            {t.taskId}
                          </td>
                          <td className="px-4 py-2">
                            {t.outcome ? (
                              <StatusBadge status={t.outcome} />
                            ) : (
                              <span className="text-text-dim">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-text-dim truncate max-w-[22rem]">
                            {t.approach ?? '—'}
                          </td>
                          <td className={cn('px-4 py-2 tabular-nums text-right', riskColor)}>
                            {t.riskScore != null ? t.riskScore.toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                            {timeAgo(t.timestamp)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
