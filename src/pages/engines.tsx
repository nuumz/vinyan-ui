import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useWorkers } from '@/hooks/use-workers';
import { useTasks } from '@/hooks/use-tasks';
import { useMetrics } from '@/hooks/use-metrics';
import { useEngine } from '@/hooks/use-engine';
import { StatusBadge, Badge } from '@/components/ui/badge';
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

interface EngineDisplayStats {
  tasks: number;
  successPct: number | null;
  avgQuality: number | null;
  avgTokens: number | null;
  avgDuration: number | null;
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

function addTaskStats(map: Map<string, EngineStats>, key: string, task: Task): void {
  let stats = map.get(key);
  if (!stats) {
    stats = emptyStats();
    map.set(key, stats);
  }
  stats.tasks += 1;
  if (task.result?.status === 'completed') stats.successes += 1;
  const quality = task.result?.qualityScore?.composite;
  if (typeof quality === 'number') {
    stats.qualitySum += quality;
    stats.qualityCount += 1;
  }
  const tokens = task.result?.trace?.tokensConsumed;
  if (typeof tokens === 'number') {
    stats.tokensSum += tokens;
    stats.tokensCount += 1;
  }
  const duration = task.result?.trace?.durationMs;
  if (typeof duration === 'number') {
    stats.durationSum += duration;
    stats.durationCount += 1;
  }
  if (stats.recent.length < 10) stats.recent.push(task);
}

function displayStatsForEngine(engine: Worker, fallback: EngineStats): EngineDisplayStats {
  // Prefer backend worker-store aggregates when they actually have data.
  // Backend may return zero-stats payloads for engines whose traces are
  // recorded under a legacy id alias — falling through to the task-list
  // fallback keeps the table consistent with the drilldown's recent tasks.
  if (engine.stats && engine.stats.totalTasks > 0) {
    return {
      tasks: engine.stats.totalTasks,
      successPct: engine.stats.successRate * 100,
      avgQuality: engine.stats.avgQualityScore,
      avgTokens: engine.stats.avgTokenCost,
      avgDuration: engine.stats.avgDurationMs,
      recent: fallback.recent,
    };
  }

  return {
    tasks: fallback.tasks,
    successPct: fallback.tasks > 0 ? (fallback.successes / fallback.tasks) * 100 : null,
    avgQuality: fallback.qualityCount > 0 ? fallback.qualitySum / fallback.qualityCount : null,
    avgTokens: fallback.tokensCount > 0 ? fallback.tokensSum / fallback.tokensCount : null,
    avgDuration: fallback.durationCount > 0 ? fallback.durationSum / fallback.durationCount : null,
    recent: fallback.recent,
  };
}

export default function Engines() {
  const workersQuery = useWorkers();
  const tasksQuery = useTasks();
  const metricsQuery = useMetrics();
  const engines = workersQuery.data ?? [];
  const tasks = tasksQuery.data?.tasks ?? [];
  const metrics = metricsQuery.data ?? null;

  const [filter, setFilter] = useState<EngineStatus | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const gini = metrics?.workers.fleetGini ?? 0;
  const balancePct = Math.round((1 - Math.max(0, Math.min(1, gini))) * 100);
  const distinct = metrics?.workers.traceDiversity ?? 0;

  const statusCounts = useMemo(
    () => ({
      active: engines.filter((e) => e.status === 'active').length,
      probation: engines.filter((e) => e.status === 'probation').length,
      demoted: engines.filter((e) => e.status === 'demoted').length,
      retired: engines.filter((e) => e.status === 'retired').length,
    }),
    [engines],
  );

  // Recent task preview fallback. Authoritative KPIs come from workerStore stats
  // on each engine row; task list data is session-scoped and can be incomplete.
  const taskStatsByKey = useMemo(() => {
    const map = new Map<string, EngineStats>();
    for (const t of tasks) {
      const keys = new Set<string>();
      const workerId = t.result?.trace?.workerId;
      const modelId = t.result?.trace?.modelUsed;
      if (workerId) keys.add(workerId);
      if (modelId) keys.add(modelId);
      for (const key of keys) addTaskStats(map, key, t);
    }
    return map;
  }, [tasks]);

  const visibleEngines = useMemo(
    () => (filter ? engines.filter((e) => e.status === filter) : engines),
    [engines, filter],
  );

  const handleRefresh = () => {
    workersQuery.refetch();
    tasksQuery.refetch();
    metricsQuery.refetch();
  };

  const loading = workersQuery.isLoading;
  const isFetching = workersQuery.isFetching || tasksQuery.isFetching || metricsQuery.isFetching;

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
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
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
          value={statusCounts.active}
          valueColor="text-green"
          active={filter === 'active'}
          onClick={() => setFilter(filter === 'active' ? null : 'active')}
        />
        <FilterStat
          title="Probation"
          value={statusCounts.probation}
          valueColor="text-yellow"
          active={filter === 'probation'}
          onClick={() => setFilter(filter === 'probation' ? null : 'probation')}
        />
        <div className="bg-surface rounded-lg border border-border p-4 h-full flex flex-col">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Fleet Balance</div>
          <BalanceGauge balancePct={balancePct} />
          <div className="text-xs text-text-dim mt-auto pt-1">
            Gini {(gini * 100).toFixed(0)}% · {distinct} distinct in traces
          </div>
        </div>
      </div>

      {/* Secondary filter chips for Demoted/Retired (not shown as StatCards) */}
      {statusCounts.demoted + statusCounts.retired > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-dim">More:</span>
          <FilterChip
            label={`Demoted (${statusCounts.demoted})`}
            active={filter === 'demoted'}
            onClick={() => setFilter(filter === 'demoted' ? null : 'demoted')}
          />
          <FilterChip
            label={`Retired (${statusCounts.retired})`}
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
                  const fallbackStats = taskStatsByKey.get(e.id) ?? taskStatsByKey.get(e.config.modelId) ?? emptyStats();
                  const stats = displayStatsForEngine(e, fallbackStats);
                  const isOpen = expanded === e.id;
                  return (
                    <Row
                      key={e.id}
                      engine={e}
                      stats={stats}
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
  stats: EngineDisplayStats;
  isOpen: boolean;
  onToggle: () => void;
}

function Row({
  engine: e,
  stats,
  isOpen,
  onToggle,
}: RowProps) {
  const successColor =
    stats.successPct === null
      ? 'text-text-dim'
      : stats.successPct >= 80
        ? 'text-green'
        : stats.successPct >= 50
          ? 'text-yellow'
          : 'text-red';

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 hover:bg-white/2 cursor-pointer transition-colors',
          isOpen && 'bg-white/2',
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
          {stats.successPct !== null ? `${stats.successPct.toFixed(0)}%` : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {stats.avgQuality !== null ? stats.avgQuality.toFixed(2) : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {stats.avgTokens !== null ? Math.round(stats.avgTokens).toLocaleString() : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right text-text-dim">
          {stats.avgDuration !== null ? `${Math.round(stats.avgDuration)}ms` : '—'}
        </td>
        <td className="px-4 py-2 tabular-nums text-right">{e.demotionCount}</td>
      </tr>
      {isOpen && <DrilldownRow engine={e} stats={stats} />}
    </>
  );
}

function DrilldownRow({ engine: e, stats }: { engine: Worker; stats: EngineDisplayStats }) {
  return (
    <tr>
      <td colSpan={9} className="px-4 py-3 bg-bg/50">
        <EngineCapabilityPanel engineId={e.id} />
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

function EngineCapabilityPanel({ engineId }: { engineId: string }) {
  const { data } = useEngine(engineId);
  if (!data) return null;
  const caps = data.capabilities ?? [];
  const trust = data.providerTrust;

  if (caps.length === 0 && !trust) return null;

  return (
    <div className="mb-3 pb-3 border-b border-border/50 space-y-3 text-xs">
      {trust && (
        <div>
          <div className="text-text-dim uppercase tracking-wider mb-1.5">Provider Trust</div>
          <div className="flex items-center gap-2 bg-bg rounded p-2">
            <span className="font-mono">{trust.provider}</span>
            <span className="text-text-dim">·</span>
            <span>{trust.capability}</span>
            <span className="ml-auto text-green">✓{trust.successes}</span>
            <span className="text-red">✗{trust.failures}</span>
            {(() => {
              const total = trust.successes + trust.failures;
              const rate = total > 0 ? trust.successes / total : null;
              const color = rate == null ? '' : rate >= 0.9 ? 'text-green' : rate >= 0.7 ? 'text-yellow' : 'text-red';
              return rate != null ? (
                <span className={cn('tabular-nums', color)}>{(rate * 100).toFixed(0)}%</span>
              ) : null;
            })()}
          </div>
        </div>
      )}
      {caps.length > 0 && (
        <div>
          <div className="text-text-dim uppercase tracking-wider mb-1.5">
            Capability Scores ({caps.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {caps.slice(0, 10).map((c) => {
              const color =
                c.score >= 0.7 ? 'text-green' : c.score >= 0.4 ? 'text-yellow' : 'text-red';
              return (
                <div
                  key={c.fingerprintKey}
                  className="flex items-center gap-2 bg-bg rounded px-2 py-1"
                >
                  <code className="text-[10px] truncate flex-1" title={c.fingerprintKey}>
                    {c.fingerprintKey}
                  </code>
                  <Badge variant="neutral" className="text-[10px]">
                    n={c.samples}
                  </Badge>
                  <span className={cn('tabular-nums', color)}>{c.score.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          {caps.length > 10 && (
            <div className="text-text-dim mt-1">…and {caps.length - 10} more</div>
          )}
        </div>
      )}
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
        'text-left transition-colors rounded-lg h-full',
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
