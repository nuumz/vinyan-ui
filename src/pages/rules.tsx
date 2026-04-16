import { useEffect } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';

export default function Rules() {
  const rules = useVinyanStore((s) => s.rules);
  const fetchRules = useVinyanStore((s) => s.fetchRules);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Rules</h2>
        <p className="text-sm text-text-dim mt-0.5">Active evolution rules</p>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {rules.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">
            No rules yet — rules emerge after sufficient traces and sleep cycles
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{r.condition}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{r.action}</td>
                  <td className="px-4 py-2 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
