import { useRules } from '@/hooks/use-rules';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function Rules() {
  const { data: rules = [] } = useRules();

  return (
    <div className="space-y-4">
      <PageHeader title="Rules" description={`Active evolution rules (${rules.length})`} />

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {rules.length === 0 ? (
          <EmptyState message="No rules yet — rules emerge after sufficient traces and sleep cycles" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-4 py-2 text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{r.condition}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
