/**
 * Pure derivation of the unified TimelineHistory rows.
 *
 * Folds every chronological signal the reducer collects into a single
 * ordered list:
 *   - process-log entries (skill match / agent routed / synthesized / …)
 *   - decisionStage (1 row, kind 'decision')
 *   - plan-step transitions (queued → running → done|failed|skipped)
 *   - tool-call lifecycle (start, end with summarized result)
 *   - sub-agent spawn / return
 *   - gate request / decision (approval / human-input / partial)
 *   - oracle / critic verdicts
 *   - escalations
 *
 * No React, no hooks. Same input → same output.
 */
import type {
  CriticVerdictEntry,
  EscalationEntry,
  MultiAgentSubtaskView,
  OracleVerdictEntry,
  PlanStep,
  ProcessLogEntry,
  ProcessLogKind,
  StreamingTurn,
  ToolCall,
} from '@/hooks/use-streaming-turn';
import type { TurnSurfaceMode } from '@/lib/turn-surface-policy';
import { DECISION_LABEL, GROUP_MODE_LABEL } from '@/lib/workflow-labels';

export type TimelineRowKind =
  | 'process'
  | 'decision'
  | 'plan-step'
  | 'tool'
  | 'sub-agent'
  | 'gate'
  | 'oracle'
  | 'critic'
  | 'escalation';

export type TimelineRowSeverity = 'info' | 'success' | 'warn' | 'error';

export type TimelineActor =
  | 'orchestrator'
  | 'planner'
  | 'agent'
  | 'tool'
  | 'oracle'
  | 'critic'
  | 'user'
  | 'system';

export interface TimelineRow {
  id: string;
  ts: number;
  kind: TimelineRowKind;
  actor: TimelineActor;
  label: string;
  detail?: string;
  severity: TimelineRowSeverity;
  /** Plan step id this row belongs to (for filter-by-step). */
  stepId?: string;
  /** Process-log subtype, when applicable. */
  processKind?: ProcessLogKind;
}

const PROCESS_KIND_TO_ACTOR: Partial<Record<ProcessLogKind, TimelineActor>> = {
  skill_match: 'orchestrator',
  skill_miss: 'orchestrator',
  agent_routed: 'orchestrator',
  agent_synthesized: 'orchestrator',
  agent_synthesis_failed: 'orchestrator',
  capability_research: 'orchestrator',
  capability_research_failed: 'orchestrator',
};

