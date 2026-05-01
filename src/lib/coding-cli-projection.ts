/**
 * Coding-CLI session reconciliation — backend projection wins on
 * lifecycle authority; local SSE fold keeps live-text accumulators.
 *
 * The local `reduceCodingCliSessions` reducer (`src/hooks/coding-cli-state.ts`)
 * folds raw `coding-cli:*` events into a `CodingCliSessionState` for
 * fast UX. The backend `TaskProcessProjectionService.codingCliSessions`
 * is the **authoritative** source for:
 *   - `state` (lifecycle status)
 *   - `startedAt`, `endedAt`
 *   - `pendingApprovals[]` and `resolvedApprovals[]` (durable approval rows)
 *   - `filesChanged[]` and `commandsRequested[]` (durable session columns)
 *   - `finalResult`
 *
 * The frontend keeps locally:
 *   - `outputBuffer` — the live stdout text accumulator
 *   - `toolActivity` — running tool entries the backend doesn't surface
 *
 * `mergeCodingCliSessions` is the contract: backend wins where backend
 * has authority; local wins for transient UX. When the backend
 * doesn't yet know about a session (live SSE before projection
 * caught up), the local entry is returned unchanged.
 */
import type {
  CodingCliApprovalEntry,
  CodingCliResolvedApproval,
  CodingCliSessionState,
} from '@/hooks/coding-cli-state';
import type {
  TaskProcessCodingCliPendingApproval,
  TaskProcessCodingCliResolvedApproval,
  TaskProcessCodingCliSession,
} from '@/lib/api-client';

/**
 * Coerce a backend session shape into the local `CodingCliSessionState`
 * skeleton. The local-only fields (`outputBuffer`, `toolActivity`,
 * `decisions`, `checkpoints`, `verification`) are filled with empty
 * defaults; the merger overlays the local entry's values when both
 * exist. Used for the "session present only in backend" path (e.g.
 * historical task with no live stream attached).
 */
export function coerceBackendCodingCliSession(b: TaskProcessCodingCliSession): CodingCliSessionState {
  const pending = b.pendingApprovals[0];
  const session: CodingCliSessionState = {
    id: b.id,
    taskId: b.taskId,
    providerId: b.providerId as CodingCliSessionState['providerId'],
    state: b.state,
    capabilities: {} as CodingCliSessionState['capabilities'],
    binaryPath: '',
    binaryVersion: null,
    cwd: '',
    pid: null,
    createdAt: b.startedAt,
    outputBuffer: '',
    toolActivity: [],
    filesChanged: [...b.filesChanged],
    commandsRequested: [...b.commandsRequested],
    decisions: [],
    checkpoints: [],
    resolvedApprovals: b.resolvedApprovals.map(toLocalResolved),
  };
  if (typeof b.startedAt === 'number') session.startedAt = b.startedAt;
  if (typeof b.endedAt === 'number') session.endedAt = b.endedAt;
  if (pending) session.pendingApproval = toLocalPending(pending, b.taskId);
  return session;
}

function toLocalPending(
  p: TaskProcessCodingCliPendingApproval,
  taskId: string,
): CodingCliApprovalEntry {
  return {
    requestId: p.requestId,
    taskId,
    scope: 'unknown',
    summary: p.command,
    detail: p.reason,
    policyDecision: (p.policyDecision === 'auto-approve' || p.policyDecision === 'require-human' || p.policyDecision === 'reject'
      ? p.policyDecision
      : 'require-human') as CodingCliApprovalEntry['policyDecision'],
    policyReason: p.reason,
    at: p.requestedAt,
  };
}

function toLocalResolved(r: TaskProcessCodingCliResolvedApproval): CodingCliResolvedApproval {
  // Backend records human_decision text verbatim; map common values
  // back to the local enum, defaulting unknown shapes to 'rejected'
  // so an unfamiliar decision string never reads as 'approved'.
  const decision: CodingCliResolvedApproval['decision'] =
    r.humanDecision === 'approved' || r.humanDecision === 'allowed'
      ? 'approved'
      : 'rejected';
  const decidedBy: CodingCliResolvedApproval['decidedBy'] =
    r.decidedBy === 'policy' || r.decidedBy === 'timeout' ? r.decidedBy : 'human';
  return {
    requestId: r.requestId,
    decision,
    decidedBy,
    at: r.decidedAt,
  };
}

