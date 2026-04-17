import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, MessageSquare } from 'lucide-react';
import { useSessions, useCreateSession, useCompactSession } from '@/hooks/use-sessions';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/lib/utils';

export default function Sessions() {
  const sessionsQuery = useSessions();
  const sessions = sessionsQuery.data ?? [];
  const createSession = useCreateSession();
  const compactSession = useCompactSession();
  const navigate = useNavigate();

  const handleCreate = () => {
    if (createSession.isPending) return;
    createSession.mutate(undefined, {
      onSuccess: (result) => {
        if (result?.session) navigate(`/sessions/${result.session.id}`);
      },
    });
  };

  // Active first, then newest first
  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return b.createdAt - a.createdAt;
      }),
    [sessions],
  );

  const showSkeleton = sessionsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessions"
        description={`Conversation sessions (${sessions.length})`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
              onClick={() => sessionsQuery.refetch()}
              disabled={sessionsQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw size={14} className={sessionsQuery.isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={handleCreate}
              disabled={createSession.isPending}
            >
              <Plus size={14} />
              {createSession.isPending ? 'Creating…' : 'New Session'}
            </button>
          </div>
        }
      />

      {showSkeleton ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {sorted.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <MessageSquare size={32} className="text-text-dim/50" />
              <div className="text-sm text-text-dim">No sessions yet</div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
                onClick={handleCreate}
                disabled={createSession.isPending}
              >
                <Plus size={14} />
                Start a conversation
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Session ID</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  >
                    <td className="px-4 py-2">
                      <Link
                        to={`/sessions/${s.id}`}
                        className="font-mono text-xs text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-text-dim">{s.source}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right">{s.taskCount}</td>
                    <td
                      className="px-4 py-2 text-xs text-text-dim"
                      title={new Date(s.createdAt).toLocaleString()}
                    >
                      {timeAgo(s.createdAt)}
                    </td>
                    <td
                      className="px-4 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.status === 'active' && s.taskCount > 0 && (
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          onClick={() =>
                            compactSession.mutate(s.id)
                          }
                          disabled={compactSession.isPending && compactSession.variables === s.id}
                          title="Summarize history to reduce token usage"
                        >
                          {compactSession.isPending && compactSession.variables === s.id
                            ? 'Compacting…'
                            : 'Compact'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
