/**
 * TaskCard — session-level identity + "What's left" surface.
 *
 * Lives at the top of `<SessionTimeline>`, rendered at most once per
 * session. Shows session title, source, lifecycle, task count, last
 * activity, and a derived list of pending items across the live turn
 * + open approval gates.
 *
 * Pure derivation — no fetches. Parent passes pre-resolved
 * `session` / `liveTurn` / `sessionApprovals` props from the page-level
 * queries.
 */
import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock,
  HelpCircle,
  Inbox,
  Loader2,
  PauseCircle,
  RotateCw,
  StopCircle,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PendingApproval, Session, TaskSummary } from '@/lib/api-client';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { useCancelTask, useRetryTask } from '@/hooks/use-tasks';
import { cn } from '@/lib/utils';
import { DECISION_LABEL, GROUP_MODE_LABEL, summarizeTodos } from '@/lib/workflow-labels';
import { ConfirmDialog } from '@/components/ui/confirm';
import { SessionCard, SessionCardAffordance, SessionCardHeader } from './session-card';

export interface PendingItem {
  id: string;
  kind: 'running-step' | 'pending-step' | 'approval-gate' | 'human-input' | 'partial-decision' | 'pending-clarification';
  label: string;
  Icon: LucideIcon;
  tone: 'neutral' | 'info' | 'warn';
  hint?: string;
}

/**
 * Derive the aggregate "What's left" list from the live turn + open
 * approval gates. Pure — safe inside `useMemo`.
 *
 * Order priority: blocking gates (approval / human-input / partial /
 * clarification) before in-flight work (running step), before queued
 * work (pending steps).
 */
export function buildPendingItems(args: {
  liveTurn: StreamingTurn | null;
  sessionApprovals: PendingApproval[];
  pendingClarifications: string[];
}): PendingItem[] {
  const items: PendingItem[] = [];
  const turn = args.liveTurn;

  for (const approval of args.sessionApprovals) {
    items.push({
      id: `approval:${approval.approvalId ?? `${approval.taskId}:${approval.approvalKey ?? 'default'}`}`,
      kind: 'approval-gate',
      label: 'Awaiting risk approval',
      hint: approval.reason,
      Icon: PauseCircle,
      tone: 'warn',
    });
  }

  if (turn?.pendingApproval) {
    items.push({
      id: `gate:plan:${turn.pendingApproval.taskId}`,
      kind: 'approval-gate',
      label: 'Plan awaiting approval',
      Icon: PauseCircle,
      tone: 'warn',
    });
  }

  if (turn?.pendingHumanInput) {
    items.push({
      id: `gate:human:${turn.pendingHumanInput.stepId}`,
      kind: 'human-input',
      label: 'Awaiting human input',
      hint: turn.pendingHumanInput.question,
      Icon: HelpCircle,
      tone: 'warn',
    });
  }

  if (turn?.pendingPartialDecision) {
    items.push({
      id: `gate:partial:${turn.pendingPartialDecision.taskId}`,
      kind: 'partial-decision',
      label: 'Awaiting partial-failure decision',
      Icon: CircleAlert,
      tone: 'warn',
    });
  }

  for (const q of args.pendingClarifications) {
    items.push({
      id: `clarification:${q}`,
      kind: 'pending-clarification',
      label: 'Pending clarification',
      hint: q,
      Icon: HelpCircle,
      tone: 'warn',
    });
  }

  if (turn?.planSteps) {
    for (const step of turn.planSteps) {
      if (step.status === 'running') {
        items.push({
          id: `step:running:${step.id}`,
          kind: 'running-step',
          label: step.label,
          Icon: Loader2,
          tone: 'info',
        });
      }
    }
    for (const step of turn.planSteps) {
      if (step.status === 'pending') {
        items.push({
          id: `step:pending:${step.id}`,
          kind: 'pending-step',
          label: step.label,
          Icon: CircleDot,
          tone: 'neutral',
        });
      }
    }
  }

  return items;
}

interface SourceChipMeta {
  label: string;
  Icon: LucideIcon;
  cls: string;
}

function sourceChipMeta(source: string | undefined): SourceChipMeta {
  switch (source) {
    case 'api':
      return {
        label: 'API',
        Icon: Workflow,
        cls: 'bg-purple/10 text-purple border-purple/25',
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        Icon: Clock,
        cls: 'bg-blue/10 text-blue border-blue/25',
      };
    case 'ui':
    case undefined:
    case null:
    case '':
      return {
        label: 'Chat',
        Icon: Inbox,
        cls: 'bg-bg/40 text-text-dim border-border/60',
      };
    default:
      return {
        label: source,
        Icon: Inbox,
        cls: 'bg-bg/40 text-text-dim border-border/60',
      };
  }
}

