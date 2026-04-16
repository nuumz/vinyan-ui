import { useEffect } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';

export default function WorldGraph() {
  const facts = useVinyanStore((s) => s.facts);
  const fetchFacts = useVinyanStore((s) => s.fetchFacts);

  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">World Graph</h2>
        <p className="text-sm text-text-dim mt-0.5">Content-addressed verified facts</p>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {facts.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No facts in the world graph</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">Pattern</th>
                <th className="px-4 py-2">Oracle</th>
                <th className="px-4 py-2">Confidence</th>
                <th className="px-4 py-2">Verified</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => (
                <tr key={f.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-xs">{f.target}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{f.pattern}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{f.oracleName}</td>
                  <td className="px-4 py-2 text-xs tabular-nums">{(f.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{new Date(f.verifiedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
