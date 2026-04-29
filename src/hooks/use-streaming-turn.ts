/**
 * Per-turn streaming reducer.
 *
 * Folds SSE bus events emitted while a task runs into a `StreamingTurn` shape
 * that powers the live "Claude Code"-style chat bubble in session-chat.
 *
 * The backend already streams rich events via POST /sessions/:id/messages with
 * `stream: true` (see src/api/sse.ts). This hook is the client-side consumer —
 * it reshapes that firehose into the progressive UI (phase chip, tool cards,
 * oracle verdicts, final content).
 */
import { create } from 'zustand';
import type { SSEEvent } from '@/lib/api-client';
import { PHASE_ORDER, type PhaseName } from '@/lib/phases';

export type { PhaseName };

export interface PhaseTiming {
  phase: PhaseName;
  durationMs: number;
  at: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args?: unknown;
  status: 'running' | 'success' | 'error';
  result?: unknown;
  durationMs?: number;
  at: number;
  /**
   * Plan step that was running when this tool started, if any. The reducer
   * fills this from `turn.planSteps.find(s => s.status === 'running')?.id`
   * at the moment the tool fires — heuristic but correct for sequential
   * workflows. `undefined` for ad-hoc / non-workflow turns; the UI groups
   * unattributed tools under an implicit "Working" step.
   */
  planStepId?: string;
}

export interface OracleVerdictEntry {
  oracle: string;
  verdict: 'pass' | 'fail' | 'unknown';
  reason?: string;
  at: number;
}

export interface EscalationEntry {
  fromLevel: number;
  toLevel: number;
  reason: string;
  at: number;
}

export interface CriticVerdictEntry {
  accepted: boolean;
  confidence: number;
  reason?: string;
  at: number;
}

/**
 * One entry in the chronological "process timeline" surfaced under the
 * streaming bubble. Each entry corresponds to a single bus event that
 * represents an orchestrator decision the user benefits from seeing
 * (skill match, agent routing/synthesis, capability research). Labels are
 * derived from typed payload fields — NEVER from regex over LLM output
 * (no-llm-output-postfilter rule).
 */
export type ProcessLogKind =
  | 'skill_match'
  | 'skill_miss'
  | 'agent_routed'
  | 'agent_synthesized'
  | 'agent_synthesis_failed'
  | 'capability_research'
  | 'capability_research_failed';

export interface ProcessLogEntry {
  id: string;
  kind: ProcessLogKind;
  label: string;
  detail?: string;
  status: 'info' | 'success' | 'warn' | 'error';
  at: number;
}

/** FIFO cap to keep `processLog` bounded on long agentic loops. */
const PROCESS_LOG_MAX = 50;

/**
 * Monotonic counter that disambiguates `${kind}-${ts}` ids when two events
 * of the same kind land in the same millisecond. Without this, React-keyed
 * lists collapse the second entry and the timeline silently drops events.
 */
let processLogSeq = 0;

function appendProcessLog(turn: StreamingTurn, entry: ProcessLogEntry): StreamingTurn {
  processLogSeq += 1;
  const uniqueEntry: ProcessLogEntry = { ...entry, id: `${entry.id}-${processLogSeq}` };
  const next = [...turn.processLog, uniqueEntry];
  return {
    ...turn,
    processLog: next.length > PROCESS_LOG_MAX ? next.slice(next.length - PROCESS_LOG_MAX) : next,
  };
}

export type StreamingStatus =
  | 'idle'
  | 'running'
  | 'input-required'
  | 'awaiting-approval'
  | 'done'
  | 'error';

export interface PendingApproval {
  taskId: string;
  goal: string;
  steps: Array<{
    id: string;
    description: string;
    strategy: string;
    dependencies: string[];
  }>;
  /** Wall-clock ms when plan_ready arrived. Used by the bubble to show elapsed wait. */
  at: number;
}

