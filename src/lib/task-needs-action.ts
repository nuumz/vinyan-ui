import type { TaskNeedsActionType } from '@/lib/api-client';

/**
 * Display metadata for the operations console "Needs action" badges.
 *
 * Source-of-truth lives server-side: `classifyNeedsAction` in
 * `src/api/server.ts` derives the type from durable signals (db status,
 * result.status, pending approval map, lifecycle timestamps). The UI
 * only renders the label / icon — never re-classifies from text.
 */
export interface NeedsActionMeta {
  label: string;
  shortLabel: string;
  tone: 'warning' | 'error' | 'info' | 'neutral';
}

const META: Record<TaskNeedsActionType, NeedsActionMeta> = {
  none: { label: 'OK', shortLabel: 'ok', tone: 'neutral' },
  approval: { label: 'Approval required', shortLabel: 'approval', tone: 'warning' },
  'workflow-human-input': {
    label: 'Awaiting your answer',
    shortLabel: 'answer',
    tone: 'info',
  },
  'partial-decision': {
    // Earlier wording ("Partial — decide ship or abort") was confusing
    // — operators read it as a death sentence rather than a workflow
    // gate. The status badge already says `partial`; this badge's job
    // is to communicate "you have a decision to make", nothing more.
    label: 'Awaiting decision',
    shortLabel: 'decide',
    tone: 'warning',
  },
  'coding-cli-approval': {
    label: 'CLI approval required',
    shortLabel: 'cli-approval',
    tone: 'warning',
  },
  'stale-running': {
    label: 'Stale running task',
    shortLabel: 'stale',
    tone: 'warning',
  },
  failed: { label: 'Failed', shortLabel: 'failed', tone: 'error' },
  timeout: { label: 'Timed out', shortLabel: 'timeout', tone: 'error' },
};

export function describeNeedsAction(type: TaskNeedsActionType): NeedsActionMeta {
  return META[type] ?? META.none;
}

/** Operator-facing status filter set used by the console's status tabs. */
export const STATUS_TAB_OPTIONS = [
  { id: 'all', label: 'All', statuses: undefined as string[] | undefined },
  { id: 'running', label: 'Running', statuses: ['running', 'pending'] },
  { id: 'needs-action', label: 'Needs action', statuses: undefined },
  { id: 'completed', label: 'Completed', statuses: ['completed'] },
  { id: 'partial', label: 'Partial', statuses: ['partial', 'uncertain', 'escalated'] },
  { id: 'failed', label: 'Failed', statuses: ['failed', 'escalated', 'timeout'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { id: 'archived', label: 'Archived', statuses: undefined },
] as const;

export type StatusTabId = (typeof STATUS_TAB_OPTIONS)[number]['id'];
