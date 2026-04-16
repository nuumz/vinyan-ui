import { Link } from 'react-router-dom';
import { useVinyanStore } from '@/store/vinyan-store';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/store/toast-store';

export default function Sessions() {
  const sessions = useVinyanStore((s) => s.sessions);
  const createSession = useVinyanStore((s) => s.createSession);
  const compactSession = useVinyanStore((s) => s.compactSession);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessions"
        description={`Conversation sessions (${sessions.length})`}
        actions={
          <button
            type="button"
            className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
            onClick={() => { createSession(); toast.success('Session created'); }}
          >
            New Session
          </button>
        }
      />

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {sessions.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No sessions</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Session ID</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Tasks</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <Link to={`/sessions/${s.id}`} className="font-mono text-xs text-accent hover:underline">
                      {s.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-dim">{s.source}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2 tabular-nums">{s.taskCount}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {s.status === 'active' && s.taskCount > 0 && (
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                        onClick={() => compactSession(s.id)}
                      >
                        Compact
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
