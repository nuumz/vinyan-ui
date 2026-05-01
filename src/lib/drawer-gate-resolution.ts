/**
 * Drawer needs-action resolver — pure helper extracted from
 * `TaskDetailDrawer` so the projection-priority invariant is testable
 * without spinning up React.
 *
 * Backend authority: when the detail endpoint reports `pendingGates`
 * (a strict per-task durable view), the row-level `needsActionType`
 * cache may be out-of-date. The resolver downgrades the row to `'none'`
 * iff the gate the row claims is open is actually CLOSED on the
 * server. The reverse direction (gate open but row says 'none') is
 * NOT handled here — the row endpoint runs the same gate scan, so
 * the only stale case in practice is "gate just resolved while the
 * list cache still says pending".
 *
 * Includes coding-cli-approval: a row-level signal that may flip to
 * 'none' once the operator approves/rejects in another tab. Backend
 * `pendingGates.codingCliApproval` is the authoritative signal.
 */
import type { TaskNeedsActionType } from './api-client';

export interface DrawerPendingGates {
  readonly partialDecision: boolean;
  readonly humanInput: boolean;
  readonly approval: boolean;
  readonly codingCliApproval?: boolean;
}

/**
 * Reconcile the row-level needs-action hint with the drawer's
 * authoritative `pendingGates` map. Returns the resolved value the
 * drawer header should display.
 *
 * Pure — input-output mapping; no IO, no clock, no React.
 */
export function resolveDrawerNeedsAction(
  rowType: TaskNeedsActionType,
  gates: DrawerPendingGates | null,
): TaskNeedsActionType {
  if (!gates) return rowType;
  if (rowType === 'partial-decision' && !gates.partialDecision) return 'none';
  if (rowType === 'workflow-human-input' && !gates.humanInput) return 'none';
  if (rowType === 'approval' && !gates.approval) return 'none';
  if (rowType === 'coding-cli-approval' && gates.codingCliApproval === false) return 'none';
  return rowType;
}