function lifecycleChip(session: Pick<Session, 'archivedAt' | 'deletedAt' | 'lifecycleState'>): {
  label: string;
  cls: string;
} | null {
  if (session.deletedAt) {
    return { label: 'trashed', cls: 'bg-red/10 text-red border-red/25' };
  }
  if (session.archivedAt) {
    return { label: 'archived', cls: 'bg-bg/40 text-text-dim border-border/60' };
  }
  if (session.lifecycleState === 'compacted') {
    return { label: 'compacted', cls: 'bg-blue/10 text-blue border-blue/25' };
  }
  if (session.lifecycleState === 'suspended') {
    return { label: 'suspended', cls: 'bg-yellow/10 text-yellow border-yellow/25' };
  }
  return null;
}

function formatRelative(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 0) return 'just now';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const TONE_ICON_CLS: Record<PendingItem['tone'], string> = {
  neutral: 'text-text-dim',
  info: 'text-blue',
  warn: 'text-yellow',
};

export interface TaskCardProps {
  session: Session | null | undefined;
  liveTurn: StreamingTurn | null;
  sessionApprovals: PendingApproval[];
  pendingClarifications: string[];
  /** Tasks scoped to this session (from `useTasks`). Drives retry on the
   *  latest non-running task when it ended in failure / timeout. */
  sessionTasks?: TaskSummary[];
  /** Anchor id for command-palette / keyboard jumps (Slice 5). */
  anchorId?: string;
  /** Wall-clock now used for "last activity" copy. */
  nowMs?: number;
}