export interface StreamingTurn {
  taskId: string;
  status: StreamingStatus;
  startedAt: number;
  /** True when reconstructed after reload from server/global SSE state. */
  recovered?: boolean;
  finishedAt?: number;
  currentPhase?: PhaseName;
  /**
   * Sub-stage emitted by `task:stage_update` (e.g. `plan:decomposing`,
   * `plan:approval-gate`). Lets the chat header show "Planning · Decomposing"
   * instead of just "Planning". Observational only — never used for routing.
   */
  currentStageDetail?: {
    phase: string;
    stage: string;
    status: 'entered' | 'progress' | 'exited';
    attempt?: number;
    reason?: string;
    at: number;
  };
  phaseTimings: PhaseTiming[];
  toolCalls: ToolCall[];
  oracleVerdicts: OracleVerdictEntry[];
  /** Ordered escalation events (fromLevel → toLevel + reason). */
  escalations: EscalationEntry[];
  /** LLM-as-critic verdicts captured during verify phase. */
  criticVerdicts: CriticVerdictEntry[];
  clarifications: string[];
  finalContent: string;
  /** Streamed reasoning fragments (one per agent:thinking event). */
  reasoning: string[];
  thinking?: string;
  /** Cumulative tokens consumed across agent turns. */
  tokensConsumed?: number;
  /** Engine/worker id last selected for this task. */
  engineId?: string;
  /** Rationale for the engine selection, if surfaced by backend. */
  engineReason?: string;
  /** Current routing level (0=reflex, 1=heuristic, 2=analytical, 3=deliberative). */
  routingLevel?: number;
  /** Contract violations reported by the K1 enforcement layer. */
  contractViolations?: { count: number; policy: string };
  /** Plan/DAG snapshot from `agent:plan_update`. Drives the session setup card. */
  planSteps: PlanStep[];
  /**
   * Per-step LLM output, keyed by `PlanStep.id`. Populated by routing
   * `agent:text_delta` and `llm:stream_delta` (kind=content) deltas to the
   * currently-running step rather than blindly appending to `finalContent`.
   *
   * Why: agentic-workflow turns run an LLM call per step PLUS a final
   * synthesis call. Without scoping, all step outputs and the synthesis
   * concatenate into one wall of text that the user sees mid-stream — the
   * user reported seeing step 1's output ("3 concepts") and step 2's output
   * (a plot outline) stacked together as if they were the answer.
   *
   * Routing rule (in `agent:text_delta` / `llm:stream_delta` content):
   *   - if a plan step is `running` → append delta to `stepOutputs[stepId]`
   *   - else (planner pre-plan, synthesis post-steps, non-workflow tasks)
   *     → append to `finalContent` as before
   *
   * `task:complete` overwrites `finalContent` with `result.content`, which
   * is the synthesized final answer — so the FinalAnswer surface is clean
   * and the per-step bodies stay collapsible inside `PlanSurface`.
   */
  stepOutputs: Record<string, string>;
  /**
   * Chronological log of orchestrator decisions (skill match, routing,
   * synthesis, capability research). Powers the inline ProcessTimeline
   * surface that mirrors Claude-Code-style "process thinking" panels.
   * Capped at PROCESS_LOG_MAX entries (FIFO).
   */
  processLog: ProcessLogEntry[];
  /**
   * Workflow approval gate (Phase E). Set by `workflow:plan_ready` when
   * `awaitingApproval=true`; cleared on `workflow:plan_approved` /
   * `workflow:plan_rejected` or terminal task events. While set, the chat
   * bubble renders an inline Approve / Reject card.
   */
  pendingApproval?: PendingApproval;
  /** Internal stream bookkeeping used to de-dupe legacy/rich text events. */
  stream?: StreamState;
  /**
   * Raw orchestrator `TaskResult.status` captured on `task:complete`. Lets
   * the chat header distinguish `partial` (usable answer + at least one
   * sub-step failed/skipped) from clean `completed`. UI renders partial as
   * a warning, NOT as red error.
   */
  resultStatus?: 'completed' | 'failed' | 'escalated' | 'uncertain' | 'input-required' | 'partial';
  error?: string;
}

interface StreamState {
  /** Rich deltas are the preferred source once observed. */
  activeSource?: 'legacy' | 'rich';
  /** Last legacy text delta, used to suppress the immediately mirrored rich event. */
  lastLegacyText?: string;
}

export interface PlanStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  /**
   * Tool calls attributed to this step. Populated by the reducer at the
   * moment a tool starts (matched via the currently-running step) and
   * preserved across `agent:plan_update` snapshots.
   */
  toolCallIds: string[];
  /** Wall-clock ms when the step transitioned to `running`. */
  startedAt?: number;
  /** Wall-clock ms when the step transitioned to a terminal status. */
  finishedAt?: number;
  /**
   * Workflow step strategy from the planner — drives whether the
   * agent-timeline card treats this row as a delegate (distinct sub-agent
   * persona) vs an in-process step (llm-reasoning / direct-tool / etc.).
   * Optional for backward compatibility with snapshots from older backends.
   */
  strategy?: string;
  /**
   * Sub-agent persona that owns this step. Set for `delegate-sub-agent`
   * steps when the planner pinned a specific agentId, or filled in by
   * `workflow:delegate_dispatched` once the executor resolves the persona.
   */
  agentId?: string;
  /**
   * Per-step output preview captured from `workflow:delegate_completed`.
   * The UI agent-timeline card renders this so users can see what each
   * sub-agent actually said before the parent's synthesizer runs.
   */
  outputPreview?: string;
  /** Sub-task id (`${parent.id}-delegate-${stepId}`) for trace drill-down. */
  subTaskId?: string;
}

interface StreamingTurnState {
  /** Keyed by sessionId. Only one active turn per session at a time. */
  bySession: Record<string, StreamingTurn | undefined>;
  /** Runtime index so global SSE events can be routed back to recovered turns. */
  taskSessionIndex: Record<string, string | undefined>;
  /** Called on send() — starts a fresh turn for this session. */
  start: (sessionId: string) => void;
  /** Called after refresh when /tasks reports that this session still has a running task. */
  hydrateRunningTask: (sessionId: string, taskId: string) => void;
  /** Clears only a recovered turn, including stale running turns after /tasks says it is gone. */
  dropRecovered: (sessionId: string) => void;
  /** Called on each SSE event. No-op if we don't have an active turn yet. */
  ingest: (sessionId: string, event: SSEEvent) => void;
  /** Called by the global SSE stream; only mutates recovered turns to avoid POST-stream duplicates. */
  ingestGlobal: (event: SSEEvent) => { sessionId: string; taskId: string; status: StreamingStatus } | null;
  /** Called when the send mutation ends (success or error) — clears the bubble. */
  clear: (sessionId: string) => void;
  /**
   * Called from the mutation's onError when the fetch failed before any
   * SSE event that would have set a terminal status could arrive. Leaving
   * the turn as `running` would keep the send button disabled forever and
   * also make the guarded `clear` below a no-op.
   */
  setError: (sessionId: string, reason: string) => void;
}

