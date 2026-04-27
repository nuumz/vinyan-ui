import { useState, useMemo } from 'react';
import { useEventsStore } from '@/store/vinyan-store';
import { useConnectionStore } from '@/store/connection-store';
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
  'llm:stream_delta',
] as const;

export default function Events() {
  const events = useEventsStore((s) => s.events);
  const clearEvents = useEventsStore((s) => s.clearEvents);
  const sseConnected = useConnectionStore((s) => s.sseConnected);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Precompute preview strings once per event (stringify in render hot path is
  // expensive with 500 rows). Preview truncates at 100 chars for the summary.
  const filtered = useMemo(() => {
    const matched = filter ? events.filter((e) => e.event.includes(filter)) : events;
    return matched.map((e, i) => ({
      event: e,
      key: `${e.event}-${e.ts}-${i}`,
      preview: JSON.stringify(e.payload).slice(0, 100),
    }));
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
            <div className="text-center py-12 px-6 space-y-2">
              <div className="flex items-center justify-center gap-2 text-sm text-text-dim">
                {sseConnected ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Live — no events yet
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                    Stream disconnected — reconnecting…
                  </>
                )}
              </div>
              <div className="text-xs text-text-dim/70 max-w-md mx-auto">
                {filter
                  ? `No events match "${filter}". Clear the filter to see all events.`
                  : 'Events appear in real time when tasks run, agents work, or sessions update. Recent events are kept locally across refreshes.'}
              </div>
            </div>
          ) : (
            filtered.map(({ event: e, key, preview }) => (
              <div key={key} className="border-b border-border/50 hover:bg-white/2">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-left"
                  onClick={() => setExpanded(expanded === key ? null : key)}
                >
                  <EventBadge event={e.event} />
                  <span className="text-text-dim truncate flex-1">{preview}</span>
                  <span className="text-text-dim tabular-nums shrink-0">{timeAgo(e.ts)}</span>
                </button>
                {expanded === key && (
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
