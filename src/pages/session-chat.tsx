import { Fragment, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSessionMessages, useSendMessage } from '@/hooks/use-chat';
import { useStreamingTurn, useStreamingTurnStore } from '@/hooks/use-streaming-turn';
import { useRecoverTurnHistory } from '@/hooks/use-recover-turn-history';
import { useSessionEventHistory } from '@/hooks/use-session-event-history';
import { useTasks, useRetryTask } from '@/hooks/use-tasks';
import { useApprovals } from '@/hooks/use-approvals';
import {
  useArchiveSession,
  useCompactSession,
  useDeleteSession,
  useUnarchiveSession,
  useUpdateSession,
} from '@/hooks/use-sessions';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { HistoricalProcessCard } from '@/components/chat/historical-process-card';
import { MessageBubble } from '@/components/chat/message-bubble';
import { StreamingBubble } from '@/components/chat/streaming-bubble';
import { TaskApprovalCard } from '@/components/chat/task-approval-card';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm';
import {
  SessionMetadataDialog,
  type SessionMetadataDialogValue,
} from '@/components/ui/session-metadata-dialog';

type ChatConfirmKind = 'archive' | 'unarchive' | 'delete' | 'compact';

/**
 * Task lifecycle statuses that mean "this task is done — no further
 * runtime activity will land on the bus." Used to gate hydrate-recovery
 * on session mount: any status NOT in this set is treated as in-flight
 * and triggers `hydrateRunningTask` so the streaming bubble can replay
 * persisted events (workflow plan, in-progress steps, paused gates).
 *
 * `pending` is intentionally NOT terminal because the lifecycle enum
 * collapses both "queued, never started" AND "paused at workflow
 * approval gate" into the same value. Hydrating a queued task with no
 * events is a no-op (empty replay); hydrating an awaiting-approval
 * task is the whole point — surfaces the actionable plan card.
 */
const TERMINAL_TASK_STATUSES = new Set<string>([
  'completed',
  'failed',
  'escalated',
  'timeout',
  'cancelled',
]);

