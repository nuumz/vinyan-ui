import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Play, X } from 'lucide-react';
import { useProvidePartialFailureDecision } from '@/hooks/use-approvals';
import type { PendingPartialDecision, PlanStep } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

interface PartialDecisionCardProps {
  sessionId: string;
  pending: PendingPartialDecision;
  /** Resolved plan steps from the live turn — used to label step ids. */
  planSteps: PlanStep[];
  /** Wall-clock "now" in ms (parent ticks it on a 1s interval). */
  nowMs: number;
  /**
   * Historical replay mode. Hides the continue/abort buttons and the
   * countdown — the gate is shown as a recorded "decision was needed"
   * snapshot, not an interactive prompt. The user's resolution itself is
   * not on this card; if it landed in the persisted log the reducer
   * cleared `pendingPartialDecision`, so seeing this card historically
   * means the recording stopped before the user answered.
   */
  readOnly?: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function labelFor(planSteps: PlanStep[], stepId: string): string {
  const step = planSteps.find((s) => s.id === stepId);
  if (!step) return stepId;
  // Prefer agentId (the persona chip in the multi-agent case) for the
  // user-facing line — matches the chip they see in PlanSurface. Fall back
  // to label, then id.
  if (step.agentId) return `${step.agentId} — ${step.label}`;
  return step.label || stepId;
}

/**
 * Inline runtime decision card shown when the workflow paused on a
 * partial-failure gate (delegate-sub-agent failed + dependent step
 * cascade-skipped). Replaces the old behaviour where the executor
 * silently shipped a deterministic aggregation of survivors as the
 * final answer — the user couldn't tell that the planned work had
 * degraded out from under them.
 *
 * Two actions:
 *   - "Continue" — ship the partial result as `status='partial'`
 *   - "Abort"    — fail the task with rationale (no answer leak)
 *
 * Tear-down comes from the matching SSE event the reducer listens for,
 * not from the mutation's onSuccess — so the card disappears for ALL
 * connected clients, not just the one that POSTed.
 */
export function PartialDecisionCard({
  sessionId,
  pending,
  planSteps,
  nowMs,
  readOnly = false,
}: PartialDecisionCardProps) {
  const provide = useProvidePartialFailureDecision();
  const [previewOpen, setPreviewOpen] = useState(false);

  const remainingMs = Math.max(0, pending.timeoutMs - (nowMs - pending.at));
  const expired = remainingMs === 0;
  const busy = provide.isPending;

  const failedLabels = useMemo(
    () => pending.failedStepIds.map((id) => labelFor(planSteps, id)),
    [pending.failedStepIds, planSteps],
  );
  const skippedLabels = useMemo(
    () => pending.skippedStepIds.map((id) => labelFor(planSteps, id)),
    [pending.skippedStepIds, planSteps],
  );
  const completedLabels = useMemo(
    () => pending.completedStepIds.map((id) => labelFor(planSteps, id)),
    [pending.completedStepIds, planSteps],
  );

  const submit = (decision: 'continue' | 'abort') => {
    if (busy || expired) return;
    provide.mutate({
      sessionId,
      taskId: pending.taskId,
      decision,
    });
  };

  return (
    <div className="border border-yellow/40 bg-yellow/5 rounded-md p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-yellow shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-yellow font-medium">
            Decide before shipping the partial result
          </div>
          <div className="text-xs text-text/85 mt-0.5">{pending.summary}</div>
        </div>
        {!readOnly && (
          <div
            className={cn(
              'shrink-0 text-[10px] font-mono tabular-nums',
              expired ? 'text-red' : 'text-text-dim',
            )}
            title="Time before the executor auto-aborts"
          >
            {expired ? 'expired' : `${formatRemaining(remainingMs)} left`}
          </div>
        )}
      </div>

      <div className="text-[11.5px] space-y-1 pl-1">
        {failedLabels.length > 0 && (
          <div>
            <span className="text-red font-medium">Failed:</span>{' '}
            <span className="text-text/90">{failedLabels.join(', ')}</span>
          </div>
        )}
        {skippedLabels.length > 0 && (
          <div>
            <span className="text-text-dim font-medium">Skipped (dep failed):</span>{' '}
            <span className="text-text/90">{skippedLabels.join(', ')}</span>
          </div>
        )}
        {completedLabels.length > 0 && (
          <div>
            <span className="text-green font-medium">Completed:</span>{' '}
            <span className="text-text/90">{completedLabels.join(', ')}</span>
          </div>
        )}
      </div>

      {pending.partialPreview && (
        <div className="border-t border-yellow/20 pt-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-text-dim hover:text-text/85"
            aria-expanded={previewOpen}
          >
            <ChevronRight
              size={9}
              className={cn('transition-transform', previewOpen && 'rotate-90')}
            />
            {previewOpen ? 'Hide preview' : 'Preview what would ship'}
          </button>
          {previewOpen && (
            <div className="mt-1.5 max-h-48 overflow-auto text-[11.5px] text-text/85 border-l border-border/30 pl-2.5">
              <Markdown content={pending.partialPreview} />
            </div>
          )}
        </div>
      )}

      {!readOnly ? (
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          <button
            type="button"
            onClick={() => submit('continue')}
            disabled={busy || expired}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
              'bg-yellow/15 hover:bg-yellow/25 border border-yellow/40 text-yellow',
              (busy || expired) && 'opacity-50 cursor-not-allowed hover:bg-yellow/15',
            )}
          >
            <Play size={11} /> Continue with partial
          </button>
          <button
            type="button"
            onClick={() => submit('abort')}
            disabled={busy || expired}
            autoFocus
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors',
              'bg-red/10 hover:bg-red/20 border border-red/40 text-red',
              (busy || expired) && 'opacity-50 cursor-not-allowed hover:bg-red/10',
            )}
          >
            <X size={11} /> Abort
          </button>
          {expired && (
            <span className="text-[10px] text-text-dim italic">
              timeout reached — executor will auto-abort
            </span>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-text-dim italic">
          Read-only — no continue/abort decision recorded.
        </div>
      )}
    </div>
  );
}
