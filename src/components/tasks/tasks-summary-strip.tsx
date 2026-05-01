import { cn } from '@/lib/utils';
import type { TaskCounts } from '@/lib/api-client';

type SummaryTabId =
  | 'all'
  | 'running'
  | 'needs-action'
  | 'failed'
  | 'completed'
  | 'archived';

interface TasksSummaryStripProps {
  counts: TaskCounts | undefined;
  total: number;
  loading: boolean;
  /** Currently-selected tab — chip is highlighted when its id matches. */
  activeTab?: string;
  /**
   * Click-through filter shortcut. Each chip jumps to a filter preset on
   * the same page so the strip is both an at-a-glance metric and a
   * triage entry point. `null` means "no jump" (e.g. archived when the
   * caller wants the operator to use the regular tab).
   */
  onSelect?: (id: SummaryTabId) => void;
}

interface StripItem {
  id: SummaryTabId;
  label: string;
  value: number;
  tone: 'neutral' | 'info' | 'warning' | 'error' | 'success';
}

/**
 * Single-line operations strip — replaces the seven big stat cards. Each
 * cell is a compact pill (label · value) so the row stays at one line on
 * laptop widths and never dominates the page. Cells double as quick
 * filters via `onSelect`.
 */
export function TasksSummaryStrip({
  counts,
  total,
  loading,
  activeTab,
  onSelect,
}: TasksSummaryStripProps) {
  const byStatus = counts?.byStatus ?? {};
  const dbCounts = counts?.byDbStatus ?? {};

  const running = (byStatus.running ?? 0) + (byStatus.pending ?? 0);
  const needsAction = counts?.needsActionTotal ?? 0;
  const failed =
    (byStatus.failed ?? 0) + (byStatus.escalated ?? 0) + (byStatus.timeout ?? 0);
  const completed = byStatus.completed ?? 0;
  const archived = Object.entries(dbCounts)
    .filter(([key]) => key.startsWith('archived:'))
    .reduce((acc, [, v]) => acc + v, 0);

  const items: StripItem[] = [
    { id: 'all', label: 'Total', value: total, tone: 'neutral' },
    { id: 'running', label: 'Running', value: running, tone: 'info' },
    { id: 'needs-action', label: 'Needs action', value: needsAction, tone: 'warning' },
    { id: 'failed', label: 'Failed', value: failed, tone: 'error' },
    { id: 'completed', label: 'Completed', value: completed, tone: 'success' },
    { id: 'archived', label: 'Archived', value: archived, tone: 'neutral' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => {
        const isActive = activeTab === item.id;
        const interactive = !!onSelect;
        return (
          <button
            key={item.id}
            type="button"
            onClick={onSelect ? () => onSelect(item.id) : undefined}
            disabled={!interactive}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors',
              isActive
                ? 'bg-surface ring-1 ring-accent/40 border-accent/40'
                : 'bg-surface/60 border-border hover:bg-white/[0.03]',
              !interactive && 'cursor-default',
            )}
          >
            <span className="text-[10px] uppercase tracking-wider text-text-dim">
              {item.label}
            </span>
            <span
              className={cn(
                'tabular-nums font-semibold leading-none',
                loading && 'text-text-dim',
                !loading && item.tone === 'info' && 'text-accent',
                !loading && item.tone === 'warning' && 'text-yellow',
                !loading && item.tone === 'error' && 'text-red',
                !loading && item.tone === 'success' && 'text-green',
              )}
            >
              {loading ? '—' : item.value.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
