import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useVinyanStore } from '@/store/vinyan-store';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { cn, timeAgo } from '@/lib/utils';
import type { Worker, Task } from '@/lib/api-client';

type EngineStatus = Worker['status'];

interface EngineStats {
  tasks: number;
  successes: number;
  qualitySum: number;
  qualityCount: number;
  tokensSum: number;
  tokensCount: number;
  durationSum: number;
  durationCount: number;
  recent: Task[];
}

function emptyStats(): EngineStats {
  return {
    tasks: 0,
    successes: 0,
    qualitySum: 0,
    qualityCount: 0,
    tokensSum: 0,
    tokensCount: 0,
    durationSum: 0,
    durationCount: 0,
    recent: [],
  };
}

export default function Engines() {
  const engines = useVinyanStore((s) => s.workers);
  const tasks = useVinyanStore((s) => s.tasks);
  const tasksLoading = useVinyanStore((s) => s.tasksLoading);
  const metrics = useVinyanStore((s) => s.metrics);
  const fetchWorkers = useVinyanStore((s) => s.fetchWorkers);
  const fetchTasks = useVinyanStore((s) => s.fetchTasks);

  const [filter, setFilter] = useState<EngineStatus | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const gini = metrics?.workers.fleetGini ?? 0;
  const balancePct = Math.round((1 - Math.max(0, Math.min(1, gini))) * 100);
  const distinct = metrics?.workers.traceDiversity ?? 0;

  // Per-engine KPIs aggregated by modelId from tasks
  const statsByModel = useMemo(() => {
    const map = new Map<string, EngineStats>();
    for (const t of tasks) {
      const modelId = t.result?.trace?.modelUsed;
      if (!modelId) continue;
      let s = map.get(modelId);
      if (!s) {
        s = emptyStats();
        map.set(modelId, s);
      }
      s.tasks += 1;
      if (t.result?.status === 'completed') s.successes += 1;
      const q = t.result?.qualityScore?.composite;
      if (typeof q === 'number') {
        s.qualitySum += q;
        s.qualityCount += 1;
      }
      const tokens = t.result?.trace?.tokensConsumed;
      if (typeof tokens === 'number') {
        s.tokensSum += tokens;
        s.tokensCount += 1;
      }
      const dur = t.result?.trace?.durationMs;
      if (typeof dur === 'number') {
        s.durationSum += dur;
        s.durationCount += 1;
      }
      if (s.recent.length < 10) s.recent.push(t);
    }
    return map;
  }, [tasks]);

  const visibleEngines = useMemo(
    () => (filter ? engines.filter((e) => e.status === filter) : engines),
    [engines, filter],
  );

  const handleRefresh = () => {
    fetchWorkers();
    fetchTasks();
  };

  const loading = engines.length === 0 && metrics === null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Engines"
        description="Reasoning engine fleet — capabilities, performance, and diversity"
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw size={14} className={tasksLoading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FilterStat
          title="Total"
          value={engines.length}
          active={filter === null}
          onClick={() => setFilter(null)}
        />
        <FilterStat
          title="Active"
          value={metrics?.workers.active ?? 0}
          valueColor="text-green"
          active={filter === 'active'}
          onClick={() => setFilter(filter === 'active' ? null : 'active')}
        />
        <FilterStat
          title="Probation"
          value={metrics?.workers.probation ?? 0}
          valueColor="text-yellow"
          active={filter === 'probation'}
          onClick={() => setFilter(filter === 'probation' ? null : 'probation')}
        />
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Fleet Balance</div>
          <BalanceGauge balancePct={balancePct} />
          <div className="text-xs text-text-dim mt-1">
            Gini {(gini * 100).toFixed(0)}% · {distinct} distinct in traces
          </div>
        </div>
      </div>

      {/* Secondary filter chips for Demoted/Retired (not shown as StatCards) */}
      {(metrics?.workers.demoted ?? 0) + (metrics?.workers.retired ?? 0) > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-dim">More:</span>
          <FilterChip
            label={`Demoted (${metrics?.workers.demoted ?? 0})`}
            active={filter === 'demoted'}
            onClick={() => setFilter(filter === 'demoted' ? null : 'demoted')}
          />
          <FilterChip
            label={`Retired (${metrics?.workers.retired ?? 0})`}
            active={filter === 'retired'}
            onClick={() => setFilter(filter === 'retired' ? null : 'retired')}
          />
        </div>
      )}

      {/* Engine table */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {visibleEngines.length === 0 ? (
            <div className="text-sm text-text-dim text-center py-8">
              {engines.length === 0
                ? 'No engines registered'
                : `No engines match "${filter}" filter`}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Engine</th>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2 text-right">Success</th>
                  <th className="px-4 py-2 text-right">Quality</th>
                  <th className="px-4 py-2 text-right">Tokens</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                  <th className="px-4 py-2 text-right">Demotions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEngines.map((e) => {
                  const s = statsByModel.get(e.config.modelId) ?? emptyStats();
                  const successPct = s.tasks > 0 ? (s.successes / s.tasks) * 100 : null;
                  const avgQuality = s.qualityCount > 0 ? s.qualitySum / s.qualityCount : null;
                  const avgTokens = s.tokensCount > 0 ? s.tokensSum / s.tokensCount : null;
                  const avgDuration = s.durationCount > 0 ? s.durationSum / s.durationCount : null;
                  const isOpen = expanded === e.id;
                  return (
                    <Row
                      key={e.id}
                      engine={e}
                      stats={s}
                      successPct={successPct}
                      avgQuality={avgQuality}
                      avgTokens={avgTokens}
                      avgDuration={avgDuration}
                      isOpen={isOpen}
                      onToggle={() => setExpanded(isOpen ? null : e.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  engine: Worker;
  stats: EngineStats;
  successPct: number | null;
  avgQuality: number | null;
  avgTokens: number | null;
  avgDuration: number | null;
  isOpen: boolean;
  onToggle: () => void;
}

function Row({
  engine: e,
  stats,
  successPct,
  avgQuality,
  avgTokens,
  avgDuration,
  isOpen,
  onToggle,
}: RowProps) {
  const successColor =
    successPct === null
      ? 'text-text-dim'
      : successPct >= 80
        ? 'text-green'
        : successPct >= 50
          ? 'text-yellow'
          : 'text-red';

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
          isOpen && 'bg-white/[0.02]',
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-2 font-mono text-xs" title={e.id}>
          {shortEngineId(e.id, e.config.modelId)}
        </td>
        <td className="px-4 py-2 text-xs text-text-dim font-mono">{e.config.modelId}</td>
        <td className="px-4 py-2">
          <StatusBadge status={e.status} />
        </td>
        <td className="px-4 py-2 tabular-nums text-right">{stats.tasks}</td>
        <td className={cn('px-4 py-2 tabular-nums text-right', successColor)}>
          {successPct !== null ? `${successPct.toFixed(0)}%` : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {avgQuality !== null ? avgQuality.toFixed(2) : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {avgTokens !== null ? Math.round(avgTokens).toLocaleString() : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {avgDuration !== null ? `${Math.round(avgDuration)}ms` : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right">{e.demotionCount}</td>
      </tr>
      {isOpen && <DrilldownRow engine={e} stats={stats} />}
    </>
  );
}

function DrilldownRow({ engine: e, stats }: { engine: Worker; stats: EngineStats }) {
  return (
    <tr>
      <td colSpan={9} className="px-4 py-3 bg-bg/50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Config */}
          <div className="space-y-1.5">
            <div className="text-text-dim uppercase tracking-wider">Configuration</div>
            <DetailRow label="Engine ID" value={<span className="font-mono">{e.id}</span>} />
            <DetailRow label="Model" value={<span className="font-mono">{e.config.modelId}</span>} />
            <DetailRow label="Type" value={e.config.engineType ?? 'llm'} />
            <DetailRow
              label="Temperature"
              value={e.config.temperature !== undefined ? e.config.temperature.toFixed(2) : '—'}
            />
            <DetailRow label="Registered" value={timeAgo(e.createdAt)} />
            <DetailRow
              label="Demotions"
              value={
                <span className={e.demotionCount > 0 ? 'text-yellow' : 'text-text-dim'}>
                  {e.demotionCount}
                </span>
              }
            />
          </div>

          {/* Recent tasks for this modelId */}
          <div className="space-y-1.5">
            <div className="text-text-dim uppercase tracking-wider">
              Recent tasks ({stats.recent.length})
            </div>
            {stats.recent.length === 0 ? (
              <div className="text-text-dim py-2">No traces recorded for this model yet</div>
            ) : (
              <div className="space-y-1">
                {stats.recent.map((t) => (
                  <div
                    key={t.taskId}
                    className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0"
                  >
                    <span className="font-mono text-text-dim truncate flex-1">{t.taskId}</span>
                    <StatusBadge status={t.result?.status ?? t.status} />
                    {t.result?.qualityScore && (
                      <span className="tabular-nums text-text-dim shrink-0">
                        q{t.result.qualityScore.composite.toFixed(2)}
                      </span>
                    )}
                    {t.result?.trace?.durationMs !== undefined && (
                      <span className="tabular-nums text-text-dim shrink-0">
                        {t.result.trace.durationMs}ms
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text truncate">{value}</span>
    </div>
  );
}

interface FilterStatProps {
  title: string;
  value: number;
  valueColor?: string;
  active: boolean;
  onClick: () => void;
}

function FilterStat({ title, value, valueColor, active, onClick }: FilterStatProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left transition-colors rounded-lg',
        active ? 'ring-1 ring-accent' : '',
      )}
    >
      <StatCard title={title} value={value} valueColor={valueColor} />
    </button>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded border transition-colors',
        active
          ? 'bg-accent/10 text-accent border-accent/30'
          : 'bg-surface text-text-dim border-border hover:text-text',
      )}
    >
      {label}
    </button>
  );
}

// Strip "worker-" prefix and the embedded model path so the engine identifier
// reads independently of the model column. Falls back to the full id if the
// expected pattern is not present.
function shortEngineId(id: string, modelId: string): string {
  const trimmed = id.startsWith('worker-') ? id.slice('worker-'.length) : id;
  if (modelId && trimmed.startsWith(modelId)) {
    const tail = trimmed.slice(modelId.length).replace(/^[-/]/, '');
    return tail || modelId.split('/').pop() || trimmed;
  }
  return trimmed.split('/').pop() ?? trimmed;
}

function BalanceGauge({ balancePct }: { balancePct: number }) {
  const pct = Math.max(0, Math.min(100, balancePct));
  const color =
    pct >= 70 ? 'var(--color-green)' : pct >= 40 ? 'var(--color-yellow)' : 'var(--color-red)';
  const label = pct >= 70 ? 'Balanced' : pct >= 40 ? 'Moderate' : 'Concentrated';

  return (
    <div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>
        {pct.toFixed(0)}%
      </div>
      <div className="w-full h-1.5 bg-border rounded-full mt-1">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-xs text-text-dim mt-1">{label}</div>
    </div>
  );
}
