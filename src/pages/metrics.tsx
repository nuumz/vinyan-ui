import { useEffect, useState } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';

export default function Metrics() {
  const metrics = useVinyanStore((s) => s.metrics);
  const [prometheus, setPrometheus] = useState<Record<string, number>>({});

  useEffect(() => {
    loadPrometheus();
    const t = setInterval(loadPrometheus, 10_000);
    return () => clearInterval(t);
  }, []);

  async function loadPrometheus() {
    try {
      const text = await api.getPrometheusMetrics();
      setPrometheus(parsePrometheus(text));
    } catch {
      /* silent */
    }
  }

  if (!metrics) {
    return <div className="text-text-dim text-sm">Loading metrics...</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Metrics" description="System metrics — Prometheus + JSON" />

      {/* Prometheus key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PromCard label="Tasks Total" value={prometheus['vinyan_tasks_total']} />
        <PromCard label="Oracle Latency" value={prometheus['vinyan_oracle_latency_seconds']} mult={1000} suffix="ms" />
        <PromCard label="Calibration" value={prometheus['vinyan_self_model_calibration']} mult={100} suffix="%" />
        <PromCard
          label="Avg Duration"
          value={
            prometheus['vinyan_task_duration_seconds_count'] > 0
              ? prometheus['vinyan_task_duration_seconds_sum'] / prometheus['vinyan_task_duration_seconds_count']
              : undefined
          }
          suffix="s"
        />
      </div>

      {/* JSON metric sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Traces" data={metrics.traces} />
        <Section title="Workers" data={metrics.workers} />
        <Section title="Rules" data={metrics.rules} />
        <Section title="Skills" data={metrics.skills} />
        <Section title="Patterns" data={metrics.patterns} />
        <Section title="Shadow" data={metrics.shadow} />
        <Section title="Data Gates" data={metrics.dataGates} />
      </div>
    </div>
  );
}

function PromCard({ label, value, mult, suffix }: { label: string; value?: number; mult?: number; suffix?: string }) {
  const v = value !== undefined ? value * (mult ?? 1) : null;
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums">
        {v !== null && !isNaN(v) ? `${v.toFixed(v > 100 ? 0 : 2)}${suffix ?? ''}` : '--'}
      </div>
    </div>
  );
}

function Section({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-1.5">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-text-dim">{k}</span>
            <span className="font-mono tabular-nums">
              {typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function parsePrometheus(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^([\w:]+)(?:\{[^}]*\})?\s+([\d.eE+-]+)/);
    if (match) {
      const val = parseFloat(match[2]);
      if (!isNaN(val)) result[match[1]] = val;
    }
  }
  return result;
}