export function emptyTurn(options: { taskId?: string; startedAt?: number; recovered?: boolean } = {}): StreamingTurn {
  return {
    taskId: options.taskId ?? '',
    status: 'running',
    startedAt: options.startedAt ?? Date.now(),
    recovered: options.recovered,
    phaseTimings: [],
    toolCalls: [],
    oracleVerdicts: [],
    escalations: [],
    criticVerdicts: [],
    clarifications: [],
    finalContent: '',
    reasoning: [],
    planSteps: [],
    stepOutputs: {},
    processLog: [],
  };
}

function taskInfoFromEvent(event: SSEEvent): { taskId?: string; sessionId?: string } {
  const payload = event.payload ?? {};
  const input = payload.input as Record<string, unknown> | undefined;
  const result = payload.result as Record<string, unknown> | undefined;
  return {
    taskId:
      (payload.taskId as string | undefined) ??
      (input?.id as string | undefined) ??
      (result?.id as string | undefined) ??
      ((result?.trace as Record<string, unknown> | undefined)?.taskId as string | undefined),
    sessionId: (payload.sessionId as string | undefined) ?? (input?.sessionId as string | undefined),
  };
}

function removeTaskIndexForSession(index: Record<string, string | undefined>, sessionId: string) {
  const next = { ...index };
  for (const [taskId, indexedSessionId] of Object.entries(next)) {
    if (indexedSessionId === sessionId) delete next[taskId];
  }
  return next;
}

function toolCallIdFromPayload(p: Record<string, unknown>, fallback: string): string {
  return (
    (p.toolCallId as string | undefined) ??
    (p.toolId as string | undefined) ??
    (p.id as string | undefined) ??
    fallback
  );
}

function toolNameFromPayload(p: Record<string, unknown>): string {
  return (p.toolName as string | undefined) ?? (p.tool as string | undefined) ?? (p.name as string | undefined) ?? 'tool';
}

function parsePartialToolInput(partialJson: string | undefined): unknown {
  if (!partialJson) return undefined;
  try {
    return JSON.parse(partialJson);
  } catch {
    return { partialJson };
  }
}

/**
 * Resolve which plan step a newly-started tool call should attach to.
 * Heuristic: the first step currently in `running` status owns it. For
 * sequential workflows this is exactly correct; for parallel topologies
 * it picks the earliest-started running step, which is fine as a fallback
 * since the backend doesn't surface stepId on tool events today.
 */
function currentRunningStepId(turn: StreamingTurn): string | undefined {
  return turn.planSteps.find((s) => s.status === 'running')?.id;
}

function attachToolToStep(turn: StreamingTurn, toolId: string, stepId: string | undefined): StreamingTurn {
  if (!stepId) return turn;
  let mutated = false;
  const planSteps = turn.planSteps.map((s) => {
    if (s.id !== stepId || s.toolCallIds.includes(toolId)) return s;
    mutated = true;
    return { ...s, toolCallIds: [...s.toolCallIds, toolId] };
  });
  return mutated ? { ...turn, planSteps } : turn;
}

/**
 * Append a content delta into the right bucket — either the running step's
 * scoped output or the global `finalContent` — and update the legacy/rich
 * dedup bookkeeping. Called from both `agent:text_delta` and the
 * `llm:stream_delta` content branch so the routing rule lives in one place.
 */
function appendContentDelta(
  turn: StreamingTurn,
  delta: string,
  source: 'legacy' | 'rich',
): StreamingTurn {
  const nextStream: StreamState = {
    ...turn.stream,
    activeSource: source,
    lastLegacyText: source === 'legacy' ? delta : turn.stream?.lastLegacyText,
  };
  const stepId = currentRunningStepId(turn);
  if (stepId) {
    return {
      ...turn,
      stepOutputs: {
        ...turn.stepOutputs,
        [stepId]: (turn.stepOutputs[stepId] ?? '') + delta,
      },
      stream: nextStream,
    };
  }
  return {
    ...turn,
    finalContent: turn.finalContent + delta,
    stream: nextStream,
  };
}

function upsertToolCall(turn: StreamingTurn, entry: ToolCall): StreamingTurn {
  const index = turn.toolCalls.findIndex((t) => t.id === entry.id);
  if (index < 0) return { ...turn, toolCalls: [...turn.toolCalls, entry] };
  const existing = turn.toolCalls[index];
  const toolCalls = [...turn.toolCalls];
  toolCalls[index] = {
    ...existing,
    ...entry,
    args: entry.args ?? existing.args,
    result: entry.result ?? existing.result,
    durationMs: entry.durationMs ?? existing.durationMs,
  };
  return { ...turn, toolCalls };
}