function processSeverity(status: ProcessLogEntry['status']): TimelineRowSeverity {
  switch (status) {
    case 'success':
      return 'success';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Build the merged chronological timeline. All signals are emitted as
 * uniform `TimelineRow` records sorted by `ts` ascending. Multi-agent
 * `agent_routed` entries are dropped — `AgentRosterCard` already shows
 * delegate identity (matches the legacy `ProcessTimeline` filter).
 */
export function buildTimelineRows(
  turn: StreamingTurn,
  _mode: TurnSurfaceMode,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const dropAgentRouted = turn.multiAgentSubtasks.length >= 2;

  // 1. Process log
  for (const entry of turn.processLog) {
    if (dropAgentRouted && entry.kind === 'agent_routed') continue;
    rows.push({
      id: `process:${entry.id}`,
      ts: entry.at,
      kind: 'process',
      actor: PROCESS_KIND_TO_ACTOR[entry.kind] ?? 'orchestrator',
      label: entry.label,
      detail: entry.detail,
      severity: processSeverity(entry.status),
      processKind: entry.kind,
    });
  }

  // 2. Decision stage (single row at decisionStage.createdAt)
  if (turn.decisionStage) {
    const ds = turn.decisionStage;
    const labelBase = DECISION_LABEL[ds.decisionKind] ?? DECISION_LABEL.unknown;
    const groupSuffix = turn.multiAgentGroupMode
      ? ` · ${GROUP_MODE_LABEL[turn.multiAgentGroupMode]}`
      : '';
    const detailBits: string[] = [];
    if (ds.decisionRationale) detailBits.push(ds.decisionRationale);
    const trail: string[] = [];
    if (ds.routingLevel !== undefined) trail.push(`L${ds.routingLevel}`);
    if (ds.confidence !== undefined) trail.push(`conf ${(ds.confidence * 100).toFixed(0)}%`);
    if (trail.length) detailBits.push(trail.join(' · '));
    rows.push({
      id: `decision:${ds.taskId}:${ds.createdAt}`,
      ts: ds.createdAt,
      kind: 'decision',
      actor: 'planner',
      label: `${labelBase}${groupSuffix}`,
      detail: detailBits.join(' — ') || undefined,
      severity: 'info',
    });
  }

  // 3. Plan-step transitions — emit a row at each lifecycle change. The
  //    reducer keeps `startedAt` / `finishedAt` monotonic (defensive
  //    clamp in plan-surface.tsx:75); we trust those timestamps here.
  for (const step of turn.planSteps) {
    if (step.startedAt !== undefined) {
      rows.push({
        id: `step:start:${step.id}`,
        ts: step.startedAt,
        kind: 'plan-step',
        actor: 'agent',
        label: `Started · ${step.label}`,
        severity: 'info',
        stepId: step.id,
      });
    }
    if (
      step.finishedAt !== undefined &&
      (step.status === 'done' || step.status === 'failed' || step.status === 'skipped')
    ) {
      rows.push({
        id: `step:end:${step.id}`,
        ts: step.finishedAt,
        kind: 'plan-step',
        actor: 'agent',
        label: `${capitalize(step.status)} · ${step.label}`,
        severity: planStepSeverity(step.status),
        stepId: step.id,
      });
    }
  }

  // 4. Tool-call lifecycle — start (always) + end (when terminal). The
  //    reducer assigns `at` at start; `durationMs` lets us synthesize an
  //    end ts that is always >= start.
  for (const t of turn.toolCalls) {
    rows.push({
      id: `tool:start:${t.id}`,
      ts: t.at,
      kind: 'tool',
      actor: 'tool',
      label: `${t.name}`,
      severity: 'info',
      stepId: t.planStepId,
    });
    if (t.status !== 'running') {
      rows.push({
        id: `tool:end:${t.id}`,
        ts: t.at + (t.durationMs ?? 0),
        kind: 'tool',
        actor: 'tool',
        label: `${t.name} · ${t.status === 'success' ? 'ok' : 'error'}`,
        severity: toolSeverity(t),
        stepId: t.planStepId,
      });
    }
  }

  // 5. Sub-agent spawn / return
  for (const st of turn.multiAgentSubtasks) {
    if (st.startedAt !== undefined) {
      rows.push({
        id: `subagent:spawn:${st.subtaskId}`,
        ts: st.startedAt,
        kind: 'sub-agent',
        actor: 'agent',
        label: `Spawned · ${st.agentName ?? st.fallbackLabel}`,
        detail: st.objective || undefined,
        severity: 'info',
        stepId: st.stepId,
      });
    }
    if (st.completedAt !== undefined) {
      rows.push({
        id: `subagent:return:${st.subtaskId}`,
        ts: st.completedAt,
        kind: 'sub-agent',
        actor: 'agent',
        label: `${capitalize(st.status)} · ${st.agentName ?? st.fallbackLabel}`,
        detail: st.errorMessage || undefined,
        severity: subAgentSeverity(st),
        stepId: st.stepId,
      });
    }
  }

  // 6. Gate events — request only (decision events arrive via processLog
  //    or terminal task events that the reducer has already cleared).
  if (turn.pendingApproval) {
    rows.push({
      id: `gate:approval:${turn.pendingApproval.taskId}:${turn.pendingApproval.at}`,
      ts: turn.pendingApproval.at,
      kind: 'gate',
      actor: 'system',
      label: 'Plan approval requested',
      severity: 'warn',
    });
  }
  if (turn.pendingHumanInput) {
    rows.push({
      id: `gate:human:${turn.pendingHumanInput.stepId}:${turn.pendingHumanInput.at}`,
      ts: turn.pendingHumanInput.at,
      kind: 'gate',
      actor: 'system',
      label: 'Human input requested',
      detail: turn.pendingHumanInput.question,
      severity: 'warn',
      stepId: turn.pendingHumanInput.stepId,
    });
  }
  if (turn.pendingPartialDecision) {
    rows.push({
      id: `gate:partial:${turn.pendingPartialDecision.taskId}:${turn.pendingPartialDecision.at}`,
      ts: turn.pendingPartialDecision.at,
      kind: 'gate',
      actor: 'system',
      label: 'Partial-failure decision requested',
      severity: 'warn',
    });
  }

  // 7. Oracle / critic verdicts
  for (const v of turn.oracleVerdicts) {
    rows.push({
      id: `oracle:${v.oracle}:${v.at}`,
      ts: v.at,
      kind: 'oracle',
      actor: 'oracle',
      label: `${v.oracle} · ${v.verdict}`,
      detail: v.reason,
      severity: oracleSeverity(v),
    });
  }
  for (const c of turn.criticVerdicts) {
    rows.push({
      id: `critic:${c.at}`,
      ts: c.at,
      kind: 'critic',
      actor: 'critic',
      label: c.accepted ? 'Critic accepted' : 'Critic rejected',
      detail: c.reason ?? `confidence ${(c.confidence * 100).toFixed(0)}%`,
      severity: criticSeverity(c),
    });
  }

  // 8. Escalations
  for (const e of turn.escalations) {
    rows.push({
      id: `escalation:${e.at}:${e.toLevel}`,
      ts: e.at,
      kind: 'escalation',
      actor: 'orchestrator',
      label: `Escalated L${e.fromLevel} → L${e.toLevel}`,
      detail: e.reason,
      severity: 'warn',
    });
  }

  rows.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return rows;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function toolSeverity(t: ToolCall): TimelineRowSeverity {
  if (t.status === 'success') return 'success';
  if (t.status === 'error') return 'error';
  return 'info';
}

function subAgentSeverity(st: MultiAgentSubtaskView): TimelineRowSeverity {
  switch (st.status) {
    case 'done':
      return 'success';
    case 'failed':
    case 'timeout':
      return 'error';
    case 'skipped':
      return 'warn';
    default:
      return 'info';
  }
}

function oracleSeverity(v: OracleVerdictEntry): TimelineRowSeverity {
  if (v.verdict === 'pass') return 'success';
  if (v.verdict === 'fail') return 'error';
  return 'info';
}

function criticSeverity(c: CriticVerdictEntry): TimelineRowSeverity {
  return c.accepted ? 'success' : 'error';
}

// `EscalationEntry` is currently always tagged warn; if future fields
// flip severity (e.g. escalation succeeded), update this helper.
export function _escalationSeverity(_e: EscalationEntry): TimelineRowSeverity {
  return 'warn';
}

// ─────────────────────────────────────────────────────────────────────
// Helpers exposed for Phase B and consumers that filter rows
// ─────────────────────────────────────────────────────────────────────

/**
 * Coarse `PlanStep` lifecycle severity, used by Phase B and by the
 * roster card's status badges.
 */
export function planStepSeverity(status: PlanStep['status']): TimelineRowSeverity {
  switch (status) {
    case 'done':
      return 'success';
    case 'failed':
      return 'error';
    case 'skipped':
      return 'warn';
    case 'running':
      return 'info';
    default:
      return 'info';
  }
}

export function isTerminalRow(row: TimelineRow): boolean {
  return row.severity === 'success' || row.severity === 'error';
}
