import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  useArchiveSession,
  useCompactSession,
  useCreateSession,
  useDeleteSession,
  useRestoreSession,
  useSessionsList,
  useUnarchiveSession,
  useUpdateSession,
} from '@/hooks/use-sessions';
import type {
  Session,
  SessionLifecycleState,
  SessionListSource,
  SessionListState,
} from '@/lib/api-client';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  SessionMetadataDialog,
  type SessionMetadataDialogValue,
} from '@/components/ui/session-metadata-dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';

interface DialogState {
  // Dialog is now edit-only — create sessions navigate straight into
  // the chat where the title is auto-derived from the first message and
  // can be edited inline in the header.
  mode: 'edit';
  session: Session;
}

interface ConfirmState {
  kind: 'delete' | 'archive' | 'unarchive' | 'restore' | 'compact';
  session: Session;
}

const TAB_OPTIONS: Array<{ id: SessionListState; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'deleted', label: 'Trash' },
];

// Source segmented control. Default is 'all' so sessions created by external
// clients (curl, MCP, scripts) are discoverable — earlier the default was
// `ui` and users reported "session not in list" when they had created one
// via API and tried to find it (incident: 2026-04-28 session 44c83a53 area).
// The source chip on each row still labels origin so the list stays scannable.
const SOURCE_OPTIONS: Array<{ id: SessionListSource; label: string }> = [
  { id: 'all', label: 'All sources' },
  { id: 'ui', label: 'UI' },
  { id: 'api', label: 'API' },
];

