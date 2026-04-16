import { useState } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/store/toast-store';
import { RefreshCw } from 'lucide-react';

export default function Tasks() {
  const tasks = useVinyanStore((s) => s.tasks);
  const tasksLoading = useVinyanStore((s) => s.tasksLoading);
  const fetchTasks = useVinyanStore((s) => s.fetchTasks);
  const submitTask = useVinyanStore((s) => s.submitTask);
  const cancelTask = useVinyanStore((s) => s.cancelTask);
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState<'reasoning' | 'code'>('reasoning');
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    try {
      await submitTask({ goal, taskType, budget: { maxTokens: 50000, maxDurationMs: 60000, maxRetries: 3 } });
      setGoal('');
      setShowForm(false);
      toast.success('Task submitted');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} task${tasks.length !== 1 ? 's' : ''} — auto-refreshes via SSE`}
        actions={
          <>
            <button
              type="button"
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
              onClick={fetchTasks}
              title="Refresh"
            >
              <RefreshCw size={14} className={tasksLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel' : 'New Task'}
            </button>
          </>
        }
      />

      {/* Submit form */}
      {showForm && (
        <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
          <div>
            <label className="text-xs text-text-dim block mb-1">Goal</label>
            <input
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder-gray-500 focus:outline-none focus:border-accent"
              placeholder="Describe the task..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-text-dim block mb-1">Type</label>
              <select
                className="bg-bg border border-border rounded px-3 py-2 text-sm text-text"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as 'reasoning' | 'code')}
              >
                <option value="reasoning">Reasoning</option>
                <option value="code">Code</option>
              </select>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded font-medium text-sm bg-green/20 text-green border border-green/30 hover:bg-green/30 transition-colors mt-5 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting || !goal.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {tasks.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No tasks yet — submit one above</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Task ID</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Details</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.taskId} className="border-b border-border/50 hover:bg-white/[0.02] group">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="font-mono text-xs text-accent hover:underline"
                      onClick={() => setExpanded(expanded === t.taskId ? null : t.taskId)}
                    >
                      {t.taskId}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-text-dim max-w-sm truncate">
                    {t.result?.answer ?? t.result?.escalationReason ?? (t.status === 'running' ? 'In progress...' : '-')}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.status === 'running' && (
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs rounded bg-red/20 text-red border border-red/30 hover:bg-red/30 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => { cancelTask(t.taskId); toast.info('Task cancelled'); }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {/* Expanded detail row */}
              {expanded &&
                tasks
                  .filter((t) => t.taskId === expanded && t.result)
                  .map((t) => (
                    <tr key={`${t.taskId}-detail`}>
                      <td colSpan={4} className="px-4 py-3 bg-bg/50">
                        <div className="space-y-2 text-xs">
                          {t.result?.answer && (
                            <div>
                              <span className="text-text-dim">Answer: </span>
                              <span className="text-text">{t.result.answer}</span>
                            </div>
                          )}
                          {t.result?.trace && (
                            <div className="grid grid-cols-4 gap-2 text-text-dim">
                              <div>
                                Route: <span className="text-text">L{t.result.trace.routingLevel}</span>
                              </div>
                              <div>
                                Tokens: <span className="text-text tabular-nums">{t.result.trace.tokensConsumed}</span>
                              </div>
                              <div>
                                Duration: <span className="text-text tabular-nums">{t.result.trace.durationMs}ms</span>
                              </div>
                              <div>
                                Model: <span className="text-text">{t.result.trace.modelUsed ?? '-'}</span>
                              </div>
                            </div>
                          )}
                          {t.result?.qualityScore && (
                            <div className="text-text-dim">
                              Quality: <span className="text-text tabular-nums">{t.result.qualityScore.composite.toFixed(2)}</span>
                              <span className="ml-2">({t.result.qualityScore.dimensionsAvailable}D {t.result.qualityScore.phase})</span>
                            </div>
                          )}
                        </div>
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
