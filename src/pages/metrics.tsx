import { useEffect, useState } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';

export default function Metrics() {
  const metrics = useVinyanStore((s) => s.metrics);
  const [prometheus, setPrometheus] = useState<Record<string, number | string> | null>(null);

  useEffect(() => {
    fetchPrometheus();
    const timer = setInterval(fetchPrometheus, 10_000);
    return () => clearInterval(timer);
  }, []);

  async function fetchPrometheus() {
    try {
      const res = await fetch('/api/v1/metrics');
      const text = await res.text();
      setPrometheus(parsePrometheusText(text));
    } catch {
      // silent
    }
  }

  if (!metrics) {
    return <div className="text-text-dim text-sm">Loading metrics...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Metrics</h2>
        <p className="text-sm text-text-dim mt-0.5">System metrics — JSON + Prometheus</p>
      </div>

      {/* Prometheus key metrics */}
      {prometheus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PrometheusCard label="Tasks Total" value={prometheus['vinyan_tasks_total']} />
          <PrometheusCard label="Oracle Latency" value={prometheus['vinyan_oracle_latency_seconds']} suffix="ms" multiplier={1000} />
          <PrometheusCard label="Calibration" value={prometheus['vinyan_self_model_calibration']} suffix="%" multiplier={100} />
          <PrometheusCard
            label="Avg Duration"
            value={
              prometheus['vinyan_task_duration_seconds_count'] && Number(prometheus['vinyan_task_duration_seconds_count']) > 0
                ? Number(prometheus['vinyan_task_duration_seconds_sum']) / Number(prometheus['vinyan_task_duration_seconds_count'])
                : undefined
            }
            suffix="s"
          />
        </div>
      )}

      {/* JSON metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricSection title="Traces" data={metrics.traces} />
        <MetricSection title="Workers" data={metrics.workers} />
        <MetricSection title="Rules" data={metrics.rules} />
        <MetricSection title="Skills" data={metrics.skills} />
        <MetricSection title="Patterns" data={metrics.patterns} />
        <MetricSection title="Shadow" data={metrics.shadow} />
        <MetricSection title="Data Gates" data={metrics.dataGates} />
      </div>
    </div>
  );
}

function PrometheusCard({
  label,
  value,
  suffix,
  multiplier,
}: {
  label: string;
  value: unknown;
  suffix?: string;
  multiplier?: number;
}) {
  const num = value !== undefined ? Number(value) * (multiplier ?? 1) : null;
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums">
        {num !== null && !isNaN(num) ? `${num.toFixed(num > 100 ? 0 : 2)}${suffix ?? ''}` : '--'}
      </div>
    </div>
  );
}

function MetricSection({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-1.5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-text-dim">{key}</span>
            <span className="font-mono tabular-nums">
              {typeof value === 'boolean'
                ? value
                  ? 'true'
                  : 'false'
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function parsePrometheusText(text: string): Record<string, number | string> {
  const metrics: Record<string, number | string> = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^(\w+)(?:\{[^}]*\})?\s+(.+)$/);
    if (match) {
      const [, name, val] = match;
      const num = parseFloat(val);
      metrics[name] = isNaN(num) ? val : num;
    }
  }
  return metrics;
}
