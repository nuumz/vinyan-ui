import { useEffect, useState } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-green/10 text-green border-green/30'
      : status === 'failed'
        ? 'bg-red/10 text-red border-red/30'
        : status === 'escalated' || status === 'uncertain'
          ? 'bg-yellow/10 text-yellow border-yellow/30'
          : 'bg-accent/10 text-accent border-accent/30';
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', color)}>{status}</span>;
}

export default function Tasks() {
  const tasks = useVinyanStore((s) => s.tasks);
  const fetchTasks = useVinyanStore((s) => s.fetchTasks);
  const submitTask = useVinyanStore((s) => s.submitTask);
  const cancelTask = useVinyanStore((s) => s.cancelTask);
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState<'reasoning' | 'code'>('reasoning');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    try {
      await submitTask({ goal, taskType, budget: { maxTokens: 50000, maxDurationMs: 60000, maxRetries: 3 } });
      setGoal('');
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tasks</h2>
          <p className="text-sm text-text-dim mt-0.5">Task execution history</p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'New Task'}
        </button>
      </div>

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
              className="px-4 py-2 rounded font-medium text-sm bg-green/20 text-green border border-green/30 hover:bg-green/30 transition-colors mt-5"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {tasks.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No tasks yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-dim text-xs">
                <th className="px-4 py-2">Task ID</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Details</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.taskId} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-xs text-accent">{t.taskId}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2">
                    {t.result?.answer && (
                      <span className="text-xs text-text-dim truncate block max-w-xs">{t.result.answer}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {t.status === 'running' && (
                      <button
                        type="button"
                        className="px-2 py-0.5 text-xs rounded bg-red/20 text-red border border-red/30 hover:bg-red/30 transition-colors"
                        onClick={() => cancelTask(t.taskId)}
                      >
                        Cancel
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