/**
 * Merge the live SSE-folded session map with the backend-authoritative
 * session list. Returns a new map with backend-authoritative fields
 * applied on top of local entries. Caller-friendly: if either input
 * is missing, the other is returned unchanged.
 *
 * Field ownership:
 *   - `state`, `startedAt`, `endedAt`, `providerId` → backend
 *   - `pendingApproval` (single) → backend's `pendingApprovals[0]`
 *   - `resolvedApprovals` → backend (replace, not append)
 *   - `filesChanged`, `commandsRequested` → backend
 *   - `outputBuffer`, `toolActivity` → local (transient UX)
 *   - `decisions`, `checkpoints`, `verification`, `result` → local
 *     (backend doesn't surface them in this projection slice yet —
 *     a future projection extension can add them; until then the
 *     local fold is the only source)
 *   - `failureReason`, `cancelled`, `stalled` → backend wins via
 *     `failureDetail` / `cancelDetail` / `stalledDetail` on the
 *     projection (read from the durable `coding_cli_events` log).
 *     Local fold remains the fallback for the brief window before
 *     the projection lands.
 */
export function mergeCodingCliSessions(
  local: Readonly<Record<string, CodingCliSessionState>>,
  backend: ReadonlyArray<TaskProcessCodingCliSession>,
): Record<string, CodingCliSessionState> {
  if (backend.length === 0) return { ...local };
  const out: Record<string, CodingCliSessionState> = { ...local };
  const backendBySessionId = new Map<string, TaskProcessCodingCliSession>();
  for (const b of backend) backendBySessionId.set(b.id, b);

  // Apply backend authority to existing local entries.
  for (const [id, localEntry] of Object.entries(local)) {
    const b = backendBySessionId.get(id);
    if (!b) {
      out[id] = localEntry;
      continue;
    }
    const pending = b.pendingApprovals[0];
    out[id] = {
      ...localEntry,
      providerId: b.providerId as CodingCliSessionState['providerId'],
      state: b.state,
      ...(typeof b.startedAt === 'number' ? { startedAt: b.startedAt } : {}),
      ...(typeof b.endedAt === 'number' ? { endedAt: b.endedAt } : {}),
      filesChanged: [...b.filesChanged],
      commandsRequested: [...b.commandsRequested],
      // Pending approval: backend authoritative. If backend has no
      // pending row, drop the local optimistic pendingApproval — a
      // race where the user resolved in another tab must not leave a
      // stale prompt up.
      pendingApproval: pending ? toLocalPending(pending, b.taskId) : undefined,
      resolvedApprovals: b.resolvedApprovals.map(toLocalResolved),
      // Backend-authoritative terminal context. When the projection
      // carries `failureDetail` etc. we override the local fold; when
      // the field is absent (session still running, or the backend
      // hasn't surfaced it yet), we keep the local fallback.
      ...(b.failureDetail
        ? { failureReason: b.failureDetail.reason ?? localEntry.failureReason }
        : localEntry.failureReason !== undefined
          ? { failureReason: localEntry.failureReason }
          : {}),
      ...(b.cancelDetail
        ? {
            cancelled: {
              by: b.cancelDetail.by ?? localEntry.cancelled?.by ?? 'unknown',
              ...(b.cancelDetail.reason ? { reason: b.cancelDetail.reason } : {}),
              at: b.cancelDetail.at,
            },
          }
        : localEntry.cancelled
          ? { cancelled: localEntry.cancelled }
          : {}),
      ...(b.stalledDetail
        ? { stalled: { idleMs: b.stalledDetail.idleMs, at: b.stalledDetail.at } }
        : localEntry.stalled
          ? { stalled: localEntry.stalled }
          : {}),
    };
  }

  // Surface sessions present only in backend (historical task whose
  // live stream already cleared, or operator opening the drawer for
  // a task they didn't initiate).
  for (const b of backend) {
    if (out[b.id]) continue;
    out[b.id] = coerceBackendCodingCliSession(b);
  }
  return out;
}
