import { useFacts } from '@/hooks/use-facts';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function WorldGraph() {
  const factsQuery = useFacts();
  const facts = factsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="World Graph"
        description={`Content-addressed verified facts (${facts.length})`}
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

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {facts.length === 0 ? (
          <EmptyState message="No facts in the world graph — run tasks to populate" />
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">Pattern</th>
                  <th className="px-4 py-2">Oracle</th>
                  <th className="px-4 py-2">Confidence</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 font-mono text-xs">{f.target}</td>
                    <td className="px-4 py-2 text-xs text-text-dim">{f.pattern}</td>
                    <td className="px-4 py-2 text-xs text-text-dim">{f.oracleName}</td>
                    <td className="px-4 py-2 text-xs tabular-nums">
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
                    <td className="px-4 py-2 text-xs text-text-dim">{new Date(f.verifiedAt).toLocaleString()}</td>
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
