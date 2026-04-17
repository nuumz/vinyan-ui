import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useFacts } from '@/hooks/use-facts';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

export default function WorldGraph() {
  const factsQuery = useFacts();
  const facts = factsQuery.data ?? [];
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState<ConfidenceFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facts.filter((f) => {
      if (confidence === 'high' && f.confidence < 0.9) return false;
      if (confidence === 'medium' && (f.confidence < 0.6 || f.confidence >= 0.9)) return false;
      if (confidence === 'low' && f.confidence >= 0.6) return false;
      if (!q) return true;
      return (
        f.target.toLowerCase().includes(q) ||
        f.pattern.toLowerCase().includes(q) ||
        f.oracleName.toLowerCase().includes(q) ||
        f.sourceFile.toLowerCase().includes(q)
      );
    });
  }, [facts, search, confidence]);

  const counts = useMemo(() => {
    const out = { all: facts.length, high: 0, medium: 0, low: 0 };
    for (const f of facts) {
      if (f.confidence >= 0.9) out.high++;
      else if (f.confidence >= 0.6) out.medium++;
      else out.low++;
    }
    return out;
  }, [facts]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="World Graph"
        description={`Content-addressed verified facts (${filtered.length} of ${facts.length})`}
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => factsQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} className={factsQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['all', 'high', 'medium', 'low'] as ConfidenceFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setConfidence(c)}
              className={cn(
                'px-2.5 py-1 text-xs rounded border transition-colors',
                confidence === c
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-surface text-text-dim border-border hover:text-text',
              )}
            >
              {c === 'all' ? 'All' : c === 'high' ? '≥90%' : c === 'medium' ? '60–90%' : '<60%'}
              <span className="ml-1.5 text-[10px] tabular-nums">{counts[c]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search target, pattern, oracle, source…"
            className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-80"
          />
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            message={
              facts.length === 0
                ? 'No facts in the world graph — run tasks to populate'
                : 'No facts match filters'
            }
          />
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">Pattern</th>
                  <th className="px-4 py-2">Oracle</th>
                  <th className="px-4 py-2 text-right">Confidence</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 font-mono text-xs">{f.target}</td>
                    <td className="px-4 py-2 text-xs text-text-dim">{f.pattern}</td>
                    <td className="px-4 py-2 text-xs text-text-dim">{f.oracleName}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-right">
                      <span
                        className={
                          f.confidence >= 0.9
                            ? 'text-green'
                            : f.confidence >= 0.6
                              ? 'text-yellow'
                              : 'text-red'
                        }
                      >
                        {(f.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-dim">{f.sourceFile}</td>
                    <td className="px-4 py-2 text-xs text-text-dim">
                      {new Date(f.verifiedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