export default function SessionChat() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? null;
  const navigate = useNavigate();
  const messagesQuery = useSessionMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);
  // Prefetch every persisted UI-visible event for the session and seed
  // each task's `task-event-history` cache. Without this, SSE only
  // forwards events from the connection time onward and per-task fetches
  // only fire when a `HistoricalProcessCard` mounts — so a fresh nav
  // back to an existing session shows nothing of the prior workflow
  // timeline (plan / steps / sub-agents) until the user expands a card.
  useSessionEventHistory(sessionId);
  const turn = useStreamingTurn(sessionId);
  const clearTurn = useStreamingTurnStore((s) => s.clear);
  const hydrateRunningTask = useStreamingTurnStore((s) => s.hydrateRunningTask);
  const dropRecoveredTurn = useStreamingTurnStore((s) => s.dropRecovered);
  const tasksQuery = useTasks();
  // A6 high-risk task approvals — fetched globally and filtered to this
  // session below. Without this surface, a task paused at the gate is
  // invisible inside the chat (the `/approvals` page shows it, the chat
  // doesn't), so the user has no inline cue that one of their messages
  // is parked waiting for sign-off.
  const approvalsQuery = useApprovals();

  // Session metadata is fetched separately so the header can render title /
  // description without waiting on /messages. The /messages payload only
  // returns `pendingClarifications` from the session, not the metadata.
  const sessionQuery = useQuery({
    // Sub-key under `qk.sessions` so the broad invalidation
    // `qc.invalidateQueries({ queryKey: qk.sessions })` issued by every
    // session mutation (update/archive/delete/restore) refetches this
    // detail too — react-query treats query keys as prefixes.
    queryKey: [...qk.sessions, 'detail', sessionId ?? ''] as const,
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
  const session = sessionQuery.data?.session;

  const updateSession = useUpdateSession();
  const archiveSession = useArchiveSession();
  const unarchiveSession = useUnarchiveSession();
  const deleteSession = useDeleteSession();
  const compactSession = useCompactSession();
  const retryTask = useRetryTask();

  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ChatConfirmKind | null>(null);

  const messages = messagesQuery.data?.messages ?? [];
  const visibleMessages = useMemo(() => {
    const deduped: typeof messages = [];
    const assistantTaskIndex = new Map<string, number>();

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.taskId) {
        const existingIndex = assistantTaskIndex.get(msg.taskId);
        if (existingIndex !== undefined) {
          deduped[existingIndex] = msg;
          continue;
        }
        assistantTaskIndex.set(msg.taskId, deduped.length);
      }
      deduped.push(msg);
    }

    return deduped;
  }, [messages]);
  const pendingClarifications = messagesQuery.data?.session?.pendingClarifications ?? [];

  // Approvals tied to this session — a parent task whose own taskId is
  // in this session, OR a delegate sub-task whose id is prefixed with one
  // of the session's parent task ids (`<parent-uuid>-delegate-step<N>`).
  // The /approvals payload doesn't carry sessionId so we reconstruct the
  // join client-side via `useTasks`.
  const sessionApprovals = useMemo(() => {
    if (!sessionId) return [];
    const approvals = approvalsQuery.data ?? [];
    if (approvals.length === 0) return [];
    const sessionTaskIds = (tasksQuery.data?.tasks ?? [])
      .filter((t) => t.sessionId === sessionId)
      .map((t) => t.taskId);
    if (sessionTaskIds.length === 0) return [];
    const filtered = approvals.filter((a) =>
      sessionTaskIds.some((tid) => a.taskId === tid || a.taskId.startsWith(`${tid}-`)),
    );
    // Defensive dedupe by the canonical slot key. The backend gate is
    // already idempotent per (taskId, approvalKey) but two payloads
    // describing the same slot would still render two stacked cards if
    // the cache was populated from overlapping sources (SSE + refetch
    // race, multi-tab). Distinct approvalKeys for the same task are
    // legitimate separate gates and are preserved.
    const seen = new Set<string>();
    const deduped: typeof filtered = [];
    for (const a of filtered) {
      const key = a.approvalId ?? `${a.taskId}:${a.approvalKey ?? 'default'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(a);
    }
    return deduped;
  }, [sessionId, approvalsQuery.data, tasksQuery.data]);
  // Treat the input as busy whenever a turn is still in flight — running OR
  // paused at the workflow approval gate. A fresh mount after navigating
  // back has no mutation state, but the turn in the zustand store still
  // tells us the previous task is mid-stream; without checking
  // `awaiting-approval` here, users could fire a second send while the
  // previous one was still parked at the gate.
  const sending =
    sendMessage.isPending ||
    turn?.status === 'running' ||
    turn?.status === 'awaiting-approval' ||
    turn?.status === 'awaiting-human-input';

  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live elapsed clock — ticks while the turn is in flight (running or
  // paused at the workflow approval gate). Without ticking during
  // awaiting-approval the bubble header would freeze and users couldn't
  // tell how long they've been holding up the run.
  useEffect(() => {
    if (!turn) return;
    if (
      turn.status !== 'running' &&
      turn.status !== 'awaiting-approval' &&
      turn.status !== 'awaiting-human-input'
    )
      return;
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [turn?.status]);

  // After a browser refresh / fresh mount, a still-running task gets a
  // `recovered: true` turn shell from `hydrateRunningTask`. The shell
  // is empty until SSE pushes new events — but events that fired BEFORE
  // the new connection (e.g. the `task:stage_update` that set the
  // "Planning · Decomposing" stage card) never replay. This hook
  // fetches the persisted event log and folds it through the same
  // reducer the live SSE path uses, restoring the on-screen state.
  useRecoverTurnHistory(sessionId, turn?.taskId ?? null, Boolean(turn?.recovered));

  useEffect(() => {
    if (!sessionId) return;
    // Hydrate ANY non-terminal task: `running` (executing), `input-required`
    // (paused at clarification), or `pending` (queued OR paused at the
    // workflow approval gate — the lifecycle enum collapses both into
    // `pending` since there's no dedicated `awaiting-approval` value).
    // Without `pending`, a session whose only task is parked at the
    // approval gate renders nothing on refresh: hydrate isn't called →
    // no recovered turn → useRecoverTurnHistory never fires → the
    // workflow plan card never appears, and the user has no way to
    // approve / reject from the chat surface. The cost of including
    // `pending` is a brief empty bubble for genuinely-queued tasks;
    // those self-correct as soon as the first event lands.
    const inFlightTask = tasksQuery.data?.tasks?.find(
      (task) => task.sessionId === sessionId && !TERMINAL_TASK_STATUSES.has(task.status),
    );
    if (inFlightTask) {
      hydrateRunningTask(sessionId, inFlightTask.taskId);
      return;
    }
    // Drop the recovered turn ONLY if the task it points to is conclusively
    // gone — i.e. tasksQuery has refreshed AND the turn's taskId appears
    // there in a terminal state. The previous condition fired whenever
    // tasksQuery had no running task for this session, which raced against
    // ingestGlobal: a cross-source task:start would create a recovered turn,
    // tasksQuery hadn't refetched yet, and we'd wipe the freshly-created
    // bubble before the user even saw the in-progress indicator. The fix
    // is to require evidence that the task is actually done, not merely
    // absent from the (possibly-stale) tasks snapshot.
    if (
      tasksQuery.isSuccess &&
      turn?.status === 'running' &&
      turn.recovered &&
      turn.taskId &&
      tasksQuery.data?.tasks?.some(
        (task) => task.taskId === turn.taskId && TERMINAL_TASK_STATUSES.has(task.status),
      )
    ) {
      dropRecoveredTurn(sessionId);
      messagesQuery.refetch();
    }
  }, [sessionId, tasksQuery.data, tasksQuery.isSuccess, hydrateRunningTask, dropRecoveredTurn, turn, messagesQuery]);

  // Clear any stale streaming bubble when switching sessions / unmounting.
  // `clearTurn` is a no-op in the store if the turn is still `running`, so
  // navigating away mid-task preserves progress — otherwise the `ingest`
  // reducer's `if (!prev) return s` guard would silently drop every
  // subsequent SSE event from the still-open fetch.
  useEffect(() => {
    return () => {
      if (sessionId) clearTurn(sessionId);
    };
  }, [sessionId, clearTurn]);

  // Track total length across the running-step's scoped output AND the
  // global finalContent so the bubble auto-scrolls during workflow runs
  // (where deltas land in `stepOutputs[runningStep.id]`, not `finalContent`,
  // until the synthesizer phase begins).
  const streamingContentLength =
    (turn?.finalContent.length ?? 0) +
    Object.values(turn?.stepOutputs ?? {}).reduce((acc, v) => acc + v.length, 0);

  // Smooth-scroll on lifecycle transitions (new message, send, status flip,
  // approval-card appears) — these are infrequent and benefit from animation.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, sending, turn?.toolCalls.length, turn?.status, sessionApprovals.length]);

  // Per-delta auto-scroll during streaming uses `behavior: 'auto'` and is
  // throttled to one scroll per animation frame. The previous code fired a
  // smooth-scroll on every character delta which produced visible flicker
  // and layout jank as the browser re-ran the animation mid-flight.
  useEffect(() => {
    if (turn?.status !== 'running') return;
    if (streamingContentLength === 0) return;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    });
    return () => cancelAnimationFrame(raf);
  }, [streamingContentLength, turn?.status]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setLastSent(text);
    sendMessage.mutate(text);
  };

  const handleRetry = () => {
    if (sending) return;
    // Prefer the parent-linked retry endpoint when we have a persisted
    // task id — it inherits sessionId / goal / targetFiles / constraints
    // from the timed-out parent and gets a generous 240s budget on the
    // backend by default. Only fall back to re-sending the original text
    // when no task id is available (very early failures, hot reload).
    const taskId = turn?.taskId;
    if (taskId) {
      retryTask.mutate({
        taskId,
        reason: 'manual-retry-from-chat',
        // Backend defaults to 240s already; pass through explicitly so the
        // intent is visible in event logs.
        maxDurationMs: 240_000,
      });
      return;
    }
    if (!lastSent) return;
    sendMessage.mutate(lastSent);
  };

  const persistedTurnMessage =
    !!turn?.taskId && visibleMessages.some((msg) => msg.role === 'assistant' && msg.taskId === turn.taskId);

  const showStreaming =
    !!turn &&
    turn.status !== 'idle' &&
    (turn.status === 'running' ||
      turn.status === 'awaiting-approval' ||
      turn.status === 'awaiting-human-input' ||
      !persistedTurnMessage);

  // Clear the streaming bubble exactly when the persisted assistant message
  // arrives in `visibleMessages` — not on a fixed timer. Tying the clear to
  // the historical refetch landing eliminates the gap where the bubble
  // disappears before the message-list refresh returns: for fast tasks
  // (<1s conversational shortcircuit) the user previously saw the user
  // bubble alone with no agent response, even though the answer was
  // already saved server-side.
  useEffect(() => {
    if (!sessionId || !turn) return;
    if (turn.status !== 'done' && turn.status !== 'input-required') return;
    if (!persistedTurnMessage) return;
    clearTurn(sessionId);
  }, [sessionId, turn, persistedTurnMessage, clearTurn]);

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <ChatHeader
        sessionId={id}
        title={session?.title ?? null}
        description={session?.description ?? null}
        archived={session?.archivedAt != null}
        deleted={session?.deletedAt != null}
        canCompact={(session?.taskCount ?? 0) >= 3 && session?.status === 'active'}
        onSaveTitle={(next) => {
          if (!sessionId) return;
          updateSession.mutate({ id: sessionId, patch: { title: next } });
        }}
        onEdit={() => setEditing(true)}
        onArchive={() => setConfirm('archive')}
        onUnarchive={() => setConfirm('unarchive')}
        onDelete={() => setConfirm('delete')}
        onCompact={() => setConfirm('compact')}
      />

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {visibleMessages.length === 0 && !showStreaming && (
          <div className="text-text-dim text-sm text-center py-12 space-y-2">
            {session?.source === 'api' && (session?.taskCount ?? 0) > 0 ? (
              <>
                <div>This session was auto-created by the async-task API.</div>
                <div className="text-xs">
                  It holds {session.taskCount} task{session.taskCount === 1 ? '' : 's'} but no chat
                  turns — view them on the{' '}
                  <a href="/tasks" className="text-accent hover:underline">
                    Tasks page
                  </a>
                  .
                </div>
              </>
            ) : (
              <div>Send a message to start the conversation</div>
            )}
          </div>
        )}

        {visibleMessages.map((msg) => {
          // For agentic-workflow assistant messages, render the persisted
          // process card as its own bubble ABOVE the response bubble. The
          // user explicitly asked for the process box to remain visible
          // after completion (showing plan + sub-agent activity) AND for
          // the response to appear as a separate new card. Without this,
          // the process detail disappears when the streaming bubble
          // resolves into a single chat bubble that hides the process
          // behind a click-to-expand button.
          const showProcessSibling =
            msg.role === 'assistant' &&
            !!msg.taskId &&
            msg.traceSummary?.approach === 'agentic-workflow';
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

        {showStreaming && turn && sessionId && (
          <StreamingBubble
            turn={turn}
            sessionId={sessionId}
            nowMs={nowMs}
            onRetry={handleRetry}
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

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div
          className={cn(
            'flex items-end gap-2 bg-surface border border-border rounded-xl px-3 py-2 transition-colors',
            'focus-within:border-accent/60',
          )}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text placeholder-gray-500 focus:outline-none resize-none leading-6 py-1 max-h-40"
            placeholder={
              (turn?.status === 'input-required' || pendingClarifications.length > 0)
                ? 'Answer the clarification...'
                : 'Type a message...  (Enter to send · Shift+Enter for newline)'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            autoFocus
          />
          <button
            type="button"
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              input.trim() && !sending
                ? 'bg-accent text-white hover:bg-accent/80'
                : 'bg-border/50 text-text-dim cursor-not-allowed',
            )}
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Send"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      <SessionMetadataDialog
        open={editing}
        mode="edit"
        initial={{
          title: session?.title ?? '',
          description: session?.description ?? '',
        }}
        busy={updateSession.isPending}
        onClose={() => {
          if (!updateSession.isPending) setEditing(false);
        }}
        onSubmit={(value: SessionMetadataDialogValue) => {
          if (!sessionId) return;
          updateSession.mutate(
            {
              id: sessionId,
              patch: {
                title: value.title.length > 0 ? value.title : null,
                description: value.description.length > 0 ? value.description : null,
              },
            },
            { onSuccess: () => setEditing(false) },
          );
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        busy={
          (confirm === 'archive' && archiveSession.isPending) ||
          (confirm === 'unarchive' && unarchiveSession.isPending) ||
          (confirm === 'delete' && deleteSession.isPending) ||
          (confirm === 'compact' && compactSession.isPending)
        }
        onConfirm={() => {
          if (!sessionId || !confirm) return;
          const close = () => setConfirm(null);
          if (confirm === 'archive') {
            archiveSession.mutate(sessionId, { onSuccess: close });
          } else if (confirm === 'unarchive') {
            unarchiveSession.mutate(sessionId, { onSuccess: close });
          } else if (confirm === 'delete') {
            deleteSession.mutate(sessionId, {
              onSuccess: () => {
                close();
                navigate('/sessions');
              },
            });
          } else if (confirm === 'compact') {
            compactSession.mutate(sessionId, { onSuccess: close });
          }
        }}
        title={
          confirm === 'archive'
            ? 'Archive session?'
            : confirm === 'unarchive'
              ? 'Unarchive session?'
              : confirm === 'delete'
                ? 'Move session to trash?'
                : 'Compact session history?'
        }
        description={
          confirm === 'delete'
            ? 'The session will be moved to Trash. Audit data is preserved and you can restore it later from the Sessions page.'
            : confirm === 'compact'
              ? 'Summarize the conversation to reduce token usage. The original turns are preserved.'
              : confirm === 'archive'
                ? 'The session will be hidden from the active list. You can unarchive it from the Archived tab.'
                : 'The session will be moved back to the active list.'
        }
        confirmLabel={
          confirm === 'archive'
            ? 'Archive'
            : confirm === 'unarchive'
              ? 'Unarchive'
              : confirm === 'delete'
                ? 'Move to trash'
                : 'Compact'
        }
        variant={confirm === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}

interface ChatHeaderProps {
  sessionId: string | undefined;
  title: string | null;
  description: string | null;
  archived: boolean;
  deleted: boolean;
  canCompact: boolean;
  onSaveTitle: (next: string | null) => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onCompact: () => void;
}

function ChatHeader({
  sessionId,
  title,
  description,
  archived,
  deleted,
  canCompact,
  onSaveTitle,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onCompact,
}: ChatHeaderProps) {
  const items: ActionMenuItem[] = [
    { label: 'Edit description', icon: Pencil, onClick: onEdit, disabled: deleted },
  ];
  if (canCompact && !deleted) {
    items.push({ label: 'Compact', icon: RefreshCw, onClick: onCompact });
  }
  if (!deleted) {
    if (archived) {
      items.push({ label: 'Unarchive', icon: ArchiveRestore, onClick: onUnarchive });
    } else {
      items.push({ label: 'Archive', icon: Archive, onClick: onArchive });
    }
    items.push({ label: 'Move to trash', icon: Trash2, onClick: onDelete, danger: true });
  }
  return (
    <div className="bg-surface border-b border-border px-4 py-2 shrink-0 flex items-start gap-3">
      <Link
        to="/sessions"
        className="mt-1 text-text-dim hover:text-text transition-colors"
        aria-label="Back to sessions"
      >
        <ArrowLeft size={16} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <EditableTitle
            value={title}
            disabled={deleted}
            onSave={onSaveTitle}
          />
          {archived && !deleted && (
            <span className="text-[10px] text-text-dim border border-border rounded px-1 py-0.5 shrink-0">
              archived
            </span>
          )}
          {deleted && (
            <span className="text-[10px] text-red border border-red/40 rounded px-1 py-0.5 shrink-0">
              trashed
            </span>
          )}
        </div>
        {description && (
          <div className="text-xs text-text-dim line-clamp-1 max-w-3xl">{description}</div>
        )}
        {sessionId && (
          <div className="text-[10px] text-text-dim font-mono truncate">{sessionId}</div>
        )}
      </div>
      <ActionMenu items={items} />
    </div>
  );
}

interface EditableTitleProps {
  value: string | null;
  disabled?: boolean;
  onSave: (next: string | null) => void;
}

const TITLE_MAX_LENGTH = 200;

/**
 * Click-to-edit title control. Shows the title as text by default;
 * click (or focus + Enter) to swap in an inline input that saves on
 * Enter / blur and cancels on Escape. Deliberately stays uncontrolled
 * mid-edit so streaming SSE updates to `value` from elsewhere don't
 * stomp the user's in-progress text.
 */
function EditableTitle({ value, disabled, onSave }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const display = value && value.length > 0 ? value : 'Untitled session';
  const isPlaceholder = !value;

  const startEditing = () => {
    if (disabled) return;
    setDraft(value ?? '');
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim().slice(0, TITLE_MAX_LENGTH);
    setEditing(false);
    const original = value ?? '';
    if (trimmed === original) return;
    onSave(trimmed.length > 0 ? trimmed : null);
  };

  const cancel = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={TITLE_MAX_LENGTH}
        placeholder="Untitled session"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text px-1 -mx-1 rounded outline-none ring-1 ring-accent/60"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      title={disabled ? undefined : 'Click to rename'}
      className={cn(
        'text-sm font-medium truncate text-left px-1 -mx-1 rounded transition-colors',
        isPlaceholder && 'text-text-dim italic',
        disabled
          ? 'cursor-not-allowed'
          : 'hover:bg-white/5 cursor-text',
      )}
    >
      {display}
    </button>
  );
}
