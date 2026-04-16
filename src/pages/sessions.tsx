import { useEffect } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';

export default function Sessions() {
  const sessions = useVinyanStore((s) => s.sessions);
  const fetchSessions = useVinyanStore((s) => s.fetchSessions);
  const createSession = useVinyanStore((s) => s.createSession);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sessions</h2>
          <p className="text-sm text-text-dim mt-0.5">Conversation sessions</p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
          onClick={() => createSession()}
        >
          New Session
        </button>
      </div>

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
                  <td className="px-4 py-2 font-mono text-xs text-accent">{s.id}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{s.source}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium border',
                        s.status === 'active'
                          ? 'bg-green/10 text-green border-green/30'
                          : 'bg-gray-800 text-gray-500 border-gray-700',
                      )}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{s.taskCount}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {s.status === 'active' && s.taskCount > 0 && (
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                        onClick={async () => {
                          try {
                            await fetch(`/api/v1/sessions/${s.id}/compact`, { method: 'POST' });
                            fetchSessions();
                          } catch { /* silent */ }
                        }}
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
