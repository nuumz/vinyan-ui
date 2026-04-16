import { useEffect } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-text-dim mt-1">{sub}</div>}
    </div>
  );
}

function Gauge({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const size = 80;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = pct >= 0.8 ? 'var(--color-green)' : pct >= 0.5 ? 'var(--color-yellow)' : 'var(--color-red)';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="-mt-13 text-lg font-bold tabular-nums">{(pct * 100).toFixed(0)}%</div>
      <div className="text-xs text-text-dim mt-2">{label}</div>
    </div>
  );
}

function GateBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
          ready
            ? 'bg-green/10 text-green border-green/30'
            : 'bg-gray-800 text-gray-500 border-gray-700',
        )}
      >
        {ready ? 'READY' : 'not ready'}
      </span>
      <span className="text-xs text-text-dim">{label}</span>
    </div>
  );
}

export default function Overview() {
  const metrics = useVinyanStore((s) => s.metrics);
  const events = useVinyanStore((s) => s.events);
  const fetchWorkers = useVinyanStore((s) => s.fetchWorkers);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  if (!metrics) {
    return <div className="text-text-dim text-sm">Loading metrics...</div>;
  }

  const m = metrics;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-text-dim mt-0.5">System overview and real-time metrics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Traces" value={m.traces.total} />
        <StatCard title="Task Types" value={m.traces.distinctTaskTypes} />
        <StatCard title="Workers" value={`${m.workers.active} / ${m.workers.total}`} sub="active / total" />
        <StatCard title="Shadow Queue" value={m.shadow.queueDepth} />
      </div>

      {/* Gauges + routing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Success Rate</div>
          <div className="flex justify-center">
            <Gauge value={m.traces.successRate} label="success rate" />
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Avg Quality</div>
          <div className="flex justify-center">
            <Gauge value={m.traces.avgQualityComposite} label="quality composite" />
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Routing Distribution</div>
          <div className="space-y-2 mt-2">
            {Object.entries(m.traces.routingDistribution).map(([level, count]) => (
              <div key={level} className="flex items-center justify-between text-sm">
                <span className="text-text-dim">L{level}</span>
                <span className="font-mono tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subsystems */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Rules" value={m.rules.total} sub={`${m.rules.active} active, ${m.rules.probation} probation`} />
        <StatCard
          title="Skills"
          value={m.skills.total}
          sub={`${m.skills.active} active, ${m.skills.probation} probation`}
        />
        <StatCard title="Patterns" value={m.patterns.total} sub={`${m.patterns.sleepCyclesRun} sleep cycles`} />
        <StatCard
          title="Fleet"
          value={m.workers.active}
          sub={`${m.workers.probation} probation, ${m.workers.demoted} demoted`}
        />
      </div>

      {/* Data gates */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Data Gates</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <GateBadge label="Sleep Cycle" ready={m.dataGates.sleepCycle} />
          <GateBadge label="Skill Formation" ready={m.dataGates.skillFormation} />
          <GateBadge label="Evolution Engine" ready={m.dataGates.evolutionEngine} />
          <GateBadge label="Fleet Routing" ready={m.dataGates.fleetRouting} />
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="text-xs text-text-dim uppercase tracking-wider mb-3">Recent Events</div>
        <div className="space-y-1 max-h-64 overflow-auto">
          {events.length === 0 ? (
            <div className="text-xs text-text-dim py-2">No events yet</div>
          ) : (
            events.slice(0, 20).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                <EventBadge event={e.event} />
                <span className="text-text-dim truncate flex-1">{summarize(e.payload)}</span>
                <span className="text-text-dim tabular-nums shrink-0">{timeAgo(e.ts)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const color = event.includes('error') || event.includes('fail')
    ? 'bg-red/10 text-red border-red/30'
    : event.includes('complete') || event.includes('verdict')
      ? 'bg-green/10 text-green border-green/30'
      : event.includes('escalate') || event.includes('timeout')
        ? 'bg-yellow/10 text-yellow border-yellow/30'
        : 'bg-accent/10 text-accent border-accent/30';

  return (
    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs border shrink-0', color)}>{event}</span>
  );
}

function summarize(p: Record<string, unknown>): string {
  const taskId = (p.taskId as string) ?? (p.input as Record<string, unknown>)?.id;
  const oracle = p.oracleName as string;
  const parts: string[] = [];
  if (taskId) parts.push(String(taskId));
  if (oracle) parts.push(`oracle=${oracle}`);
  return parts.length > 0 ? parts.join(' ') : JSON.stringify(p).slice(0, 80);
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}
