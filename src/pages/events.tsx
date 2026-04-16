import { useState, useMemo } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';

const EVENT_TYPES = [
  'task:start', 'task:complete', 'task:escalate', 'task:timeout',
  'phase:timing', 'trace:record',
  'worker:dispatch', 'worker:complete', 'worker:error',
  'oracle:verdict', 'critic:verdict', 'shadow:complete',
  'skill:match', 'skill:miss', 'tools:executed',
  'agent:session_start', 'agent:session_end', 'agent:turn_complete',
  'agent:tool_executed', 'agent:clarification_requested',
] as const;

export default function Events() {
  const events = useVinyanStore((s) => s.events);
  const clearEvents = useVinyanStore((s) => s.clearEvents);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!filter) return events;
    return events.filter((e) => e.event.includes(filter));
  }, [events, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-sm text-text-dim mt-0.5">Real-time event stream</p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded text-xs text-text-dim hover:text-text hover:bg-white/5 transition-colors"
          onClick={clearEvents}
        >
          Clear
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 text-xs">
        <select
          className="bg-bg border border-border rounded px-2 py-1.5 text-text text-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="text-text-dim">{filtered.length} events</span>
      </div>

      {/* Event list */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {filtered.length === 0 ? (
            <div className="text-sm text-text-dim text-center py-8">Waiting for events...</div>
          ) : (
            filtered.map((e, i) => (
              <div key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-left"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <EventBadge event={e.event} />
                  <span className="text-text-dim truncate flex-1">
                    {JSON.stringify(e.payload).slice(0, 100)}
                  </span>
                  <span className="text-text-dim tabular-nums shrink-0">{timeAgo(e.ts)}</span>
                </button>
                {expanded === i && (
                  <pre className="px-4 pb-3 text-xs text-gray-400 overflow-auto max-h-60">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                )}
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
  return <span className={cn('px-1.5 py-0.5 rounded text-xs border shrink-0', color)}>{event}</span>;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}
