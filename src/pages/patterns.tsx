import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { usePatterns } from '@/hooks/use-patterns';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';
import type { ExtractedPattern } from '@/lib/api-client';

type TypeFilter = 'all' | ExtractedPattern['type'];

const typeVariant: Record<ExtractedPattern['type'], 'success' | 'error' | 'info' | 'warning'> = {
  'success-pattern': 'success',
  'anti-pattern': 'error',
  'worker-performance': 'info',
  'decomposition-pattern': 'warning',
};

export default function Patterns() {
  const patternsQuery = usePatterns();
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ExtractedPattern | null>(null);

  const all = patternsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (filter !== 'all' && p.type !== filter) return false;
      if (!q) return true;
      return (
        p.description.toLowerCase().includes(q) ||
        p.taskTypeSignature.toLowerCase().includes(q) ||
        (p.approach ?? '').toLowerCase().includes(q)
      );
    });
  }, [all, filter, search]);

  const counts = useMemo(() => {
    const out = {
      all: all.length,
      'success-pattern': 0,
      'anti-pattern': 0,
      'worker-performance': 0,
      'decomposition-pattern': 0,
    };
    for (const p of all) out[p.type]++;
    return out;
  }, [all]);

  const tabs: ReadonlyArray<TabItem<TypeFilter>> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'success-pattern', label: 'Success', count: counts['success-pattern'] },
    { id: 'anti-pattern', label: 'Anti', count: counts['anti-pattern'] },
    { id: 'worker-performance', label: 'Performance', count: counts['worker-performance'] },
    { id: 'decomposition-pattern', label: 'Decomposition', count: counts['decomposition-pattern'] },
  ];

  const isFetching = patternsQuery.isFetching;
  const loading = !patternsQuery.data && patternsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patterns"
        description="Extracted patterns from sleep cycle analysis — Wilson-scored with decay weighting."
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => patternsQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs items={tabs} active={filter} onChange={setFilter} className="flex-1 min-w-[24rem]" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description…"
            className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-64"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              message={all.length === 0 ? 'No patterns extracted yet' : 'No patterns match filters'}
              hint={all.length === 0 ? 'Run tasks — sleep cycle mines patterns from traces' : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Frequency</th>
                  <th className="px-4 py-2 text-right">Confidence</th>
                  <th className="px-4 py-2 text-right">Decay</th>
                  <th className="px-4 py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={cn(
                      'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                      selected?.id === p.id && 'bg-white/[0.02]',
                    )}
                  >
                    <td className="px-4 py-2">
                      <Badge variant={typeVariant[p.type]}>{p.type}</Badge>
                    </td>
                    <td className="px-4 py-2 text-text truncate max-w-[32rem]">{p.description}</td>
                    <td className="px-4 py-2 tabular-nums text-right">{p.frequency}</td>
                    <td className="px-4 py-2 tabular-nums text-right">
                      {(p.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right text-text-dim">
                      {p.decayWeight.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                      {timeAgo(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Pattern"
        subtitle={selected?.id}
        width="xl"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div>
              <Badge variant={typeVariant[selected.type]}>{selected.type}</Badge>
            </div>
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Description</div>
              <div className="bg-bg rounded p-3 whitespace-pre-wrap">{selected.description}</div>
            </div>
            <Row label="Task signature" value={<code className="text-xs">{selected.taskTypeSignature}</code>} />
            <Row label="Frequency" value={selected.frequency} />
            <Row label="Confidence (Wilson LB)" value={`${(selected.confidence * 100).toFixed(1)}%`} />
            <Row label="Decay weight" value={selected.decayWeight.toFixed(3)} />
            {selected.qualityDelta !== undefined && (
              <Row label="Quality delta" value={selected.qualityDelta.toFixed(3)} />
            )}
            {selected.routingLevel !== undefined && (
              <Row label="Routing level" value={`L${selected.routingLevel}`} />
            )}
            {selected.workerId && <Row label="Worker" value={selected.workerId} />}
            {selected.approach && (
              <div>
                <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Approach</div>
                <div className="bg-bg rounded p-3 text-xs whitespace-pre-wrap">{selected.approach}</div>
              </div>
            )}
            <Row label="Created" value={timeAgo(selected.createdAt)} />
          </div>
        )}
      </DetailDrawer>
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
