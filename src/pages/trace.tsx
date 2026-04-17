import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useTraces } from '@/hooks/use-traces';
import { PageHeader } from '@/components/ui/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { JsonView } from '@/components/ui/json-view';
import { cn, timeAgo } from '@/lib/utils';
import type { TraceSummary } from '@/lib/api-client';

type OutcomeFilter = 'all' | 'success' | 'failure' | 'escalated';

export default function Trace() {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const query = useTraces({
    limit: 100,
    outcome: outcome === 'all' ? undefined : outcome,
  });

  const [selected, setSelected] = useState<TraceSummary | null>(null);
  const traces = query.data?.traces ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return traces;
    return traces.filter(
      (t) =>
        t.taskId.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.approach ?? '').toLowerCase().includes(q) ||
        (t.taskTypeSignature ?? '').toLowerCase().includes(q) ||
        (t.modelUsed ?? '').toLowerCase().includes(q),
    );
  }, [traces, search]);

  const loading = !query.data && query.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trace"
        description={`Execution traces across all tasks (${query.data?.total ?? '—'} total)`}
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

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['all', 'success', 'failure', 'escalated'] as OutcomeFilter[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={cn(
                'px-2.5 py-1 text-xs rounded border transition-colors',
                outcome === o
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-surface text-text-dim border-border hover:text-text',
              )}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search task id, approach, model…"
            className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-80"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              message={traces.length === 0 ? 'No traces recorded yet' : 'No traces match filters'}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Task</th>
                  <th className="px-4 py-2">Approach</th>
                  <th className="px-4 py-2 text-right">Level</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2 text-right">Risk</th>
                  <th className="px-4 py-2 text-right">Tokens</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                  <th className="px-4 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <TraceRow
                    key={t.id}
                    trace={t}
                    selected={selected?.id === t.id}
                    onSelect={() => setSelected(t)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Trace"
        subtitle={selected?.taskId}
        width="xl"
      >
        {selected && <TraceDetail trace={selected} />}
      </DetailDrawer>
    </div>
  );
}

function TraceRow({
  trace,
  selected,
  onSelect,
}: {
  trace: TraceSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const riskColor =
    trace.riskScore == null
      ? 'text-text-dim'
      : trace.riskScore >= 0.7
        ? 'text-red'
        : trace.riskScore >= 0.4
          ? 'text-yellow'
          : 'text-green';

  return (
    <tr
      onClick={onSelect}
      className={cn(
        'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
        selected && 'bg-white/[0.02]',
      )}
    >
      <td className="px-4 py-2 font-mono text-xs truncate max-w-[14rem]" title={trace.taskId}>
        {trace.taskId}
      </td>
      <td className="px-4 py-2 text-xs text-text-dim truncate max-w-[22rem]">
        {trace.approach ?? '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        L{trace.routingLevel}
      </td>
      <td className="px-4 py-2">
        {trace.outcome ? <StatusBadge status={trace.outcome} /> : <span className="text-text-dim">—</span>}
      </td>
      <td className={cn('px-4 py-2 tabular-nums text-right text-xs', riskColor)}>
        {trace.riskScore != null ? trace.riskScore.toFixed(2) : '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {trace.tokensConsumed != null ? trace.tokensConsumed.toLocaleString() : '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {trace.durationMs != null ? `${trace.durationMs}ms` : '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {timeAgo(trace.timestamp)}
      </td>
    </tr>
  );
}

function TraceDetail({ trace }: { trace: TraceSummary }) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="Trace ID" value={<code className="text-xs">{trace.id}</code>} />
      <Row label="Task ID" value={<code className="text-xs">{trace.taskId}</code>} />
      <Row label="Routing level" value={<Badge variant="info">L{trace.routingLevel}</Badge>} />
      {trace.outcome && <Row label="Outcome" value={<StatusBadge status={trace.outcome} />} />}
      {trace.approach && <Row label="Approach" value={trace.approach} />}
      {trace.modelUsed && <Row label="Model" value={<code className="text-xs">{trace.modelUsed}</code>} />}
      {trace.taskTypeSignature && (
        <Row label="Signature" value={<code className="text-xs">{trace.taskTypeSignature}</code>} />
      )}
      {trace.tokensConsumed != null && <Row label="Tokens" value={trace.tokensConsumed.toLocaleString()} />}
      {trace.durationMs != null && <Row label="Duration" value={`${trace.durationMs}ms`} />}
      {trace.riskScore != null && <Row label="Risk score" value={trace.riskScore.toFixed(3)} />}
      <Row label="Recorded" value={new Date(trace.timestamp).toLocaleString()} />

      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Raw</div>
        <JsonView data={trace} collapsibleTopLevel={false} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}
