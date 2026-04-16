import { useState, useMemo } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { EventBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { timeAgo } from '@/lib/utils';

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
      <PageHeader
        title="Events"
        description="Real-time event stream"
        actions={
          <button
            type="button"
            className="px-3 py-1.5 rounded text-xs text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={clearEvents}
          >
            Clear
          </button>
        }
      />

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
