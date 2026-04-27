import { useState } from 'react';
import { useTasks, useSubmitTask, useCancelTask } from '@/hooks/use-tasks';
import { useApprovals, useResolveApproval } from '@/hooks/use-approvals';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/store/toast-store';
import { ChevronDown, ChevronRight, ExternalLink, MessageSquare, RefreshCw, ShieldAlert } from 'lucide-react';

const DEFAULT_TASK_BUDGET = { maxTokens: 50_000, maxDurationMs: 180_000, maxRetries: 3 } as const;
const TIMEOUT_RETRY_BUDGET = { maxTokens: 50_000, maxDurationMs: 240_000, maxRetries: 3 } as const;

function formatDuration(ms?: number): string {
  if (ms == null || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function isTimeoutTask(t: { result?: { trace?: { outcome?: string; approach?: string }; answer?: string } }): boolean {
  return (
    t.result?.trace?.outcome === 'timeout' ||
    t.result?.trace?.approach === 'wall-clock-timeout' ||
    t.result?.answer?.startsWith('Task timed out after') === true
  );
}

export default function Tasks() {
  const tasksQuery = useTasks();
  const tasks = tasksQuery.data ?? [];
  const approvalsQuery = useApprovals();
  const pendingApprovals = approvalsQuery.data ?? [];
  const submitTask = useSubmitTask();
  const cancelTask = useCancelTask();
  const resolveApproval = useResolveApproval();

  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState('');
  const [taskType, setTaskType] = useState<'reasoning' | 'code'>('reasoning');
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    try {
      await submitTask.mutateAsync({
        goal,
        taskType,
        budget: DEFAULT_TASK_BUDGET,
      });
      setGoal('');
      setShowForm(false);
      toast.success('Task submitted');
    } catch {
      // toast already surfaced by mutation onError
    }
  };

  const isRefetching = tasksQuery.isFetching;

  const handleRetryTimeout = async (task: (typeof tasks)[number]) => {
    const retryGoal = task.goal || task.result?.answer;
    if (!retryGoal?.trim()) return;
    try {
      await submitTask.mutateAsync({
        goal: retryGoal,
        taskType: task.result?.trace?.affectedFiles?.length ? 'code' : 'reasoning',
        targetFiles: task.result?.trace?.affectedFiles,
        budget: TIMEOUT_RETRY_BUDGET,
      });
      toast.success('Retry submitted with a 4m budget');
    } catch {
      // toast already surfaced by mutation onError
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
              onClick={() => tasksQuery.refetch()}
              title="Refresh"
            >
              <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
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
              disabled={submitTask.isPending || !goal.trim()}
            >
              {submitTask.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-2">
          {pendingApprovals.map((taskId) => (
            <div key={taskId} className="bg-yellow/5 border border-yellow/20 rounded-lg px-4 py-3 flex items-center gap-3">
              <ShieldAlert size={16} className="text-yellow shrink-0" />
              <div className="flex-1 text-sm">
                <span className="text-yellow font-medium">Approval required</span>
                <span className="text-text-dim ml-2 font-mono text-xs">{taskId}</span>
              </div>
              <button
                type="button"
                className="px-3 py-1 text-xs rounded bg-green/20 text-green border border-green/30 hover:bg-green/30 transition-colors"
                onClick={() => resolveApproval.mutate({ taskId, decision: 'approved' })}
                disabled={resolveApproval.isPending}
              >
                Approve
              </button>
              <button
                type="button"
                className="px-3 py-1 text-xs rounded bg-red/20 text-red border border-red/30 hover:bg-red/30 transition-colors"
                onClick={() => resolveApproval.mutate({ taskId, decision: 'rejected' })}
                disabled={resolveApproval.isPending}
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Task list */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {tasks.length === 0 ? (
          <div className="text-sm text-text-dim text-center py-8">No tasks yet — submit one above</div>
        ) : (
          <div className="divide-y divide-border/50">
            {tasks.map((t) => {
              const isExpanded = expanded === t.taskId;
              const summary = t.goal || t.result?.answer || t.result?.escalationReason;
              const answer = t.result?.answer;
              const hasDetail = !!(t.result?.trace || t.result?.qualityScore || answer);

              return (
                <div key={t.taskId} className="group">
                  {/* Main row */}
                  <div
                    className="flex items-start gap-3 px-4 py-3 hover:bg-white/2 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : t.taskId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setExpanded(isExpanded ? null : t.taskId)}
                  >
                    {/* Expand icon */}
                    <span className="mt-0.5 text-text-dim shrink-0">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Goal / summary */}
                      <div className="text-sm text-text">
                        {summary
                          ? <span className="line-clamp-2">{summary}</span>
                          : <span className="text-text-dim italic">{t.status === 'running' ? 'In progress…' : 'No description'}</span>
                        }
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-[10px] text-text-dim font-mono tabular-nums">
                        <span className="truncate max-w-[18ch]" title={t.taskId}>{t.taskId.slice(0, 8)}</span>
                        {t.result?.trace && (
                          <>
                            <span>L{t.result.trace.routingLevel}</span>
                            {t.result.trace.tokensConsumed > 0 && (
                              <span>{t.result.trace.tokensConsumed.toLocaleString()} tok</span>
                            )}
                            {t.result.trace.durationMs > 0 && (
                              <span>{formatDuration(t.result.trace.durationMs)}</span>
                            )}
                            {t.result.trace.modelUsed && t.result.trace.modelUsed !== 'none' && (
                              <span>{t.result.trace.modelUsed}</span>
                            )}
                          </>
                        )}
                        {t.sessionId && (
                          <a
                            href={`/sessions/${t.sessionId}`}
                            className="inline-flex items-center gap-0.5 text-accent hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            title="Open session"
                          >
                            <MessageSquare size={9} /> Chat
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={t.status} />
                      {t.status === 'running' && (
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs rounded bg-red/20 text-red border border-red/30 hover:bg-red/30 transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelTask.mutate(t.taskId);
                            toast.info('Task cancelled');
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && hasDetail && (
                    <div className="px-4 pb-3 pl-11 space-y-2">
                      {/* Answer */}
                      {answer && (
                        <div className="bg-bg/50 rounded-md p-3 text-sm text-text whitespace-pre-wrap border border-border/50">
                          {answer}
                          {isTimeoutTask(t) && (
                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/40 pt-2 text-xs">
                              <span className="text-text-dim">
                                This task exceeded its time budget. Retry with a longer budget to let the workflow finish.
                              </span>
                              <button
                                type="button"
                                className="shrink-0 rounded px-2 py-1 bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
                                onClick={() => handleRetryTimeout(t)}
                                disabled={submitTask.isPending}
                              >
                                Retry 4m
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Trace details */}
                      {t.result?.trace && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
                          <span>Route: <span className="text-text">L{t.result.trace.routingLevel}</span></span>
                          <span>Tokens: <span className="text-text tabular-nums">{t.result.trace.tokensConsumed.toLocaleString()}</span></span>
                          <span>Duration: <span className="text-text tabular-nums">{formatDuration(t.result.trace.durationMs)}</span></span>
                          <span>Model: <span className="text-text">{t.result.trace.modelUsed ?? '-'}</span></span>
                          {t.result.trace.approach && (
                            <span>Approach: <span className="text-text">{t.result.trace.approach}</span></span>
                          )}
                        </div>
                      )}

                      {/* Quality score */}
                      {t.result?.qualityScore && (
                        <div className="text-xs text-text-dim">
                          Quality: <span className="text-text tabular-nums">{t.result.qualityScore.composite.toFixed(2)}</span>
                          <span className="ml-2">({t.result.qualityScore.dimensionsAvailable}D {t.result.qualityScore.phase})</span>
                        </div>
                      )}

                      {/* Full task ID */}
                      <div className="text-[10px] text-text-dim font-mono flex items-center gap-2">
                        <span>ID: {t.taskId}</span>
                        {t.sessionId && (
                          <a
                            href={`/sessions/${t.sessionId}`}
                            className="inline-flex items-center gap-0.5 text-accent hover:underline"
                          >
                            <ExternalLink size={9} /> Open in Chat
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