export function TaskCard({
  session,
  liveTurn,
  sessionApprovals,
  pendingClarifications,
  sessionTasks = [],
  anchorId = 'taskcard',
  nowMs,
}: TaskCardProps) {
  const [open, setOpen] = useState(true);
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const items = useMemo(
    () =>
      buildPendingItems({
        liveTurn,
        sessionApprovals,
        pendingClarifications,
      }),
    [liveTurn, sessionApprovals, pendingClarifications],
  );

  // Latest failed/timeout task in the session — drives the retry button
  // when no live turn is in flight. Uses createdAt as the ordering key
  // since updatedAt can flip on archive/unarchive without re-running.
  const latestRetryable = useMemo(() => {
    const failed = sessionTasks
      .filter(
        (t) =>
          t.status === 'failed' ||
          t.status === 'timeout' ||
          t.status === 'escalated' ||
          t.status === 'cancelled',
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return failed[0] ?? null;
  }, [sessionTasks]);

  if (!session) return null;

  const source = sourceChipMeta(session.source);
  const lifecycle = lifecycleChip(session);
  const last = session.updatedAt ?? session.createdAt;
  const now = nowMs ?? Date.now();

  return (
    <SessionCard id={anchorId} variant="primary" padded className="space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border',
                source.cls,
              )}
              title="Session source"
            >
              <source.Icon size={10} />
              {source.label}
            </span>
            <span className="text-[11px] text-text-dim">
              {session.taskCount} task{session.taskCount === 1 ? '' : 's'}
              {session.runningTaskCount > 0 && (
                <span className="text-blue ml-1">· {session.runningTaskCount} running</span>
              )}
            </span>
            <span className="text-[11px] text-text-dim flex items-center gap-1">
              <Clock size={10} />
              {formatRelative(last, now)}
            </span>
            {lifecycle && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border',
                  lifecycle.cls,
                )}
              >
                {lifecycle.label}
              </span>
            )}
          </div>
          {session.description && (
            <div className="mt-1 text-xs text-text-dim line-clamp-2">{session.description}</div>
          )}
        </div>
        <TaskCardActionRow
          liveTurn={liveTurn}
          latestRetryable={latestRetryable}
          cancelPending={cancelTask.isPending}
          retryPending={retryTask.isPending}
          onCancel={() => setConfirmCancel(true)}
          onRetry={() => {
            const taskId = liveTurn?.taskId || latestRetryable?.taskId;
            if (!taskId) return;
            retryTask.mutate({
              taskId,
              reason: 'manual-retry-from-task-card',
              maxDurationMs: 240_000,
            });
          }}
        />
      </div>

      <CurrentTurnDecisionStrip liveTurn={liveTurn} />

      {items.length > 0 && (
        <div className="border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-text-dim hover:text-text transition-colors w-full"
            aria-expanded={open}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="uppercase tracking-wide">What's left</span>
            <span className="text-text/80 font-mono normal-case tracking-normal">
              · {items.length}
            </span>
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1">
              {items.map((it) => {
                const Icon = it.Icon;
                return (
                  <li
                    key={it.id}
                    className="flex items-start gap-2 text-xs text-text"
                    title={it.hint}
                  >
                    <Icon
                      size={12}
                      className={cn(
                        'mt-0.5 shrink-0',
                        TONE_ICON_CLS[it.tone],
                        it.kind === 'running-step' && 'animate-spin',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-text-dim text-[10px] uppercase tracking-wide mr-1">
                        {it.kind.replace('-', ' ')}
                      </span>
                      <span className="text-text/85">{it.label}</span>
                      {it.hint && (
                        <span className="text-text-dim ml-1 line-clamp-1">— {it.hint}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {items.length === 0 && (
        <SessionCardHeader tone="neutral" className="border-t border-border/40 pt-2 normal-case tracking-normal">
          <CircleDot size={11} className="text-text-dim" />
          <span className="text-text-dim font-normal">
            Nothing pending — session is quiet
          </span>
        </SessionCardHeader>
      )}

      <BlockedAffordances />


      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        busy={cancelTask.isPending}
        onConfirm={() => {
          const taskId = liveTurn?.taskId;
          if (!taskId) return;
          cancelTask.mutate(taskId, { onSuccess: () => setConfirmCancel(false) });
        }}
        title="Cancel running task?"
        description="The task will stop as soon as the orchestrator picks up the signal. Partial output may already be persisted."
        confirmLabel="Cancel task"
        variant="danger"
      />
    </SessionCard>
  );
}

/**
 * Three blocked affordances surface as visible disabled chips so users
 * can see what's planned vs what's missing. Each carries an explicit
 * rationale tooltip and an RFC pointer instead of being silently absent.
 */
function BlockedAffordances() {
  return (
    <div className="border-t border-border/40 pt-2 flex items-center gap-1.5 flex-wrap">
      <SessionCardAffordance
        label="Save plan as template"
        reason="No backend endpoint for plan templates yet"
        rfcUrl="docs/design/multi-agent-hardening-roadmap.md"
      />
      <SessionCardAffordance
        label="Re-plan from current step"
        reason="No incremental re-plan endpoint — pending RFC"
        rfcUrl="docs/design/multi-agent-hardening-roadmap.md"
      />
      <SessionCardAffordance
        label="Inline status edit"
        reason="Status overrides not exposed via API"
        rfcUrl="docs/design/multi-agent-hardening-roadmap.md"
      />
    </div>
  );
}

interface TaskCardActionRowProps {
  liveTurn: StreamingTurn | null;
  latestRetryable: TaskSummary | null;
  cancelPending: boolean;
  retryPending: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

function TaskCardActionRow({
  liveTurn,
  latestRetryable,
  cancelPending,
  retryPending,
  onCancel,
  onRetry,
}: TaskCardActionRowProps) {
  const isRunning = liveTurn?.status === 'running';
  const canCancel = isRunning && !!liveTurn?.taskId;
  const canRetry = !isRunning && !!latestRetryable;

  if (!canCancel && !canRetry) return null;

  return (
    <div className="flex items-start gap-1.5 shrink-0">
      {canCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelPending}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors',
            'bg-red/10 text-red border-red/30 hover:bg-red/15',
            cancelPending && 'opacity-60 cursor-not-allowed',
          )}
          title="Cancel the running task"
        >
          {cancelPending ? <Loader2 size={11} className="animate-spin" /> : <StopCircle size={11} />}
          Cancel
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryPending}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors',
            'bg-accent/10 text-accent border-accent/30 hover:bg-accent/15',
            retryPending && 'opacity-60 cursor-not-allowed',
          )}
          title={`Retry latest failed task (${latestRetryable?.taskId.slice(0, 8)})`}
        >
          {retryPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Current-turn decision metadata strip — replaces the StageManifestSurface
 * card for non-delegate flows. Delegate flows keep the same metadata in
 * the AgentRosterCard header (already there); this surface fires only when
 * the live turn carries a decisionStage AND no delegate rows are present.
 *
 * Renders nothing for conversational / non-workflow turns.
 */
function CurrentTurnDecisionStrip({ liveTurn }: { liveTurn: StreamingTurn | null }) {
  if (!liveTurn) return null;
  const decision = liveTurn.decisionStage;
  if (!decision) return null;
  const hasDelegateRows = liveTurn.planSteps.some((s) => s.strategy === 'delegate-sub-agent');
  if (hasDelegateRows) return null;

  const counts = summarizeTodos(liveTurn.todoList);
  const decisionLabel = DECISION_LABEL[decision.decisionKind] ?? DECISION_LABEL.unknown;
  const groupMode = liveTurn.multiAgentGroupMode;

  const trail: string[] = [];
  if (decision.routingLevel !== undefined) trail.push(`L${decision.routingLevel}`);
  if (decision.confidence !== undefined)
    trail.push(`conf ${(decision.confidence * 100).toFixed(0)}%`);
  if (counts.failed > 0) trail.push(`${counts.failed} failed`);
  if (counts.skipped > 0) trail.push(`${counts.skipped} skipped`);

  return (
    <div className="border-t border-border/40 pt-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <Workflow size={11} className="text-accent shrink-0" />
        <span className="font-medium text-text/90">{decisionLabel}</span>
        {groupMode && (
          <span className="text-[10px] uppercase tracking-wide text-accent">
            {GROUP_MODE_LABEL[groupMode]}
          </span>
        )}
        {counts.total > 0 && (
          <span className="text-text-dim font-mono tabular-nums">
            {counts.done}/{counts.total}
          </span>
        )}
        {trail.length > 0 && (
          <span className="text-text-dim font-mono tabular-nums">{trail.join(' · ')}</span>
        )}
      </div>
      {decision.decisionRationale && (
        <div className="text-[11px] text-text-dim wrap-break-word">
          {decision.decisionRationale}
        </div>
      )}
    </div>
  );
}
