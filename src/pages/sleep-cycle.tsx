import { useState } from 'react';
import { RefreshCw, Moon, Play, Clock } from 'lucide-react';
import { useSleepCycle, useTriggerSleepCycle } from '@/hooks/use-sleep-cycle';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { ConfirmDialog } from '@/components/ui/confirm';
import { cn, timeAgo } from '@/lib/utils';

export default function SleepCycle() {
  const query = useSleepCycle();
  const trigger = useTriggerSleepCycle();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status = query.data;

  const handleTrigger = async () => {
    try {
      await trigger.mutateAsync();
    } catch {
      /* toast handled in hook */
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sleep Cycle"
        description="Pattern mining + rule promotion — runs automatically every N sessions or on demand."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!status?.enabled || trigger.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50"
            >
              <Play size={12} />
              Trigger now
            </button>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {query.isLoading && <EmptyState message="Loading status…" />}

      {status && !status.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <Moon size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">Sleep cycle runner is not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Requires a persistent database and evolution config in{' '}
            <code className="bg-bg px-1 rounded">vinyan.json</code>.
          </div>
        </div>
      )}

      {status && status.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Runs"
              value={status.totalRuns}
              sub="completed cycles"
            />
            <StatCard
              title="Interval"
              value={status.interval != null ? `${status.interval}` : '—'}
              sub={status.interval != null ? 'sessions / cycle' : undefined}
            />
            <StatCard
              title="Patterns"
              value={status.patternsExtracted}
              sub="in pattern store"
            />
            <StatCard
              title="Last Run"
              value={status.recentRuns[0] ? timeAgo(status.recentRuns[0]) : '—'}
              sub={status.recentRuns[0] ? 'ago' : 'never'}
            />
          </div>

          <div className="bg-surface rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-3">
              Recent Cycles
            </h3>
            {status.recentRuns.length === 0 ? (
              <div className="text-sm text-text-dim">
                No completed cycles yet. Trigger manually or run more tasks to accumulate traces.
              </div>
            ) : (
              <ol className="space-y-1.5">
                {status.recentRuns.map((ts, i) => (
                  <li
                    key={ts}
                    className={cn(
                      'flex items-center gap-3 text-sm py-1',
                      i === 0 ? 'text-text' : 'text-text-dim',
                    )}
                  >
                    <Clock size={12} className="shrink-0" />
                    <span className="tabular-nums">{new Date(ts).toLocaleString()}</span>
                    <span className="ml-auto text-xs">{timeAgo(ts)} ago</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => (trigger.isPending ? undefined : setConfirmOpen(false))}
        onConfirm={handleTrigger}
        title="Trigger sleep cycle?"
        description={
          <div>
            <div>
              A sleep cycle will analyze recent traces, extract patterns, and promote eligible
              rules.
            </div>
            <div className="mt-2 text-xs text-text-dim">
              Runs in the background. Results appear via SSE when complete.
            </div>
          </div>
        }
        confirmLabel="Trigger"
        busy={trigger.isPending}
      />
    </div>
  );
}