export const useStreamingTurnStore = create<StreamingTurnState>((set) => ({
  bySession: {},
  taskSessionIndex: {},
  start: (sessionId) =>
    set((s) => ({
      bySession: { ...s.bySession, [sessionId]: emptyTurn() },
    })),
  hydrateRunningTask: (sessionId, taskId) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      const nextIndex = { ...s.taskSessionIndex, [taskId]: sessionId };
      if (prev?.status === 'running' && prev.taskId === taskId) {
        return { taskSessionIndex: nextIndex };
      }
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: emptyTurn({ taskId, recovered: true }),
        },
        taskSessionIndex: nextIndex,
      };
    }),
  dropRecovered: (sessionId) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      if (!prev?.recovered) return s;
      const { [sessionId]: _drop, ...rest } = s.bySession;
      return { bySession: rest, taskSessionIndex: removeTaskIndexForSession(s.taskSessionIndex, sessionId) };
    }),
  clear: (sessionId) =>
    set((s) => {
      // Defense against a stale setTimeout(clear, 400) from a previously
      // completed send racing with a freshly-started turn: if the turn is
      // still in flight (running or paused at the approval gate), leave
      // its bubble alone. Clears only happen against terminal turns
      // (done/error/input-required).
      const prev = s.bySession[sessionId];
      if (prev?.status === 'running' || prev?.status === 'awaiting-approval') return s;
      const { [sessionId]: _drop, ...rest } = s.bySession;
      return { bySession: rest, taskSessionIndex: removeTaskIndexForSession(s.taskSessionIndex, sessionId) };
    }),
  ingest: (sessionId, event) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      if (!prev) return s;
      const next = reduceTurn(prev, event);
      if (next === prev) return s;
      const taskId = next.taskId || prev.taskId;
      return {
        bySession: { ...s.bySession, [sessionId]: next },
        taskSessionIndex: taskId ? { ...s.taskSessionIndex, [taskId]: sessionId } : s.taskSessionIndex,
      };
    }),
  ingestGlobal: (event) => {
    let result: { sessionId: string; taskId: string; status: StreamingStatus } | null = null;
    set((s) => {
      const info = taskInfoFromEvent(event);
      const taskId = info.taskId;
      if (!taskId) return s;

      const sessionId = info.sessionId ?? s.taskSessionIndex[taskId];
      if (!sessionId) return s;

      const prev = s.bySession[sessionId];
      const nextIndex = { ...s.taskSessionIndex, [taskId]: sessionId };

      if (prev && !prev.recovered) {
        return { taskSessionIndex: nextIndex };
      }

      const base = prev ?? emptyTurn({ taskId, startedAt: event.ts || Date.now(), recovered: true });
      const next = reduceTurn({ ...base, recovered: true }, event);
      result = { sessionId, taskId, status: next.status };

      return {
        bySession: { ...s.bySession, [sessionId]: next },
        taskSessionIndex: nextIndex,
      };
    });
    return result;
  },
  setError: (sessionId, reason) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      if (!prev) return s;
      if (prev.status === 'done' || prev.status === 'error') return s;
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...prev,
            status: 'error',
            finishedAt: Date.now(),
            error: reason || prev.error,
          },
        },
      };
    }),
}));