export default function Sessions() {
  const [tab, setTab] = useState<SessionListState>('active');
  const [source, setSource] = useState<SessionListSource>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const navigate = useNavigate();

  const sessionsQuery = useSessionsList({ state: tab, source, search });
  const sessions = sessionsQuery.data ?? [];

  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const archiveSession = useArchiveSession();
  const unarchiveSession = useUnarchiveSession();
  const deleteSession = useDeleteSession();
  const restoreSession = useRestoreSession();
  const compactSession = useCompactSession();

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const handleCreate = () => {
    createSession.mutate(
      {},
      {
        onSuccess: (result) => {
          if (result?.session) navigate(`/sessions/${result.session.id}`);
        },
      },
    );
  };

  const handleSubmitMetadata = (value: SessionMetadataDialogValue) => {
    if (!dialog) return;
    const titleOrNull = value.title.length > 0 ? value.title : null;
    const descriptionOrNull = value.description.length > 0 ? value.description : null;
    updateSession.mutate(
      {
        id: dialog.session.id,
        patch: { title: titleOrNull, description: descriptionOrNull },
      },
      { onSuccess: () => setDialog(null) },
    );
  };

  const performConfirm = () => {
    if (!confirm) return;
    const id = confirm.session.id;
    const close = () => setConfirm(null);
    switch (confirm.kind) {
      case 'delete':
        deleteSession.mutate(id, { onSuccess: close });
        return;
      case 'archive':
        archiveSession.mutate(id, { onSuccess: close });
        return;
      case 'unarchive':
        unarchiveSession.mutate(id, { onSuccess: close });
        return;
      case 'restore':
        restoreSession.mutate(id, { onSuccess: close });
        return;
      case 'compact':
        compactSession.mutate(id, { onSuccess: close });
        return;
    }
  };

  const showSkeleton = sessionsQuery.isLoading;
  const dialogBusy = updateSession.isPending;
  const confirmBusy = Boolean(
    confirm &&
      ((confirm.kind === 'delete' && deleteSession.isPending) ||
        (confirm.kind === 'archive' && archiveSession.isPending) ||
        (confirm.kind === 'unarchive' && unarchiveSession.isPending) ||
        (confirm.kind === 'restore' && restoreSession.isPending) ||
        (confirm.kind === 'compact' && compactSession.isPending)),
  );

  const description = (() => {
    if (sessionsQuery.isLoading) return 'Loading…';
    if (sessionsQuery.isError) return 'Could not load sessions — see panel below';
    const noun = sessions.length === 1 ? 'session' : 'sessions';
    const scope =
      tab === 'deleted' ? 'in trash' : tab === 'archived' ? 'archived' : 'active';
    return `${sessions.length} ${scope} ${noun}`;
  })();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessions"
        description={description}
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
              New session
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          items={TAB_OPTIONS.map((t) => ({ id: t.id, label: t.label }))}
          active={tab}
          onChange={(id) => setTab(id)}
          className="flex-1"
        />
        <div className="flex items-center gap-2 sm:pb-1">
          <Tabs
            items={SOURCE_OPTIONS.map((s) => ({ id: s.id, label: s.label }))}
            active={source}
            onChange={(id) => setSource(id)}
            variant="pills"
          />
          <div className="relative w-full sm:w-56">
            <Search
              size={12}
              className="absolute top-1/2 left-2 -translate-y-1/2 text-text-dim pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, description, id…"
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-bg border border-border focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-text-dim/70"
            />
          </div>
        </div>
      </div>

      {showSkeleton ? (
        <TableSkeleton rows={4} />
      ) : sessionsQuery.isError ? (
        <div className="bg-surface rounded-lg border border-border">
          <ErrorState
            error={sessionsQuery.error}
            onRetry={() => sessionsQuery.refetch()}
            retrying={sessionsQuery.isFetching}
          />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-surface rounded-lg border border-border py-16 flex flex-col items-center gap-3">
          <MessageSquare size={32} className="text-text-dim/50" />
          <div className="text-sm text-text-dim">
            {search.length > 0
              ? 'No sessions match this search'
              : tab === 'deleted'
                ? 'Trash is empty'
                : tab === 'archived'
                  ? 'No archived sessions'
                  : 'No active sessions'}
          </div>
          {tab === 'active' && search.length === 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
              onClick={handleCreate}
              disabled={createSession.isPending}
            >
              <Plus size={14} />
              Start a conversation
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm border-separate border-spacing-0">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-20" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="text-left text-text-dim text-[10px] font-medium uppercase tracking-wider">
                <th className="px-4 py-2.5 border-b border-border">Session</th>
                <th className="px-3 py-2.5 border-b border-border text-right">Tasks</th>
                <th className="px-3 py-2.5 border-b border-border">Status</th>
                <th className="px-3 py-2.5 border-b border-border text-right">Updated</th>
                <th className="px-2 py-2.5 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onOpen={() => navigate(`/sessions/${s.id}`)}
                  onEdit={() => setDialog({ mode: 'edit', session: s })}
                  onArchive={() => setConfirm({ kind: 'archive', session: s })}
                  onUnarchive={() => setConfirm({ kind: 'unarchive', session: s })}
                  onDelete={() => setConfirm({ kind: 'delete', session: s })}
                  onRestore={() => setConfirm({ kind: 'restore', session: s })}
                  onCompact={() => setConfirm({ kind: 'compact', session: s })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SessionMetadataDialog
        open={dialog !== null}
        mode="edit"
        initial={
          dialog
            ? {
                title: dialog.session.title ?? '',
                description: dialog.session.description ?? '',
              }
            : undefined
        }
        busy={dialogBusy}
        onClose={() => {
          if (!dialogBusy) setDialog(null);
        }}
        onSubmit={handleSubmitMetadata}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
        onConfirm={performConfirm}
        busy={confirmBusy}
        title={confirmTitle(confirm)}
        description={confirmDescription(confirm)}
        confirmLabel={confirmActionLabel(confirm)}
        variant={confirm?.kind === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}

function confirmTitle(state: ConfirmState | null): string {
  if (!state) return '';
  switch (state.kind) {
    case 'delete':
      return 'Move session to trash?';
    case 'archive':
      return 'Archive session?';
    case 'unarchive':
      return 'Unarchive session?';
    case 'restore':
      return 'Restore session from trash?';
    case 'compact':
      return 'Compact session history?';
  }
}

function confirmDescription(state: ConfirmState | null): React.ReactNode {
  if (!state) return null;
  const label = state.session.title || state.session.id.slice(0, 8);
  switch (state.kind) {
    case 'delete':
      return (
        <>
          <span className="font-medium">{label}</span> will be moved to Trash. Audit data (tasks,
          turns, traces) is preserved and the session can be restored later.
        </>
      );
    case 'archive':
      return (
        <>
          <span className="font-medium">{label}</span> will be hidden from the active list. You can
          unarchive it from the Archived tab anytime.
        </>
      );
    case 'unarchive':
      return (
        <>
          <span className="font-medium">{label}</span> will be moved back to the active list.
        </>
      );
    case 'restore':
      return (
        <>
          <span className="font-medium">{label}</span> will be moved out of Trash and become
          visible in the active list again.
        </>
      );
    case 'compact':
      return (
        <>
          Summarize <span className="font-medium">{label}</span> to reduce token usage. The
          original turns are preserved (audit trail), only the summary is added.
        </>
      );
  }
}

function confirmActionLabel(state: ConfirmState | null): string {
  if (!state) return 'Confirm';
  switch (state.kind) {
    case 'delete':
      return 'Move to trash';
    case 'archive':
      return 'Archive';
    case 'unarchive':
      return 'Unarchive';
    case 'restore':
      return 'Restore';
    case 'compact':
      return 'Compact';
  }
}

interface SessionRowProps {
  session: Session;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onCompact: () => void;
}

function SessionRow({
  session,
  onOpen,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onRestore,
  onCompact,
}: SessionRowProps) {
  const isArchived = session.archivedAt !== null;
  const isDeleted = session.deletedAt !== null;
  const items: ActionMenuItem[] = [];
  if (!isDeleted) {
    items.push({ label: 'Edit details', icon: Pencil, onClick: onEdit });
    if (session.status === 'active' && session.taskCount > 0) {
      items.push({ label: 'Compact', icon: RefreshCw, onClick: onCompact });
    }
    if (isArchived) {
      items.push({ label: 'Unarchive', icon: ArchiveRestore, onClick: onUnarchive });
    } else {
      items.push({ label: 'Archive', icon: Archive, onClick: onArchive });
    }
    items.push({ label: 'Move to trash', icon: Trash2, onClick: onDelete, danger: true });
  } else {
    items.push({ label: 'Restore', icon: RotateCcw, onClick: onRestore });
  }

  const isLive = session.activityState === 'in-progress';
  const shortId = session.id.slice(0, 8);
  const hasRunning = session.runningTaskCount > 0;

  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-white/[0.03]"
      onClick={onOpen}
    >
      <td className="relative px-4 py-3 border-b border-border/40 align-middle max-w-0">
        <span
          className={cn(
            'absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full transition-opacity',
            isLive ? 'bg-accent opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
        <div className="flex items-baseline gap-2 min-w-0">
          <Link
            to={`/sessions/${session.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-sm text-text hover:text-accent truncate shrink-0 max-w-[40%]"
          >
            {session.title || `Session ${shortId}`}
          </Link>
          <span className="text-xs text-text-dim/70 lowercase shrink-0">{session.source}</span>
          {session.description && (
            <>
              <span className="text-text-dim/30 shrink-0">·</span>
              <span className="text-xs text-text-dim truncate min-w-0">
                {session.description}
              </span>
            </>
          )}
          <span
            className="font-mono text-[10px] text-text-dim/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto"
            title={session.id}
          >
            {shortId}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 border-b border-border/40 text-right tabular-nums align-middle">
        {session.taskCount > 0 ? (
          <span
            className="inline-flex items-baseline text-xs"
            title={
              hasRunning
                ? `${session.runningTaskCount} of ${session.taskCount} task${session.taskCount === 1 ? '' : 's'} running`
                : `${session.taskCount} task${session.taskCount === 1 ? '' : 's'}`
            }
          >
            {hasRunning ? (
              <>
                <span className="text-accent font-medium">{session.runningTaskCount}</span>
                <span className="text-text-dim/60 mx-0.5">/</span>
                <span className="text-text-dim">{session.taskCount}</span>
              </>
            ) : (
              <span className="text-text-dim">{session.taskCount}</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-text-dim/40">—</span>
        )}
      </td>
      <td className="px-3 py-3 border-b border-border/40 align-middle">
        <StatusDot state={session.lifecycleState} live={isLive} />
      </td>
      <td
        className="px-3 py-3 border-b border-border/40 text-right text-xs text-text-dim tabular-nums align-middle"
        title={new Date(session.updatedAt).toLocaleString()}
      >
        {timeAgo(session.updatedAt)}
      </td>
      <td
        className="px-2 py-3 border-b border-border/40 text-right align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <ActionMenu items={items} />
      </td>
    </tr>
  );
}

const STATE_DOT: Record<SessionLifecycleState, string> = {
  active: 'bg-text-dim/40',
  suspended: 'bg-yellow',
  compacted: 'bg-accent',
  closed: 'bg-text-dim/40',
  archived: 'bg-text-dim/40',
  trashed: 'bg-red',
};

const STATE_TEXT: Record<SessionLifecycleState, string> = {
  active: 'text-text-dim/70',
  suspended: 'text-yellow',
  compacted: 'text-accent',
  closed: 'text-text-dim/70',
  archived: 'text-text-dim/70',
  trashed: 'text-red',
};

function StatusDot({ state, live }: { state: SessionLifecycleState; live?: boolean }) {
  if (live) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-accent opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <span className="text-accent">running</span>
      </span>
    );
  }
  // active = the default/normal state — render the dot + label dimmed so the
  // eye skips them. Notable states (suspended/compacted/trashed) keep color.
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className={cn('inline-flex h-1.5 w-1.5 shrink-0 rounded-full', STATE_DOT[state])} aria-hidden />
      <span className={STATE_TEXT[state]}>{state}</span>
    </span>
  );
}
