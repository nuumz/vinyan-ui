/**
 * Session timeline — the scrollable body of `SessionChat`.
 *
 * Composes the modular Card + Timeline architecture:
 *   - `<MessageBubble>` (a.k.a. `MessageCard`) for user / assistant turns
 *   - `<HistoricalProcessCard>` (a.k.a. `ProcessReplayTree`) rendered as a
 *     sibling above each agentic-workflow assistant turn
 *   - `<StreamingBubble>` for the live in-flight turn (active background
 *     timeline indicator, "Planning · Decomposing" stage card, elapsed
 *     counter)
 *   - `<TaskApprovalCard>` for pending A6 approval gates
 *
 * Pure visual extract from `pages/session-chat.tsx`. Owns layout and the
 * bottom auto-scroll anchor. Doesn't fetch — props are pre-resolved by the
 * parent so the timeline never duplicates a `useTasks` / `useApprovals`
 * subscription.
 */
import { Fragment, type RefObject } from 'react';
import type { ConversationEntry, PendingApproval, Session, TaskSummary } from '@/lib/api-client';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { HistoricalProcessCard } from './historical-process-card';
import { MessageBubble } from './message-bubble';
import { StreamingBubble } from './streaming-bubble';
import { TaskApprovalCard } from './task-approval-card';
import { TaskCard } from './task-card';

export interface SessionTimelineProps {
  sessionId: string;
  /** Session detail from the page-level query. Powers TaskCard at the top. */
  session?: Session | null;
  visibleMessages: ConversationEntry[];
  /** Streaming turn from the per-session zustand store. `null` between turns. */
  turn: StreamingTurn | null;
  /** Whether the streaming bubble should render (computed by the parent). */
  showStreaming: boolean;
  /** Wall-clock now ticked by the parent for live elapsed counters. */
  nowMs: number;
  /** Pending A6 approval gates filtered to this session. */
  sessionApprovals: PendingApproval[];
  /** Tasks scoped to this session — drives TaskCard's retry button. */
  sessionTasks?: TaskSummary[];
  /** Pending clarifications carried in /messages session payload. */
  pendingClarifications?: string[];
  /** Empty-state context — drives the "auto-created by API" copy variant. */
  emptyState?: { source?: string; taskCount?: number };
  /** Retry handler invoked by the streaming bubble on transient failure. */
  onRetry: () => void;
  /** Bottom anchor — used by the parent's auto-scroll effects. */
  bottomRef: RefObject<HTMLDivElement | null>;
}

/**
 * Lifecycle statuses for which we surface the persisted process card as a
 * sibling above the response bubble. Mirrors the policy in `session-chat.tsx`
 * — agentic-workflow turns get the process card pinned visible after
 * completion so plan + sub-agent activity stays auditable.
 */
const SHOW_PROCESS_SIBLING_APPROACHES = new Set<string>(['agentic-workflow']);

export function SessionTimeline({
  sessionId,
  session,
  visibleMessages,
  turn,
  showStreaming,
  nowMs,
  sessionApprovals,
  sessionTasks,
  pendingClarifications = [],
  emptyState,
  onRetry,
  bottomRef,
}: SessionTimelineProps) {
  return (
    <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
      {session && (
        <TaskCard
          session={session}
          liveTurn={turn}
          sessionApprovals={sessionApprovals}
          sessionTasks={sessionTasks}
          pendingClarifications={pendingClarifications}
          nowMs={nowMs}
        />
      )}

      {visibleMessages.length === 0 && !showStreaming && (
        <EmptyState source={emptyState?.source} taskCount={emptyState?.taskCount ?? 0} />
      )}

      {visibleMessages.map((msg) => {
        const showProcessSibling =
          msg.role === 'assistant' &&
          !!msg.taskId &&
          !!msg.traceSummary?.approach &&
          SHOW_PROCESS_SIBLING_APPROACHES.has(msg.traceSummary.approach);
        return (
          <Fragment key={`${msg.role}-${msg.timestamp}-${msg.taskId}`}>
            {showProcessSibling && (
              <div className="flex justify-start">
                <div className="max-w-[88%] w-full">
                  <HistoricalProcessCard taskId={msg.taskId} />
                </div>
              </div>
            )}
            <MessageBubble message={msg} />
          </Fragment>
        );
      })}

      {showStreaming && turn && (
        <StreamingBubble
          turn={turn}
          sessionId={sessionId}
          nowMs={nowMs}
          onRetry={onRetry}
        />
      )}

      {sessionApprovals.length > 0 && (
        <div className="space-y-2">
          {sessionApprovals.map((a) => (
            <TaskApprovalCard
              key={a.approvalId ?? `${a.taskId}:${a.approvalKey ?? 'default'}`}
              pending={a}
            />
          ))}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function EmptyState({ source, taskCount }: { source?: string; taskCount: number }) {
  if (source === 'api' && taskCount > 0) {
    return (
      <div className="text-text-dim text-sm text-center py-12 space-y-2">
        <div>This session was auto-created by the async-task API.</div>
        <div className="text-xs">
          It holds {taskCount} task{taskCount === 1 ? '' : 's'} but no chat turns — view them on the{' '}
          <a href="/tasks" className="text-accent hover:underline">
            Tasks page
          </a>
          .
        </div>
      </div>
    );
  }
  return (
    <div className="text-text-dim text-sm text-center py-12 space-y-2">
      <div>Send a message to start the conversation</div>
    </div>
  );
}