/** Pure reducer — exported for unit tests. */
export function reduceTurn(turn: StreamingTurn, event: SSEEvent): StreamingTurn {
  const p = event.payload ?? {};
  switch (event.event) {
    case 'task:start': {
      const input = (p.input as Record<string, unknown> | undefined) ?? {};
      const routing = (p.routing as Record<string, unknown> | undefined) ?? {};
      const id = (input.id as string) ?? turn.taskId;
      const level = typeof routing.level === 'number' ? (routing.level as number) : undefined;
      const model = typeof routing.model === 'string' ? (routing.model as string) : undefined;
      // Upsert: backend may emit `task:start` twice — once preliminary at
      // executeTaskCore entry (model='pending', level=0), then again from
      // the full-pipeline branch with the real routing decision. Take the
      // later real model over the earlier sentinel.
      const isPlaceholderModel = model === 'pending' || model === 'unknown';
      const nextEngineId = !isPlaceholderModel && model ? model : turn.engineId ?? model;
      return {
        ...turn,
        taskId: id,
        startedAt: turn.startedAt || event.ts,
        routingLevel: level ?? turn.routingLevel,
        engineId: nextEngineId,
      };
    }
    case 'phase:timing': {
      const phase = p.phase as PhaseName | undefined;
      const durationMs = (p.durationMs as number) ?? 0;
      if (!phase) return turn;
      // `phase:timing` fires AFTER a phase completes. Advance `currentPhase`
      // to the next phase in PHASE_ORDER so the header reflects what is
      // actually running now, not what just finished. Fall back to the
      // completed phase if it is unknown or the final phase.
      const idx = PHASE_ORDER.indexOf(phase);
      const nextPhase = idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : phase;
      return {
        ...turn,
        currentPhase: nextPhase,
        phaseTimings: [...turn.phaseTimings, { phase, durationMs, at: event.ts }],
      };
    }
    case 'task:stage_update': {
      // Sub-stage telemetry. Observational only — never alters routing
      // or any other governance state. We keep the latest snapshot so
      // the header shows the most recent "Planning · Decomposing" style
      // marker until a new stage or phase advance overrides it.
      const phase = typeof p.phase === 'string' ? p.phase : undefined;
      const stage = typeof p.stage === 'string' ? p.stage : undefined;
      const status =
        p.status === 'entered' || p.status === 'progress' || p.status === 'exited'
          ? (p.status as 'entered' | 'progress' | 'exited')
          : undefined;
      if (!phase || !stage || !status) return turn;
      const attempt = typeof p.attempt === 'number' ? p.attempt : undefined;
      const reason = typeof p.reason === 'string' ? p.reason : undefined;
      return {
        ...turn,
        currentStageDetail: { phase, stage, status, attempt, reason, at: event.ts },
      };
    }
    case 'agent:tool_started': {
      // Phase 2 UX: show a "running" tool card before execution completes.
      // Paired with `agent:tool_executed` via toolCallId.
      const toolName = toolNameFromPayload(p);
      const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
      // Dedupe: if an entry with this id already exists, leave it alone.
      if (turn.toolCalls.some((t) => t.id === toolId)) return turn;
      const args = (p.args as unknown) ?? (p.input as unknown) ?? undefined;
      const planStepId = currentRunningStepId(turn);
      const next: StreamingTurn = {
        ...turn,
        toolCalls: [
          ...turn.toolCalls,
          { id: toolId, name: toolName, args, status: 'running', at: event.ts, planStepId },
        ],
      };
      return attachToolToStep(next, toolId, planStepId);
    }
    case 'agent:tool_executed': {
      const toolName = toolNameFromPayload(p);
      const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
      // Backend emits `isError` (bus contract); accept legacy `success` too.
      const isError = p.isError === true ? true : p.success === false ? true : false;
      const status: ToolCall['status'] = isError ? 'error' : 'success';
      const durationMs = (p.durationMs as number) ?? undefined;
      const args = (p.args as unknown) ?? (p.input as unknown) ?? undefined;
      const result = (p.result as unknown) ?? (p.output as unknown) ?? undefined;

      // Finalize an in-progress entry if present; otherwise append.
      const idx = turn.toolCalls.findIndex((t) => t.id === toolId);
      if (idx >= 0) {
        const existing = turn.toolCalls[idx];
        const updated: ToolCall = {
          ...existing,
          status,
          durationMs: durationMs ?? existing.durationMs,
          result: result ?? existing.result,
          args: existing.args ?? args,
        };
        const toolCalls = [...turn.toolCalls];
        toolCalls[idx] = updated;
        return { ...turn, toolCalls };
      }
      return {
        ...turn,
        toolCalls: [
          ...turn.toolCalls,
          { id: toolId, name: toolName, args, status, result, durationMs, at: event.ts },
        ],
      };
    }
    case 'oracle:verdict': {
      const oracle = (p.oracleName as string) ?? (p.oracle as string) ?? 'oracle';
      const raw = (p.verdict as Record<string, unknown> | string | undefined) ?? undefined;
      let verdict: 'pass' | 'fail' | 'unknown' = 'unknown';
      let reason: string | undefined;
      if (typeof raw === 'string') {
        verdict = raw === 'pass' || raw === 'fail' ? raw : 'unknown';
      } else if (raw) {
        const t = raw.type as string | undefined;
        if (t === 'pass' || t === 'fail') verdict = t;
        reason = (raw.reason as string) ?? (raw.message as string) ?? undefined;
      }
      return {
        ...turn,
        oracleVerdicts: [...turn.oracleVerdicts, { oracle, verdict, reason, at: event.ts }],
      };
    }
    case 'task:escalate': {
      const fromLevel = typeof p.fromLevel === 'number' ? p.fromLevel : 0;
      const toLevel = typeof p.toLevel === 'number' ? p.toLevel : fromLevel + 1;
      const reason = typeof p.reason === 'string' ? p.reason : 'escalation';
      return {
        ...turn,
        escalations: [...turn.escalations, { fromLevel, toLevel, reason, at: event.ts }],
        routingLevel: toLevel,
      };
    }
    case 'agent:thinking': {
      const rationale = typeof p.rationale === 'string' ? p.rationale : '';
      if (!rationale) return turn;
      return { ...turn, reasoning: [...turn.reasoning, rationale] };
    }
    case 'agent:turn_complete': {
      const tokens = typeof p.tokensConsumed === 'number' ? p.tokensConsumed : 0;
      if (tokens <= 0) return turn;
      return { ...turn, tokensConsumed: (turn.tokensConsumed ?? 0) + tokens };
    }
    case 'worker:selected': {
      const workerId = typeof p.workerId === 'string' ? p.workerId : turn.engineId;
      const reason = typeof p.reason === 'string' ? p.reason : turn.engineReason;
      if (!workerId) return turn;
      return { ...turn, engineId: workerId, engineReason: reason };
    }
    case 'critic:verdict': {
      const accepted = p.accepted === true;
      const confidence = typeof p.confidence === 'number' ? p.confidence : 0;
      const reason = typeof p.reason === 'string' ? p.reason : undefined;
      return {
        ...turn,
        criticVerdicts: [
          ...turn.criticVerdicts,
          { accepted, confidence, reason, at: event.ts },
        ],
      };
    }
    case 'agent:contract_violation': {
      const count = typeof p.violations === 'number' ? p.violations : 1;
      const policy = typeof p.policy === 'string' ? p.policy : 'policy';
      return { ...turn, contractViolations: { count, policy } };
    }
    case 'agent:plan_update': {
      const raw = Array.isArray(p.steps) ? (p.steps as unknown[]) : [];
      const steps: PlanStep[] = [];
      for (const s of raw) {
        if (!s || typeof s !== 'object') continue;
        const o = s as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : undefined;
        const label = typeof o.label === 'string' ? o.label : undefined;
        const status = o.status as PlanStep['status'] | undefined;
        if (!id || !label) continue;
        // Merge with the previous step entry so we preserve `toolCallIds`
        // (set by `agent:tool_started`) and step timings across snapshots.
        // Without this, every plan_update would overwrite the tool→step
        // mapping that the chat UI uses to nest tools under their step.
        const prev = turn.planSteps.find((ps) => ps.id === id);
        const nextStatus: PlanStep['status'] = status ?? prev?.status ?? 'pending';
        const startedAt =
          prev?.startedAt ??
          (nextStatus === 'running' ? event.ts || Date.now() : undefined);
        const finishedAt =
          prev?.finishedAt ??
          (nextStatus === 'done' || nextStatus === 'failed' || nextStatus === 'skipped'
            ? event.ts || Date.now()
            : undefined);
        // Backend-supplied multi-agent metadata: prefer values from this
        // snapshot, fall back to whatever the previous snapshot or a
        // `workflow:delegate_dispatched` event already set. The
        // `outputPreview` only ever arrives via the delegate_completed
        // event so we always preserve `prev?.outputPreview` here.
        const strategy =
          typeof o.strategy === 'string' ? (o.strategy as string) : prev?.strategy;
        const agentId =
          typeof o.agentId === 'string' ? (o.agentId as string) : prev?.agentId;
        steps.push({
          id,
          label,
          status: nextStatus,
          toolCallIds: prev?.toolCallIds ?? [],
          startedAt,
          finishedAt,
          ...(strategy ? { strategy } : {}),
          ...(agentId ? { agentId } : {}),
          ...(prev?.outputPreview ? { outputPreview: prev.outputPreview } : {}),
          ...(prev?.subTaskId ? { subTaskId: prev.subTaskId } : {}),
        });
      }
      if (steps.length === 0) return turn;
      return { ...turn, planSteps: steps };
    }
    case 'workflow:delegate_dispatched': {
      // Multi-agent UI: pin the resolved agent persona to the matching
      // step BEFORE the sub-task's `task:start` arrives. Plan checklist
      // and agent-timeline card both read PlanStep.agentId, so this lets
      // the UI surface "researcher started" the moment the executor
      // dispatches the delegate, not several seconds later.
      const stepId = typeof p.stepId === 'string' ? (p.stepId as string) : undefined;
      if (!stepId) return turn;
      const agentId = typeof p.agentId === 'string' ? (p.agentId as string) : undefined;
      const subTaskId = typeof p.subTaskId === 'string' ? (p.subTaskId as string) : undefined;
      const updated = turn.planSteps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              ...(agentId ? { agentId } : {}),
              ...(subTaskId ? { subTaskId } : {}),
              startedAt: s.startedAt ?? (event.ts || Date.now()),
              status: s.status === 'pending' ? ('running' as const) : s.status,
            }
          : s,
      );
      return { ...turn, planSteps: updated };
    }
    case 'workflow:delegate_completed': {
      // Multi-agent UI: capture the per-agent output preview so the
      // agent-timeline card can show what each sub-agent answered before
      // the parent's synthesizer aggregates them. Status update is
      // defensive — `agent:plan_update` will also flip the step but we
      // do not want a brief window where the preview is visible but the
      // step still reads as `running`.
      const stepId = typeof p.stepId === 'string' ? (p.stepId as string) : undefined;
      if (!stepId) return turn;
      // Bus payload status uses WorkflowStepResult vocabulary
      // ('completed' | 'failed' | 'skipped'), not PlanStep vocabulary
      // ('done' | 'failed' | 'skipped'). Map across the boundary.
      const rawStatus = typeof p.status === 'string' ? (p.status as string) : undefined;
      const outputPreview =
        typeof p.outputPreview === 'string' ? (p.outputPreview as string) : undefined;
      const mappedStatus: PlanStep['status'] | undefined =
        rawStatus === 'completed'
          ? 'done'
          : rawStatus === 'failed'
            ? 'failed'
            : rawStatus === 'skipped'
              ? 'skipped'
              : undefined;
      const updated = turn.planSteps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              ...(outputPreview ? { outputPreview } : {}),
              ...(mappedStatus
                ? {
                    status: mappedStatus,
                    finishedAt: s.finishedAt ?? (event.ts || Date.now()),
                  }
                : {}),
            }
          : s,
      );
      return { ...turn, planSteps: updated };
    }
    case 'agent:clarification_requested': {
      const questions =
        (p.questions as string[] | undefined) ??
        (p.clarifications as string[] | undefined) ??
        (p.question ? [p.question as string] : []);
      return {
        ...turn,
        status: 'input-required',
        clarifications: [...turn.clarifications, ...questions],
      };
    }
    case 'agent:text_delta': {
      // Phase 2 legacy token-level streaming. If a rich stream is active,
      // ignore legacy mirrors to avoid duplicated assistant text.
      const delta = (p.text as string) ?? '';
      if (!delta) return turn;
      if (turn.stream?.activeSource === 'rich') return turn;
      return appendContentDelta(turn, delta, 'legacy');
    }
    case 'llm:stream_delta': {
      const kind = p.kind as string | undefined;
      switch (kind) {
        case 'content': {
          const delta = (p.text as string) ?? '';
          if (!delta) return { ...turn, stream: { ...turn.stream, activeSource: 'rich' } };
          // Suppress the rich mirror of an immediately-prior legacy delta —
          // they carry identical text and we already routed the legacy one.
          const duplicateLegacyMirror =
            turn.stream?.activeSource === 'legacy' && turn.stream.lastLegacyText === delta;
          if (duplicateLegacyMirror) {
            return { ...turn, stream: { ...turn.stream, activeSource: 'rich' } };
          }
          return appendContentDelta(turn, delta, 'rich');
        }
        case 'thinking': {
          const delta = (p.text as string) ?? '';
          if (!delta) return { ...turn, stream: { ...turn.stream, activeSource: 'rich' } };
          return {
            ...turn,
            thinking: `${turn.thinking ?? ''}${delta}`,
            stream: { ...turn.stream, activeSource: 'rich' },
          };
        }
        case 'tool_use_start': {
          const toolName = toolNameFromPayload(p);
          const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
          const planStepId = currentRunningStepId(turn);
          const next = upsertToolCall(
            { ...turn, stream: { ...turn.stream, activeSource: 'rich' } },
            { id: toolId, name: toolName, status: 'running', at: event.ts, planStepId },
          );
          return attachToolToStep(next, toolId, planStepId);
        }
        case 'tool_use_input': {
          const toolName = toolNameFromPayload(p);
          const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
          const args = parsePartialToolInput(p.partialJson as string | undefined);
          return upsertToolCall(
            { ...turn, stream: { ...turn.stream, activeSource: 'rich' } },
            { id: toolId, name: toolName, args, status: 'running', at: event.ts },
          );
        }
        case 'tool_use_end': {
          const toolName = toolNameFromPayload(p);
          const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
          const args = parsePartialToolInput(p.partialJson as string | undefined);
          return upsertToolCall(
            { ...turn, stream: { ...turn.stream, activeSource: 'rich' } },
            { id: toolId, name: toolName, args, status: 'running', at: event.ts },
          );
        }
        default:
          return turn;
      }
    }
    case 'task:complete': {
      const result = (p.result as Record<string, unknown> | undefined) ?? {};
      const taskId = (result.id as string | undefined) ?? turn.taskId;
      const content = (result.content as string | undefined) ?? (result.answer as string | undefined) ?? turn.finalContent;
      const thinking = (result.thinking as string) ?? turn.thinking;
      const status = (result.status as string) ?? 'success';
      // Map orchestrator TaskResult.status to UI turn status.
      //  - 'input-required' → pause turn, surface clarifications
      //  - 'failed' / 'escalated' → error state, preserve answer as
      //    `error` so the chat bubble shows the orchestrator's
      //    user-facing explanation (e.g. wall-clock timeout message)
      //    instead of being silently marked 'done'.
      //  - everything else (e.g. 'completed', 'success') → done.
      const isFailureStatus = status === 'failed' || status === 'escalated';
      const uiStatus: 'done' | 'input-required' | 'error' =
        status === 'input-required' ? 'input-required' : isFailureStatus ? 'error' : 'done';
      return {
        ...turn,
        taskId,
        status: uiStatus,
        finishedAt: event.ts,
        finalContent: isFailureStatus ? turn.finalContent : content,
        thinking,
        resultStatus: status as StreamingTurn['resultStatus'],
        // Terminal — drop any unresolved approval card so the bubble can't
        // show "Approve / Reject" alongside the final answer if the
        // orchestrator races past the gate (e.g. auto-approve timeout).
        pendingApproval: undefined,
        ...(isFailureStatus
          ? { error: content ?? (result.escalationReason as string | undefined) ?? `Task ${status}` }
          : {}),
      };
    }
    case 'task:timeout': {
      // Backend (post-fix) emits `reason` plus structured diagnostics.
      // For older payloads without `reason`, reconstruct a useful
      // message from elapsedMs / budgetMs / stage data so the user
      // never sees just "Task timed out".
      const reason = p.reason as string | undefined;
      const elapsedMs = typeof p.elapsedMs === 'number' ? (p.elapsedMs as number) : undefined;
      const budgetMs = typeof p.budgetMs === 'number' ? (p.budgetMs as number) : undefined;
      const stage = p.currentStage as { phase?: string; stage?: string } | undefined;
      const lastTool = p.lastTool as { name?: string; status?: string } | undefined;
      let message = reason ?? 'Task timed out';
      if (!reason && elapsedMs !== undefined && budgetMs !== undefined) {
        message = `Task timed out after ${Math.round(elapsedMs / 1000)}s (budget: ${Math.round(budgetMs / 1000)}s)`;
        if (stage?.phase && stage?.stage) message += ` during ${stage.phase}:${stage.stage}`;
        else if (lastTool?.name) message += ` while running ${lastTool.name}`;
      }
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts,
        error: message,
        pendingApproval: undefined,
      };
    }
    case 'worker:error': {
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts,
        error: (p.error as string) ?? 'Worker error',
        pendingApproval: undefined,
      };
    }
    case 'workflow:plan_ready': {
      // Phase E: workflow executor pauses with `awaitingApproval=true` for
      // long-form goals. Surface the plan inline so the user can approve /
      // reject without leaving the chat. Skip the gate when not awaiting —
      // execution is already underway, the steps will arrive via
      // `agent:plan_update`.
      const awaiting = p.awaitingApproval === true;
      if (!awaiting) return turn;
      const taskId = (p.taskId as string | undefined) ?? turn.taskId;
      const goal = (p.goal as string | undefined) ?? '';
      const rawSteps = Array.isArray(p.steps) ? (p.steps as unknown[]) : [];
      const steps: PendingApproval['steps'] = [];
      for (const s of rawSteps) {
        if (!s || typeof s !== 'object') continue;
        const o = s as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : undefined;
        const description = typeof o.description === 'string' ? o.description : undefined;
        const strategy = typeof o.strategy === 'string' ? o.strategy : 'auto';
        if (!id || !description) continue;
        const deps = Array.isArray(o.dependencies)
          ? (o.dependencies as unknown[]).filter((d): d is string => typeof d === 'string')
          : [];
        steps.push({ id, description, strategy, dependencies: deps });
      }
      return {
        ...turn,
        taskId,
        status: 'awaiting-approval',
        pendingApproval: { taskId, goal, steps, at: event.ts || Date.now() },
      };
    }
    case 'workflow:plan_approved': {
      if (!turn.pendingApproval) return turn;
      // Resume execution — the executor will continue and emit step events.
      return {
        ...turn,
        status: 'running',
        pendingApproval: undefined,
      };
    }
    case 'workflow:plan_rejected': {
      // Fired both on user reject and on approval-timer expiry (executor
      // emits this on the timeout path so UIs can tear down the prompt
      // immediately instead of waiting for the eventual task:complete).
      const reason =
        (p.reason as string | undefined) ?? turn.error ?? 'Workflow plan rejected';
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts || Date.now(),
        pendingApproval: undefined,
        error: reason,
      };
    }
    case 'workflow:step_start': {
      // Per-step live signal complementing `agent:plan_update`. The plan
      // checklist may already be `running` from the most recent plan_update,
      // but this event fires inside the step so it gives us a more precise
      // `startedAt` and lets us flip status before the next plan_update
      // snapshot (which the executor emits after dispatch returns).
      const stepId = p.stepId as string | undefined;
      if (!stepId) return turn;
      const planSteps = turn.planSteps.map((s) =>
        s.id === stepId
          ? { ...s, status: 'running' as const, startedAt: s.startedAt ?? (event.ts || Date.now()) }
          : s,
      );
      return { ...turn, planSteps };
    }
    case 'workflow:step_complete': {
      const stepId = p.stepId as string | undefined;
      const status = p.status as 'completed' | 'failed' | 'skipped' | undefined;
      if (!stepId || !status) return turn;
      const mapped: PlanStep['status'] =
        status === 'completed' ? 'done' : status === 'skipped' ? 'skipped' : 'failed';
      const planSteps = turn.planSteps.map((s) =>
        s.id === stepId
          ? { ...s, status: mapped, finishedAt: event.ts || Date.now() }
          : s,
      );
      return { ...turn, planSteps };
    }
    case 'workflow:step_fallback': {
      // Strategy fell back; step keeps running but we don't have a plan-step
      // status change to record. No-op for state, but reducers downstream
      // could surface this as a sub-event. Left as a passthrough so future
      // UI hooks have a place to land.
      return turn;
    }
    // ── Capability-first observability → process timeline ──
    case 'skill:match': {
      const skill = (p.skill as Record<string, unknown> | undefined) ?? {};
      const name =
        (skill.name as string | undefined) ??
        (skill.id as string | undefined) ??
        (skill.skillId as string | undefined) ??
        'unknown';
      return appendProcessLog(turn, {
        id: `skill-match-${event.ts}`,
        kind: 'skill_match',
        label: `Loaded skill: ${name}`,
        status: 'success',
        at: event.ts,
      });
    }
    case 'skill:miss': {
      const sig = typeof p.taskSignature === 'string' ? (p.taskSignature as string) : '';
      return appendProcessLog(turn, {
        id: `skill-miss-${event.ts}`,
        kind: 'skill_miss',
        label: 'No matching skill',
        detail: sig || undefined,
        status: 'info',
        at: event.ts,
      });
    }
    case 'agent:routed': {
      const agentId = typeof p.agentId === 'string' ? (p.agentId as string) : 'agent';
      const reason = typeof p.reason === 'string' ? (p.reason as string) : undefined;
      const score = typeof p.score === 'number' ? (p.score as number) : undefined;
      const detailParts: string[] = [];
      if (reason) detailParts.push(reason);
      if (typeof score === 'number') detailParts.push(`score ${score.toFixed(2)}`);
      return appendProcessLog(turn, {
        id: `agent-routed-${event.ts}`,
        kind: 'agent_routed',
        label: `Routed to ${agentId}`,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
        status: 'info',
        at: event.ts,
      });
    }
    case 'agent:synthesized': {
      const agentId = typeof p.agentId === 'string' ? (p.agentId as string) : 'agent';
      const caps = Array.isArray(p.capabilities) ? (p.capabilities as string[]) : [];
      const rationale = typeof p.rationale === 'string' ? (p.rationale as string) : undefined;
      return appendProcessLog(turn, {
        id: `agent-synth-${event.ts}`,
        kind: 'agent_synthesized',
        label: `Synthesized agent ${agentId}`,
        detail: caps.length > 0 ? `for ${caps.join(', ')}${rationale ? ` — ${rationale}` : ''}` : rationale,
        status: 'success',
        at: event.ts,
      });
    }
    case 'agent:synthesis-failed': {
      const reason = typeof p.reason === 'string' ? (p.reason as string) : 'unknown error';
      return appendProcessLog(turn, {
        id: `agent-synth-fail-${event.ts}`,
        kind: 'agent_synthesis_failed',
        label: 'Agent synthesis failed',
        detail: reason,
        status: 'warn',
        at: event.ts,
      });
    }
    case 'agent:capability-research': {
      const caps = Array.isArray(p.capabilities) ? (p.capabilities as string[]) : [];
      const contextCount = typeof p.contextCount === 'number' ? (p.contextCount as number) : 0;
      const sources = Array.isArray(p.sources) ? (p.sources as string[]) : [];
      const capLabel = caps.length > 0 ? caps.join(', ') : 'capability';
      return appendProcessLog(turn, {
        id: `cap-research-${event.ts}`,
        kind: 'capability_research',
        label: `Researched ${capLabel}`,
        detail: `${contextCount} hit${contextCount === 1 ? '' : 's'}${sources.length > 0 ? ` from ${sources.join(', ')}` : ''}`,
        status: 'info',
        at: event.ts,
      });
    }
    case 'agent:capability-research-failed': {
      const reason = typeof p.reason === 'string' ? (p.reason as string) : 'unknown error';
      return appendProcessLog(turn, {
        id: `cap-research-fail-${event.ts}`,
        kind: 'capability_research_failed',
        label: 'Capability research failed',
        detail: reason,
        status: 'warn',
        at: event.ts,
      });
    }
    default:
      return turn;
  }
}

/** Selector helper — returns the streaming turn for a session or null. */
export function useStreamingTurn(sessionId: string | null): StreamingTurn | null {
  return useStreamingTurnStore((s) => (sessionId ? s.bySession[sessionId] ?? null : null));
}
