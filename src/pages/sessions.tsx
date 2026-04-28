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
import type { Session, SessionListState } from '@/lib/api-client';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  SessionMetadataDialog,
  type SessionMetadataDialogValue,
} from '@/components/ui/session-metadata-dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { timeAgo } from '@/lib/utils';

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

export default function Sessions() {
  const [tab, setTab] = useState<SessionListState>('active');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const navigate = useNavigate();

  const sessionsQuery = useSessionsList({ state: tab, search });
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
    return `${sessions.length} ${tab === 'deleted' ? 'in trash' : tab}`;
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          items={TAB_OPTIONS.map((t) => ({ id: t.id, label: t.label }))}
          active={tab}
          onChange={(id) => setTab(id)}
        />
        <div className="relative w-full sm:w-72">
          <Search
            size={12}
            className="absolute top-1/2 left-2 -translate-y-1/2 text-text-dim pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, id…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-bg border border-border focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
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
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {sorted.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Session</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2">Updated</th>
                  <th className="px-4 py-2 text-right" />
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
          )}
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

  return (
    <tr
      className="border-b border-border/50 hover:bg-white/2 cursor-pointer transition-colors"
      onClick={onOpen}
    >
      <td className="px-4 py-2">
        <div className="space-y-0.5">
          <Link
            to={`/sessions/${session.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-sm text-text hover:text-accent"
          >
            {session.title || `Session ${session.id.slice(0, 8)}`}
          </Link>
          {session.description && (
            <div className="text-xs text-text-dim line-clamp-1 max-w-xl">
              {session.description}
            </div>
          )}
          <div className="text-[10px] text-text-dim font-mono">
            {session.id} · {session.source}
          </div>
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1 items-start">
          {/*
            Backend derives `lifecycleState` (priority-resolved single label
            including archived/trashed). Render that directly instead of
            stacking raw `status` + ad-hoc text below — clearer and keeps
            visual contract owned by one place.
          */}
          <StatusBadge status={session.lifecycleState} />
          {session.activityState === 'in-progress' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              in-progress
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 tabular-nums text-right">
        <div className="inline-flex items-baseline gap-1">
          <span>{session.taskCount}</span>
          {session.runningTaskCount > 0 && (
            <span
              className="text-[10px] text-accent"
              title={`${session.runningTaskCount} task${session.runningTaskCount === 1 ? '' : 's'} pending or running`}
            >
              ({session.runningTaskCount})
            </span>
          )}
        </div>
      </td>
      <td
        className="px-4 py-2 text-xs text-text-dim"
        title={new Date(session.updatedAt).toLocaleString()}
      >
        {timeAgo(session.updatedAt)}
      </td>
      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <ActionMenu items={items} />
      </td>
    </tr>
  );
}
