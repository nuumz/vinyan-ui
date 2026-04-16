import { useVinyanStore } from '@/store/vinyan-store';
import { cn, timeAgo, summarizePayload } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { EventBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

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
  const healthError = useVinyanStore((s) => s.healthError);

  if (healthError) {
    return (
      <div className="bg-surface rounded-lg border border-red/30 p-6 text-center">
        <div className="text-red text-sm font-medium mb-1">Cannot connect to Vinyan backend</div>
        <div className="text-text-dim text-xs">{healthError}</div>
        <div className="text-text-dim text-xs mt-2">Make sure <code className="bg-bg px-1 rounded">bun src/cli/index.ts serve</code> is running on port 3927</div>
      </div>
    );
  }

  if (!metrics) {
    return <div className="text-text-dim text-sm">Loading metrics...</div>;
  }

  const m = metrics;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="System overview and real-time metrics" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Traces" value={m.traces.total} />
        <StatCard title="Task Types" value={m.traces.distinctTaskTypes} />
        <StatCard title="Workers" value={`${m.workers.active} / ${m.workers.total}`} sub="active / total" />
        <StatCard title="Shadow Queue" value={m.shadow.queueDepth} />
      </div>

      {/* Gauges + routing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Success Rate">
          <div className="flex justify-center">
            <Gauge value={m.traces.successRate} label="success rate" />
          </div>
        </Card>

        <Card label="Avg Quality">
          <div className="flex justify-center">
            <Gauge value={m.traces.avgQualityComposite} label="quality composite" />
          </div>
        </Card>

        <Card label="Routing Distribution">
          <div className="space-y-2 mt-2">
            {Object.entries(m.traces.routingDistribution).map(([level, count]) => (
              <div key={level} className="flex items-center justify-between text-sm">
                <span className="text-text-dim">L{level}</span>
                <span className="font-mono tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </Card>
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
      <Card label="Data Gates">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <GateBadge label="Sleep Cycle" ready={m.dataGates.sleepCycle} />
          <GateBadge label="Skill Formation" ready={m.dataGates.skillFormation} />
          <GateBadge label="Evolution Engine" ready={m.dataGates.evolutionEngine} />
          <GateBadge label="Fleet Routing" ready={m.dataGates.fleetRouting} />
        </div>
      </Card>

      {/* Recent events */}
      <Card label="Recent Events">
        <div className="space-y-1 max-h-64 overflow-auto">
          {events.length === 0 ? (
            <div className="text-xs text-text-dim py-2">No events yet</div>
          ) : (
            events.slice(0, 20).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                <EventBadge event={e.event} />
                <span className="text-text-dim truncate flex-1">{summarizePayload(e.payload)}</span>
                <span className="text-text-dim tabular-nums shrink-0">{timeAgo(e.ts)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
