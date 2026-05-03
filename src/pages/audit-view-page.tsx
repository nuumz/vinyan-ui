/**
 * AuditViewPage — thin wrapper that resolves an entity scope from the
 * route params and mounts `<AuditView>`.
 *
 * Five entry points, all under the `/audit/` prefix to avoid colliding
 * with existing routes (`/sessions/:id` already routes to SessionChat;
 * `/tasks` to the Tasks list). The Phase 3 brief asked for bare paths
 * `/sessions/:sid` etc.; the prefix is the minimum viable deviation
 * that honors "existing pages keep their behavior".
 *
 *   /audit/sessions/:sid                       → session scope (degraded today — see hook GAP)
 *   /audit/sessions/:sid/workflows/:wid        → workflow scope
 *   /audit/tasks/:tid                          → task scope
 *   /audit/tasks/:tid/subtasks/:stid           → sub-task scope
 *   /audit/tasks/:tid/subagents/:said          → sub-agent scope
 *
 * Page component is a single shell — the URL pattern selects the scope
 * variant; the component never branches on render. Live + historical
 * paths use the same render via `useAuditProjection`'s polling
 * cadence (configured in `AuditView` via the hook options below).
 */
import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { AuditView } from '@/components/chat/audit-view';
import { type AuditScope, useAuditProjection } from '@/hooks/use-audit-projection';

interface AuditViewPageProps {
  scopeKind: AuditScope['kind'];
}

export default function AuditViewPage({ scopeKind }: AuditViewPageProps) {
  const params = useParams();
  const scope = resolveScope(scopeKind, params);

  if (!scope) {
    return (
      <div className="rounded-md border border-yellow/40 bg-yellow/5 px-3 py-2 text-sm text-yellow">
        Audit URL is missing a required parameter for {scopeKind} scope. Check the URL.
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="text-sm text-text-muted">Loading audit log…</div>}>
      <AuditViewPageInner scope={scope} />
    </Suspense>
  );
}

function AuditViewPageInner({ scope }: { scope: AuditScope }) {
  // Polling cadence: audit URLs are mostly historical-replay surfaces, so
  // a 60s stale + no auto-refetch keeps the page responsive without
  // hammering /process-state. Live mode (chat-bubble inline AuditView)
  // continues to use the tighter 5s/7s cadence configured in
  // turn-process-surfaces.tsx.
  const audit = useAuditProjection(scope, {
    enabled: true,
    staleTimeMs: 60_000,
    refetchIntervalMs: false,
  });

  if (audit.isLoading) {
    return <div className="text-sm text-text-muted">Loading audit log…</div>;
  }
  if (audit.notFound) {
    return (
      <div className="rounded-md border border-border bg-bg/30 px-3 py-2 text-sm text-text-muted">
        No audit data for this entity.
      </div>
    );
  }
  if (audit.isDegraded) {
    return (
      <div className="rounded-md border border-border bg-bg/30 px-3 py-2 text-sm text-text-muted">
        <p className="font-medium text-text">Session-scope audit aggregates per-task data</p>
        <p className="mt-1 text-xs">
          Use a task-scoped audit URL (<code>/audit/tasks/:tid</code>) for full per-entry audit
          drill-through within a session.
        </p>
      </div>
    );
  }
  return (
    <AuditView
      auditLog={audit.auditLog}
      byEntity={audit.byEntity}
      provenance={audit.provenance}
      completenessBySection={audit.completenessBySection}
    />
  );
}

function resolveScope(
  kind: AuditScope['kind'],
  params: Record<string, string | undefined>,
): AuditScope | null {
  switch (kind) {
    case 'task': {
      const taskId = params.tid;
      return taskId ? { kind: 'task', taskId } : null;
    }
    case 'subtask': {
      const taskId = params.tid;
      const subTaskId = params.stid;
      return taskId && subTaskId ? { kind: 'subtask', taskId, subTaskId } : null;
    }
    case 'subagent': {
      const taskId = params.tid;
      const subAgentId = params.said;
      return taskId && subAgentId ? { kind: 'subagent', taskId, subAgentId } : null;
    }
    case 'workflow': {
      const sessionId = params.sid;
      const workflowId = params.wid;
      return sessionId && workflowId ? { kind: 'workflow', sessionId, workflowId } : null;
    }
    case 'session': {
      const sessionId = params.sid;
      return sessionId ? { kind: 'session', sessionId } : null;
    }
  }
}
