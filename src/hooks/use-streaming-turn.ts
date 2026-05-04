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
import {
  isCodingCliEvent,
  reduceCodingCliSessions,
  type CodingCliSessionState,
} from './coding-cli-state';

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

/**
 * Stage manifest shapes — mirror of the backend's `WorkflowStageManifest`
 * (src/orchestrator/workflow/stage-manifest.ts). Carried into the streaming
 * turn so process replay can render the post-prompt decision, todo list,
 * and multi-agent subtask manifest without re-deriving them client-side.
 */
export type WorkflowDecisionKind =
  | 'conversational'
  | 'direct-tool'
  | 'single-agent'
  | 'multi-agent'
  | 'human-input-required'
  | 'approval-required'
  | 'full-pipeline'
  | 'unknown';

export interface WorkflowDecisionStageView {
  taskId: string;
  sessionId?: string;
  userPrompt: string;
  decisionKind: WorkflowDecisionKind;
  decisionRationale?: string;
  createdAt: number;
  routingLevel?: number;
  confidence?: number;
}

export type WorkflowTodoOwnerType = 'system' | 'agent' | 'human' | 'tool';
export type WorkflowTodoStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface WorkflowTodoItemView {
  id: string;
  title: string;
  description?: string;
  ownerType: WorkflowTodoOwnerType;
  ownerId?: string;
  status: WorkflowTodoStatus;
  dependsOn: string[];
  sourceStepId?: string;
  expectedOutput?: string;
  failureReason?: string;
}

export type MultiAgentGroupMode =
  | 'parallel'
  | 'competition'
  | 'debate'
  | 'comparison'
  | 'pipeline';

export type MultiAgentSubtaskStatus =
  | 'planned'
  | 'dispatched'
  | 'running'
  | 'done'
  | 'failed'
  | 'timeout'
  | 'skipped';

export type MultiAgentSubtaskErrorKind =
  | 'provider_quota'
  | 'timeout'
  | 'empty_response'
  | 'parse_error'
  | 'contract_violation'
  | 'dependency_failed'
  | 'subtask_failed'
  // Q1 — backend's permanent failure marker for "delegate dispatch
  // infrastructure not wired" (executeTask missing, registry empty).
  // Surfaces in the persisted event log as a `workflow:delegate_failed`
  // payload's `errorClass`. Treated like the other unknown / failed
  // kinds in the UI today; kept in the union so the type narrows
  // exhaustively when consumers add a switch.
  | 'infrastructure_unavailable'
  | 'unknown';

/**
 * Per-(stepId, round) telemetry from the collaboration block. Mirrors
 * the backend's `TaskProcessCollaborationRound` (api-client.ts) so the
 * agent-roster-card disclosure renders the round-by-round timeline
 * without breaking the "one card per agent" cardinality contract.
 */
export interface CollaborationRoundView {
  stepId: string;
  round: number;
  agentId?: string;
  status: 'completed' | 'failed' | string;
  outputPreview?: string;
  tokensConsumed?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface MultiAgentSubtaskView {
  subtaskId: string;
  parentTaskId: string;
  sessionId?: string;
  stepId: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  capabilityTags?: string[];
  /**
   * Deterministic fallback label assigned by the backend (e.g. "Agent 1").
   * Used by the UI in place of "agent?" when `agentId`/`agentName` are
   * unset — guaranteed unique within the same multi-agent plan.
   */
  fallbackLabel: string;
  title: string;
  objective: string;
  prompt: string;
  inputRefs: string[];
  expectedOutput?: string;
  status: MultiAgentSubtaskStatus;
  startedAt?: number;
  completedAt?: number;
  outputPreview?: string;
  errorKind?: MultiAgentSubtaskErrorKind;
  errorMessage?: string;
  partialOutputAvailable?: boolean;
  fallbackAttempted?: boolean;
}

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

const MULTI_AGENT_GROUP_MODES: ReadonlySet<string> = new Set([
  'parallel',
  'competition',
  'debate',
  'comparison',
  'pipeline',
]);

function isMultiAgentGroupMode(v: unknown): v is MultiAgentGroupMode {
  return typeof v === 'string' && MULTI_AGENT_GROUP_MODES.has(v);
}

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
  | 'awaiting-human-input'
  | 'done'
  | 'error';

/**
 * Workflow paused on an in-plan `human-input` step. Set by
 * `workflow:human_input_needed`; cleared by `workflow:human_input_provided`
 * (the matching response) or terminal task events. Distinct from
 * `pendingApproval` — that gates the WHOLE plan; this gates ONE step
 * inside the plan.
 */
export interface PendingHumanInput {
  taskId: string;
  stepId: string;
  question: string;
  /** Wall-clock ms when human_input_needed arrived. */
  at: number;
}

/**
 * Workflow paused on a partial-failure decision gate. Set by
 * `workflow:partial_failure_decision_needed` AFTER the execution loop
 * completes when at least one delegate-sub-agent failed AND its cascade
 * caused at least one dependent step to skip — i.e. the workflow can no
 * longer deliver what the user originally asked for. Cleared by
 * `workflow:partial_failure_decision_provided` (user picked continue/abort)
 * or terminal task events.
 *
 * Distinct from `pendingApproval` (gates pre-execution) and
 * `pendingHumanInput` (gates a planned `human-input` step). This one is
 * a runtime gate, fired only after auto-recovery has been ruled out.
 */
export interface PendingPartialDecision {
  taskId: string;
  /** Failed step ids — the planned work that did not complete. */
  failedStepIds: string[];
  /** Dependent step ids that cascade-skipped because of the failure. */
  skippedStepIds: string[];
  /** Step ids that completed normally — drives "we have N answers" copy. */
  completedStepIds: string[];
  /** Backend-built one-line title (e.g. "1 of 4 steps failed; 1 dependent skipped"). */
  summary: string;
  /** Tightly-capped excerpt of what `'continue'` would ship. */
  partialPreview?: string;
  /** Backend-honored decision window (ms). UI uses this for the countdown. */
  timeoutMs: number;
  /** Wall-clock ms when decision_needed arrived. */
  at: number;
}

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
  /**
   * Approval mode resolved by the backend's `classifyApprovalRequirement`.
   *   - 'agent-discretion': review window; on timeout Vinyan auto-decides.
   *   - 'human-required':   only the user can decide; no auto-approve.
   * Optional for back-compat with older backends — treat absence as
   * 'agent-discretion' so legacy auto-approval copy still renders.
   */
  approvalMode?: 'agent-discretion' | 'human-required';
  /** Approval window enforced by the backend (ms). UI uses this for the countdown. */
  timeoutMs?: number;
  /** False for human-required mode; UI must NOT show auto-approval copy. */
  autoDecisionAllowed?: boolean;
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
   * O(1) sub-task → step lookup: maps `PlanStep.subTaskId` → `PlanStep.id`.
   * Kept in sync by `plan_update` (rebuild) and `delegate_dispatched` (upsert)
   * so `appendContentDelta` can route sub-task deltas without scanning the
   * full `planSteps` array on every high-frequency stream event.
   */
  subTaskIdIndex: Record<string, string>;
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
  /**
   * Workflow paused on a `human-input` step inside the plan (e.g. "Ask the
   * user for the topic"). Set by `workflow:human_input_needed`; cleared on
   * `workflow:human_input_provided` or terminal task events. While set, the
   * chat bubble renders an inline answer textbox.
   */
  pendingHumanInput?: PendingHumanInput;
  /**
   * Workflow paused on a runtime partial-failure decision gate (after a
   * delegate-sub-agent failed + cascade-skipped a dependent step). Set
   * by `workflow:partial_failure_decision_needed`; cleared on
   * `workflow:partial_failure_decision_provided` or terminal task events.
   * While set, the chat bubble renders the inline decision card.
   */
  pendingPartialDecision?: PendingPartialDecision;
  /**
   * External Coding CLI substate, keyed by `codingCliSessionId`. One
   * agentic-workflow turn may spawn multiple coding-cli sessions
   * (e.g. delegate-sub-agent step that uses Claude Code in headless
   * mode for one file and a separate Copilot session for another).
   * The reducer in `coding-cli-state.ts` is the single mutator.
   */
  codingCliSessions: Record<string, CodingCliSessionState>;
  /**
   * Stage manifest — durable post-prompt decision/todo/multi-agent state.
   * Set by `workflow:decision_recorded`; updated by `workflow:todo_*` and
   * `workflow:subtask_*`. Survives reload because every event is recorded
   * to the task event log and replayed through `reduceTurn`.
   */
  decisionStage?: WorkflowDecisionStageView;
  todoList: WorkflowTodoItemView[];
  multiAgentSubtasks: MultiAgentSubtaskView[];
  /**
   * Per-(stepId, round) telemetry from the parent's collaboration block.
   * Populated from `workflow:collaboration_round` events. Empty for
   * single-round dispatch / non-debate turns. Sorted by stepId then
   * round so each agent's timeline is contiguous.
   */
  collaborationRounds: CollaborationRoundView[];
  /** Group mode for the multi-agent set (competition/debate/comparison). */
  multiAgentGroupMode?: MultiAgentGroupMode;
  /**
   * Structured verdict from the synthesis step on COMPETITION turns. Set by
   * `workflow:winner_determined` after the synthesis LLM returns a JSON
   * block that validates against the WinnerVerdict schema (winner ∈
   * participating agentIds). Absent ⇒ no winner declared (legacy turn,
   * non-competition, or structured-parse failed). UI must NEVER infer.
   * `winnerAgentId === null` is a deliberate "no clear winner" verdict.
   */
  winnerAgentId?: string | null;
  winnerReasoning?: string;
  winnerScores?: Record<string, number>;
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

/**
 * Statuses considered terminal for a plan step. The reducer treats
 * lifecycle as monotonic — once a step lands in any of these, later
 * snapshots cannot regress it back to `pending` / `running`. Centralised
 * so the `agent:plan_update` merge, the `task:complete` sweep, and any
 * future status-aware code share the same definition.
 */
const TERMINAL_STEP_STATUSES = new Set<PlanStep['status']>([
  'done',
  'failed',
  'skipped',
]);

/**
 * Terminal subtask statuses for `MultiAgentSubtask`. Mirrors the per-step
 * monotonic guard above — once a subtask reaches one of these phases, late
 * `workflow:subtask_updated` events whose payload still says `running`
 * (e.g. a sub-task whose own watchdog timer fired AFTER the parent already
 * completed) cannot revert the card back to a spinner. Without this guard
 * the chat bubble shows "Done" in the header but a `working` agent card
 * below — incoherent state.
 */
const TERMINAL_SUBTASK_STATUSES = new Set<MultiAgentSubtaskStatus>([
  'done',
  'failed',
  'timeout',
  'skipped',
]);

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
  /**
   * Replay persisted bus events into a recovered turn — fills the gap
   * left by browser refresh / SSE reconnect, where the stream only
   * forwards events that fire AFTER the new connection. Pre-refresh
   * events (e.g. the single `task:stage_update` that set the
   * "Planning · Decomposing" card) are durable in `task_events` but
   * invisible to a fresh subscriber. This action folds those events
   * through the same `reduceTurn` the live path uses.
   *
   * No-op when the matching session's turn is not `recovered` (live
   * SSE is already authoritative there) or its taskId differs from
   * the replayed log.
   */
  replayInto: (
    sessionId: string,
    taskId: string,
    events: ReadonlyArray<{ eventType: string; payload: Record<string, unknown>; ts: number }>,
  ) => void;
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
    subTaskIdIndex: {},
    stepOutputs: {},
    processLog: [],
    codingCliSessions: {},
    todoList: [],
    multiAgentSubtasks: [],
    collaborationRounds: [],
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

/**
 * Resolve the plan step that owns a tool/agent event. When the event came
 * from a delegated sub-agent the payload's `taskId` is the SUB-task id
 * (`workflow:delegate_dispatched.subTaskId`), so we look it up in
 * `subTaskIdIndex` to pin the tool to the right delegate step. Without this,
 * parallel delegates would all dump their tool calls onto whichever step
 * `currentRunningStepId` returned first — collapsing 3 personas' "Read X /
 * Fetched Y / Searched Z" into one row.
 */
function resolveStepId(
  turn: StreamingTurn,
  payload: Record<string, unknown>,
): string | undefined {
  const eventTaskId = typeof payload.taskId === 'string' ? (payload.taskId as string) : undefined;
  if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
    const subStep = turn.subTaskIdIndex[eventTaskId];
    if (subStep) return subStep;
  }
  return currentRunningStepId(turn);
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
  /**
   * Optional event taskId. When the delta originates from a sub-task
   * (delegate-sub-agent's own LLM stream), this is the SUB-task's id and
   * we route the text into the matching plan step's `stepOutputs`. Two
   * parallel delegates would otherwise both pile their streamed text
   * into whichever step `currentRunningStepId` returned first — a real
   * "voices mixed in the chat" bug. Falls back to the running-step
   * heuristic when undefined / matches the parent turn.
   */
  eventTaskId?: string,
): StreamingTurn {
  const nextStream: StreamState = {
    ...turn.stream,
    activeSource: source,
    lastLegacyText: source === 'legacy' ? delta : turn.stream?.lastLegacyText,
  };
  // Sub-task subTaskId match — route to the delegate step that owns
  // this sub-task. PlanStep.subTaskId is populated by
  // `workflow:delegate_dispatched` so the lookup is deterministic
  // once the dispatch event has been processed.
  let stepId: string | undefined;
  if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
    stepId = turn.subTaskIdIndex[eventTaskId];
    // Unknown sub-task (no matching delegate step) — drop the delta
    // rather than spraying it into the parent's content. Better to lose
    // the stream preview than to corrupt the running step's text.
    if (!stepId) return { ...turn, stream: nextStream };
  } else {
    stepId = currentRunningStepId(turn);
  }
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
      // Preserve an existing turn for the SAME task whenever it's still
      // in flight — running, paused at the workflow approval gate,
      // paused at a workflow human-input gate, or awaiting a top-level
      // clarification. Resetting to a fresh empty turn here would wipe
      // the post-replay state (status / pendingApproval / pendingHumanInput
      // / decisionStage) that `useRecoverTurnHistory` just installed.
      // Reproduces as: refresh → hydrate → replay sets awaiting-approval
      // → SessionChat's useEffect re-fires (turn is in its deps) → this
      // function would have rebuilt the empty turn (because status no
      // longer matches the narrow `'running'` check) → replay's
      // `lastReplayedRef` guard then refuses to re-run, so the chat
      // strands on a quiet "Planning · Decomposing" header forever.
      if (
        prev &&
        prev.taskId === taskId &&
        (prev.status === 'running' ||
          prev.status === 'awaiting-approval' ||
          prev.status === 'awaiting-human-input' ||
          prev.status === 'input-required')
      ) {
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
      if (
        prev?.status === 'running' ||
        prev?.status === 'awaiting-approval' ||
        prev?.status === 'awaiting-human-input'
      )
        return s;
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
  replayInto: (sessionId, taskId, events) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      // Only replay into the recovered (post-refresh) shell. A turn
      // started by the live `start()` action is already authoritative;
      // a turn whose taskId does not match means /tasks has moved on
      // since the history was fetched and we'd be overwriting fresher
      // state with stale rows.
      if (!prev || !prev.recovered || prev.taskId !== taskId) return s;
      if (events.length === 0) return s;
      let next = prev;
      for (const ev of events) {
        next = reduceTurn(next, { event: ev.eventType, payload: ev.payload, ts: ev.ts });
      }
      if (next === prev) return s;
      return {
        bySession: { ...s.bySession, [sessionId]: next },
        taskSessionIndex: { ...s.taskSessionIndex, [taskId]: sessionId },
      };
    }),
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

/**
 * Events that mutate parent-only state (lifecycle, status, plan, gates,
 * routing, synthesis, or content) and lack a per-event `eventTaskId`
 * isolation guard. When the historical replay receives one of these
 * with `scope: 'descendant'` we drop it — a sub-agent's `task:complete`
 * would otherwise overwrite `turn.taskId` (rebinding every subsequent
 * subTaskId-based tool routing to the child) and corrupt the parent's
 * plan-step sweep / final content. Events that already have eventTaskId
 * isolation (`agent:plan_update`, `workflow:delegate_dispatched`,
 * `workflow:delegate_completed`, `workflow:subtask_updated`) are left
 * out — their existing guards already short-circuit on mismatch.
 *
 * Allow-listed pass-through events (NOT in this set):
 *   - `agent:tool_started` / `agent:tool_executed` / `agent:tool_denied`
 *     route to the matching delegate row via `subTaskIdIndex`.
 *   - `agent:text_delta` / `agent:thinking` / `llm:stream_delta` route
 *     scoped output into `stepOutputs[stepId]`.
 *   - `agent:turn_complete` accumulates child token totals into
 *     `turn.tokensConsumed` — that's the right behaviour (the user
 *     sees total tokens for the parent + every delegate).
 *   - `audit:entry` is folded by the projection layer, not the reducer.
 *   - `phase:timing` is harmless to accumulate.
 */
const PARENT_ONLY_LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  // Task lifecycle — would rebind turn.taskId / turn.status / turn.finalContent
  'task:start',
  'task:complete',
  'task:timeout',
  'task:cancelled',
  'task:escalate',
  'task:retry_requested',
  'task:stage_update',
  // Worker — parent's engine identity / failure
  'worker:dispatch',
  'worker:selected',
  'worker:complete',
  'worker:error',
  // Agent — parent's routing / synthesis / contract
  'agent:routed',
  'agent:synthesized',
  'agent:synthesis-failed',
  'agent:capability-research',
  'agent:capability-research-failed',
  'agent:contract_violation',
  'agent:clarification_requested',
  // Workflow — parent's plan / gates / decision
  'workflow:plan_created',
  'workflow:plan_ready',
  'workflow:plan_approved',
  'workflow:plan_rejected',
  'workflow:winner_determined',
  'workflow:subtasks_planned',
  'workflow:human_input_needed',
  'workflow:human_input_provided',
  'workflow:partial_failure_decision_needed',
  'workflow:partial_failure_decision_provided',
  'workflow:decision_recorded',
  'workflow:todo_created',
  'workflow:todo_updated',
  // Oracle / critic / shadow / skill — parent-scoped verdicts
  'oracle:verdict',
  'critic:verdict',
  'shadow:complete',
  'skill:match',
  'skill:miss',
  // LLM provider notices — parent's engine context
  'llm:provider_quota_exhausted',
  'llm:provider_cooldown_started',
  'llm:provider_fallback_selected',
  'llm:provider_unavailable',
]);

/** Pure reducer — exported for unit tests. */
export function reduceTurn(turn: StreamingTurn, event: SSEEvent): StreamingTurn {
  const p = event.payload ?? {};
  // Descendant-scope guard for parent-only lifecycle events. A child
  // sub-agent's `task:complete` would otherwise overwrite turn state and
  // break tool routing for every subsequent delegate (concrete repro:
  // historical replay shows "Reasoning-only delegate — final answer
  // captured…" on every sub-agent row even though tool calls actually
  // ran). Live SSE never triggers this branch — the bus only delivers
  // events for the active task, so `event.scope` is undefined and
  // pass-through is the default. See PARENT_ONLY_LIFECYCLE_EVENTS for
  // the curated set; events with their own per-event eventTaskId guards
  // (e.g. `agent:plan_update`, `workflow:delegate_*`) are intentionally
  // not here — they already short-circuit on mismatch.
  if (event.scope === 'descendant' && PARENT_ONLY_LIFECYCLE_EVENTS.has(event.event)) {
    return turn;
  }
  // External Coding CLI events: delegate to a self-contained substate
  // reducer. Keeps the main switch readable as the coding-cli surface
  // grows. `codingCliSessions` is the only field touched.
  if (isCodingCliEvent(event.event)) {
    const next = reduceCodingCliSessions(turn.codingCliSessions, event);
    if (next === turn.codingCliSessions) return turn;
    return { ...turn, codingCliSessions: next };
  }
  switch (event.event) {
    case 'task:start': {
      const input = (p.input as Record<string, unknown> | undefined) ?? {};
      const routing = (p.routing as Record<string, unknown> | undefined) ?? {};
      const id = (input.id as string) ?? turn.taskId;
      // Sub-task isolation: when a delegate-sub-agent's core-loop emits
      // its own `task:start` with the SUB-task's id, ignore it for the
      // parent turn — same-id upsert (preliminary→real model) still
      // works because we compare to the existing turn.taskId, but a
      // different id would otherwise overwrite turn.taskId and silently
      // re-bind every subsequent guarded reducer to the sub-task,
      // dropping legitimate parent events. The sub-task's events still
      // route to it via subTaskId-based stream routing below.
      if (turn.taskId && id && turn.taskId !== id) {
        return turn;
      }
      const level = typeof routing.level === 'number' ? (routing.level as number) : undefined;
      const model = typeof routing.model === 'string' ? (routing.model as string) : undefined;
      // Upsert: backend may emit `task:start` twice — once preliminary at
      // executeTaskCore entry (model=null/'pending', level=0), then again
      // from the full-pipeline branch with the real routing decision. Take
      // the later real model over the earlier sentinel. Multi-agent parents
      // never get a refined task:start (no single engine on the parent), so
      // we MUST drop the placeholder rather than fall back to it — otherwise
      // 'pending' surfaces as a literal engine label in StatsRow.
      const isPlaceholderModel = model === 'pending' || model === 'unknown';
      const nextEngineId =
        !isPlaceholderModel && model ? model : turn.engineId;
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
      // Paired with `agent:tool_executed` via toolCallId. Tool→step pinning
      // prefers `subTaskIdIndex` (deterministic for delegated sub-agents)
      // and falls back to `currentRunningStepId` for in-process workflow
      // steps that don't carry a sub-task taskId.
      const toolName = toolNameFromPayload(p);
      const toolId = toolCallIdFromPayload(p, `${toolName}-${turn.toolCalls.length}`);
      // Dedupe: if an entry with this id already exists, leave it alone.
      if (turn.toolCalls.some((t) => t.id === toolId)) return turn;
      const args = (p.args as unknown) ?? (p.input as unknown) ?? undefined;
      const planStepId = resolveStepId(turn, p);
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
      // No matching tool_started — synthesize the entry. Same step
      // resolution as the started branch: prefer sub-task mapping for
      // delegated agents.
      const planStepId = resolveStepId(turn, p);
      const synthesized: StreamingTurn = {
        ...turn,
        toolCalls: [
          ...turn.toolCalls,
          {
            id: toolId,
            name: toolName,
            args,
            status,
            result,
            durationMs,
            at: event.ts,
            planStepId,
          },
        ],
      };
      return attachToolToStep(synthesized, toolId, planStepId);
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
      // Sub-task scope guard: when a delegate-sub-agent itself runs an
      // agentic-workflow (e.g. its description matches the
      // creative-deliverable pre-rule and it spawns its own planner), the
      // sub-task emits its own `agent:plan_update` with its OWN steps
      // (step1, step2 of the sub-workflow) for the same sessionId. Without
      // this guard, the sub-task's snapshot would merge into the parent's
      // `turn.planSteps` and overwrite the parent's plan in the chat UI —
      // the user would see the sub-workflow's checklist replace the
      // intended multi-agent plan. Reject events whose taskId does not
      // match the active turn's taskId. Pre-task-id events (taskId
      // missing) still pass through for backward compat.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
        return turn;
      }
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
        const incomingStatus: PlanStep['status'] = status ?? prev?.status ?? 'pending';
        // Status monotonicity: never regress a previously-terminal step
        // (`done | failed | skipped`) back to a non-terminal one
        // (`pending | running`). The backend can emit a stale
        // `agent:plan_update` snapshot AFTER `task:complete` (or after
        // `workflow:step_complete`) whose payload still carries
        // `status: 'pending'` for a synthesizer step that was captured
        // before it settled. Trusting the incoming status verbatim
        // unwinds `task:complete`'s sweep and leaves the bubble
        // incoherent — the user sees a Done task with a still-spinning
        // synthesizer row (concrete repro: session
        // d4aa26fa-73f1-4ad5-8b16-8727c15ee421, step 6 `-42854ms`).
        // Once a step lands in a terminal state we treat that as
        // authoritative; later snapshots can still update timings,
        // outputPreview, and metadata, but not the lifecycle phase.
        const nextStatus: PlanStep['status'] =
          prev &&
          TERMINAL_STEP_STATUSES.has(prev.status) &&
          !TERMINAL_STEP_STATUSES.has(incomingStatus)
            ? prev.status
            : incomingStatus;
        let startedAt =
          prev?.startedAt ??
          (nextStatus === 'running' ? event.ts || Date.now() : undefined);
        let finishedAt =
          prev?.finishedAt ??
          (TERMINAL_STEP_STATUSES.has(nextStatus) ? event.ts || Date.now() : undefined);
        // Timestamp invariant — `startedAt <= finishedAt` always.
        //
        // Two failure modes converge here:
        //   1. A step reached terminal status without ever having a
        //      known `startedAt` (e.g. `workflow:step_complete`
        //      bootstrapped the step, no prior `step_start` /
        //      plan_update set startedAt). Without a peg, the duration
        //      formula `finishedAt - startedAt` evaluates to `NaN`.
        //   2. A late plan_update or out-of-order `step_start` lands a
        //      `startedAt` that is LATER than an already-recorded
        //      `finishedAt`. "First-seen wins" preserves the older
        //      finishedAt; the new startedAt creeps past it and the
        //      duration becomes negative (this is the literal
        //      `-42854ms` the user saw in the screenshot).
        //
        // Both are corrected by pegging startedAt to finishedAt — the
        // honest signal is "we observed the settle moment, can't claim
        // a separate start", duration renders as `0`. The terminal
        // finishedAt remains authoritative.
        if (finishedAt !== undefined && startedAt === undefined) {
          startedAt = finishedAt;
        }
        if (
          startedAt !== undefined &&
          finishedAt !== undefined &&
          startedAt > finishedAt
        ) {
          startedAt = finishedAt;
        }
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
      const subTaskIdIndex: Record<string, string> = {};
      for (const step of steps) {
        if (step.subTaskId) subTaskIdIndex[step.subTaskId] = step.id;
      }
      return { ...turn, planSteps: steps, subTaskIdIndex };
    }
    case 'workflow:delegate_dispatched': {
      // Multi-agent UI: pin the resolved agent persona to the matching
      // step BEFORE the sub-task's `task:start` arrives. Plan checklist
      // and agent-timeline card both read PlanStep.agentId, so this lets
      // the UI surface "researcher started" the moment the executor
      // dispatches the delegate, not several seconds later.
      // Sub-task isolation: only accept events for the active turn's
      // task (the parent). A nested workflow inside a sub-task would
      // emit its own `delegate_dispatched` events whose stepIds would
      // collide with the parent plan's by accident.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
        return turn;
      }
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
      const updatedIndex = subTaskId
        ? { ...turn.subTaskIdIndex, [subTaskId]: stepId }
        : turn.subTaskIdIndex;
      return { ...turn, planSteps: updated, subTaskIdIndex: updatedIndex };
    }
    case 'workflow:delegate_completed': {
      // Multi-agent UI: capture the per-agent output preview so the
      // agent-timeline card can show what each sub-agent answered before
      // the parent's synthesizer aggregates them. Status update is
      // defensive — `agent:plan_update` will also flip the step but we
      // do not want a brief window where the preview is visible but the
      // step still reads as `running`.
      // Sub-task isolation: same guard as delegate_dispatched above.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
        return turn;
      }
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
      // Also feed the per-agent preview into `stepOutputs[stepId]` so the
      // existing PlanSurface step expansion renders it natively. Without
      // this the `delegate-sub-agent` rows expand to nothing — the
      // sub-task's LLM stream goes to its own taskId, not to the parent's
      // stepOutputs map. Carrying the preview on plan_step keeps the chip
      // at-a-glance, while stepOutputs unlocks the click-to-expand UX
      // already wired into the plan checklist (avoids a redundant
      // standalone "sub-agents" card showing the same data twice — see
      // session 43c36d16 user feedback on duplication).
      const nextStepOutputs = outputPreview
        ? { ...turn.stepOutputs, [stepId]: outputPreview }
        : turn.stepOutputs;
      return { ...turn, planSteps: updated, stepOutputs: nextStepOutputs };
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
      const legacyTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      return appendContentDelta(turn, delta, 'legacy', legacyTaskId);
    }
    case 'llm:stream_delta': {
      const kind = p.kind as string | undefined;
      const richTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
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
          return appendContentDelta(turn, delta, 'rich', richTaskId);
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
      // Plan-step sweep on terminal task. Without this, the last step in
      // the plan can stay visually `pending`/`running` after the task is
      // already `completed`, because the backend doesn't always emit a
      // final `workflow:step_complete` (e.g. when the synthesizer absorbs
      // the last step's job, or the executor short-circuits). The user
      // sees a final answer card AND a still-spinning step5 — incoherent.
      //
      // Mapping when uiStatus is 'done':
      //   pending → done (task succeeded, step must have run effectively)
      //   running → done
      //   skipped → unchanged (planner explicitly skipped it)
      //   failed  → unchanged (already terminal)
      //
      // For 'error' / 'input-required' we don't synthesize success: any
      // running step becomes 'failed', any pending step stays pending so
      // the user can tell what got reached vs not.
      const sweepedPlanSteps = (() => {
        if (uiStatus === 'done') {
          return turn.planSteps.map((s) =>
            s.status === 'pending' || s.status === 'running'
              ? { ...s, status: 'done' as const, finishedAt: s.finishedAt ?? event.ts }
              : s,
          );
        }
        if (uiStatus === 'error') {
          return turn.planSteps.map((s) =>
            s.status === 'running'
              ? { ...s, status: 'failed' as const, finishedAt: s.finishedAt ?? event.ts }
              : s,
          );
        }
        return turn.planSteps;
      })();
      return {
        ...turn,
        taskId,
        status: uiStatus,
        finishedAt: event.ts,
        finalContent: isFailureStatus ? turn.finalContent : content,
        thinking,
        resultStatus: status as StreamingTurn['resultStatus'],
        planSteps: sweepedPlanSteps,
        // Terminal — drop any unresolved approval card so the bubble can't
        // show "Approve / Reject" alongside the final answer if the
        // orchestrator races past the gate (e.g. auto-approve timeout).
        pendingApproval: undefined,
        pendingHumanInput: undefined,
        pendingPartialDecision: undefined,
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
        pendingHumanInput: undefined,
        pendingPartialDecision: undefined,
      };
    }
    case 'worker:error': {
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts,
        error: (p.error as string) ?? 'Worker error',
        pendingApproval: undefined,
        pendingHumanInput: undefined,
        pendingPartialDecision: undefined,
      };
    }
    case 'workflow:decision_recorded': {
      // Stage manifest entry point — capture the post-prompt decision
      // BEFORE the approval gate / plan_ready surface fires. Sub-task
      // isolation: ignore decisions from a delegated sub-task whose own
      // workflow runs (their decisions are scoped to the sub-task, not
      // the parent turn we are rendering).
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const decisionRaw = p.decision as Record<string, unknown> | undefined;
      if (!decisionRaw) return turn;
      const decisionKind = decisionRaw.decisionKind as WorkflowDecisionKind | undefined;
      if (!decisionKind) return turn;
      const next: WorkflowDecisionStageView = {
        taskId: typeof decisionRaw.taskId === 'string' ? (decisionRaw.taskId as string) : turn.taskId,
        sessionId: typeof decisionRaw.sessionId === 'string' ? (decisionRaw.sessionId as string) : undefined,
        userPrompt: typeof decisionRaw.userPrompt === 'string' ? (decisionRaw.userPrompt as string) : '',
        decisionKind,
        decisionRationale:
          typeof decisionRaw.decisionRationale === 'string' ? (decisionRaw.decisionRationale as string) : undefined,
        createdAt: typeof decisionRaw.createdAt === 'number' ? (decisionRaw.createdAt as number) : event.ts,
        routingLevel:
          typeof decisionRaw.routingLevel === 'number' ? (decisionRaw.routingLevel as number) : undefined,
        confidence: typeof decisionRaw.confidence === 'number' ? (decisionRaw.confidence as number) : undefined,
      };
      return { ...turn, decisionStage: next };
    }
    case 'workflow:todo_created': {
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const raw = Array.isArray(p.todoList) ? (p.todoList as unknown[]) : [];
      const todoList: WorkflowTodoItemView[] = [];
      for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : undefined;
        const title = typeof o.title === 'string' ? o.title : undefined;
        const ownerType = o.ownerType as WorkflowTodoOwnerType | undefined;
        const status = (o.status as WorkflowTodoStatus | undefined) ?? 'pending';
        if (!id || !title || !ownerType) continue;
        todoList.push({
          id,
          title,
          description: typeof o.description === 'string' ? (o.description as string) : undefined,
          ownerType,
          ownerId: typeof o.ownerId === 'string' ? (o.ownerId as string) : undefined,
          status,
          dependsOn: Array.isArray(o.dependsOn)
            ? (o.dependsOn as unknown[]).filter((d): d is string => typeof d === 'string')
            : [],
          sourceStepId: typeof o.sourceStepId === 'string' ? (o.sourceStepId as string) : undefined,
          expectedOutput: typeof o.expectedOutput === 'string' ? (o.expectedOutput as string) : undefined,
          failureReason: typeof o.failureReason === 'string' ? (o.failureReason as string) : undefined,
        });
      }
      const groupMode = isMultiAgentGroupMode(p.groupMode) ? (p.groupMode as MultiAgentGroupMode) : turn.multiAgentGroupMode;
      return {
        ...turn,
        todoList,
        ...(groupMode ? { multiAgentGroupMode: groupMode } : {}),
      };
    }
    case 'workflow:todo_updated': {
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const todoId = typeof p.todoId === 'string' ? (p.todoId as string) : undefined;
      const status = p.status as WorkflowTodoStatus | undefined;
      if (!todoId || !status) return turn;
      const failureReason = typeof p.failureReason === 'string' ? (p.failureReason as string) : undefined;
      const todoList = turn.todoList.map((t) =>
        t.id === todoId ? { ...t, status, ...(failureReason ? { failureReason } : {}) } : t,
      );
      return { ...turn, todoList };
    }
    case 'workflow:subtasks_planned': {
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const raw = Array.isArray(p.subtasks) ? (p.subtasks as unknown[]) : [];
      const subtasks: MultiAgentSubtaskView[] = [];
      for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        const subtaskId = typeof o.subtaskId === 'string' ? o.subtaskId : undefined;
        const stepId = typeof o.stepId === 'string' ? o.stepId : undefined;
        const fallbackLabel = typeof o.fallbackLabel === 'string' ? o.fallbackLabel : undefined;
        if (!subtaskId || !stepId || !fallbackLabel) continue;
        const status = (o.status as MultiAgentSubtaskStatus | undefined) ?? 'planned';
        subtasks.push({
          subtaskId,
          parentTaskId: typeof o.parentTaskId === 'string' ? (o.parentTaskId as string) : turn.taskId,
          sessionId: typeof o.sessionId === 'string' ? (o.sessionId as string) : undefined,
          stepId,
          agentId: typeof o.agentId === 'string' ? (o.agentId as string) : undefined,
          agentName: typeof o.agentName === 'string' ? (o.agentName as string) : undefined,
          agentRole: typeof o.agentRole === 'string' ? (o.agentRole as string) : undefined,
          capabilityTags: Array.isArray(o.capabilityTags)
            ? (o.capabilityTags as unknown[]).filter((t): t is string => typeof t === 'string')
            : undefined,
          fallbackLabel,
          title: typeof o.title === 'string' ? (o.title as string) : stepId,
          objective: typeof o.objective === 'string' ? (o.objective as string) : '',
          prompt: typeof o.prompt === 'string' ? (o.prompt as string) : '',
          inputRefs: Array.isArray(o.inputRefs)
            ? (o.inputRefs as unknown[]).filter((s): s is string => typeof s === 'string')
            : [],
          expectedOutput: typeof o.expectedOutput === 'string' ? (o.expectedOutput as string) : undefined,
          status,
          startedAt: typeof o.startedAt === 'number' ? (o.startedAt as number) : undefined,
          completedAt: typeof o.completedAt === 'number' ? (o.completedAt as number) : undefined,
          outputPreview: typeof o.outputPreview === 'string' ? (o.outputPreview as string) : undefined,
          errorKind: o.errorKind as MultiAgentSubtaskErrorKind | undefined,
          errorMessage: typeof o.errorMessage === 'string' ? (o.errorMessage as string) : undefined,
          partialOutputAvailable:
            typeof o.partialOutputAvailable === 'boolean' ? (o.partialOutputAvailable as boolean) : undefined,
          fallbackAttempted:
            typeof o.fallbackAttempted === 'boolean' ? (o.fallbackAttempted as boolean) : undefined,
        });
      }
      const groupMode = isMultiAgentGroupMode(p.groupMode) ? (p.groupMode as MultiAgentGroupMode) : turn.multiAgentGroupMode;
      return {
        ...turn,
        multiAgentSubtasks: subtasks,
        ...(groupMode ? { multiAgentGroupMode: groupMode } : {}),
      };
    }
    case 'workflow:subtask_updated': {
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const subtaskId = typeof p.subtaskId === 'string' ? (p.subtaskId as string) : undefined;
      const status = p.status as MultiAgentSubtaskStatus | undefined;
      if (!subtaskId || !status) return turn;
      const multiAgentSubtasks = turn.multiAgentSubtasks.map((s) => {
        if (s.subtaskId !== subtaskId) return s;
        // Status monotonicity: once a subtask has settled into a terminal
        // phase (`done | failed | timeout | skipped`), a late
        // `subtask_updated` whose payload still says `running` cannot
        // unwind it. Mirrors the per-step guard in `agent:plan_update`.
        // Concrete repro: parent task already emitted `task:complete` (the
        // turn header reads "Done"), then a sub-task whose own watchdog
        // belatedly fires arrives as `subtask_updated{status:'running'}`
        // — without this guard the agent card flips back to a spinner
        // even though the bubble is terminal. Other fields (agentId,
        // outputPreview, timings) still patch through; only the lifecycle
        // phase is held.
        const isTerminalPrev = TERMINAL_SUBTASK_STATUSES.has(s.status);
        const isTerminalIncoming = TERMINAL_SUBTASK_STATUSES.has(status);
        const nextStatus: MultiAgentSubtaskStatus =
          isTerminalPrev && !isTerminalIncoming ? s.status : status;
        const patch: Partial<MultiAgentSubtaskView> = {
          status: nextStatus,
          ...(typeof p.agentId === 'string' ? { agentId: p.agentId as string } : {}),
          ...(typeof p.startedAt === 'number' ? { startedAt: p.startedAt as number } : {}),
          ...(typeof p.completedAt === 'number' ? { completedAt: p.completedAt as number } : {}),
          ...(typeof p.outputPreview === 'string' ? { outputPreview: p.outputPreview as string } : {}),
          ...(typeof p.errorKind === 'string'
            ? { errorKind: p.errorKind as MultiAgentSubtaskErrorKind }
            : {}),
          ...(typeof p.errorMessage === 'string' ? { errorMessage: p.errorMessage as string } : {}),
          ...(typeof p.partialOutputAvailable === 'boolean'
            ? { partialOutputAvailable: p.partialOutputAvailable as boolean }
            : {}),
          ...(typeof p.fallbackAttempted === 'boolean'
            ? { fallbackAttempted: p.fallbackAttempted as boolean }
            : {}),
        };
        return { ...s, ...patch };
      });
      return { ...turn, multiAgentSubtasks };
    }
    case 'workflow:collaboration_round': {
      // Per-(stepId, round) telemetry. Idempotent on (stepId, round) so
      // a re-emit (replay tail or backend retry) updates the same row
      // instead of duplicating it.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const stepId = typeof p.stepId === 'string' ? (p.stepId as string) : undefined;
      const round = typeof p.round === 'number' ? (p.round as number) : undefined;
      if (!stepId || round === undefined) return turn;
      const idx = turn.collaborationRounds.findIndex(
        (r) => r.stepId === stepId && r.round === round,
      );
      const next: CollaborationRoundView = {
        stepId,
        round,
        status:
          typeof p.status === 'string'
            ? (p.status as 'completed' | 'failed' | string)
            : (turn.collaborationRounds[idx]?.status ?? 'unknown'),
        ...(typeof p.agentId === 'string'
          ? { agentId: p.agentId as string }
          : turn.collaborationRounds[idx]?.agentId
            ? { agentId: turn.collaborationRounds[idx]!.agentId }
            : {}),
        ...(typeof p.outputPreview === 'string'
          ? { outputPreview: p.outputPreview as string }
          : turn.collaborationRounds[idx]?.outputPreview
            ? { outputPreview: turn.collaborationRounds[idx]!.outputPreview }
            : {}),
        ...(typeof p.tokensConsumed === 'number'
          ? { tokensConsumed: p.tokensConsumed as number }
          : turn.collaborationRounds[idx]?.tokensConsumed !== undefined
            ? { tokensConsumed: turn.collaborationRounds[idx]!.tokensConsumed }
            : {}),
        ...(typeof p.startedAt === 'number'
          ? { startedAt: p.startedAt as number }
          : turn.collaborationRounds[idx]?.startedAt !== undefined
            ? { startedAt: turn.collaborationRounds[idx]!.startedAt }
            : {}),
        ...(typeof p.completedAt === 'number'
          ? { completedAt: p.completedAt as number }
          : turn.collaborationRounds[idx]?.completedAt !== undefined
            ? { completedAt: turn.collaborationRounds[idx]!.completedAt }
            : {}),
      };
      const collaborationRounds =
        idx >= 0
          ? turn.collaborationRounds.map((r, i) => (i === idx ? next : r))
          : [...turn.collaborationRounds, next];
      return { ...turn, collaborationRounds };
    }
    case 'workflow:winner_determined': {
      // COMPETITION-mode synthesizer's structured verdict. Backend emits this
      // ONLY after the JSON block validated and `winnerAgentId` was confirmed
      // to be in the participating delegate set. We trust the backend gate
      // and just project the fields onto the turn — never infer from order.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      // `winnerAgentId === null` is a deliberate "no clear winner" verdict —
      // record it explicitly so UI can render a tie chip rather than fall
      // back to "no event = no winner declared" semantics.
      const winnerAgentId =
        typeof p.winnerAgentId === 'string'
          ? (p.winnerAgentId as string)
          : p.winnerAgentId === null
            ? null
            : undefined;
      const winnerReasoning =
        typeof p.reasoning === 'string' ? (p.reasoning as string) : undefined;
      const winnerScores =
        p.scores && typeof p.scores === 'object'
          ? Object.fromEntries(
              Object.entries(p.scores as Record<string, unknown>).filter(
                (entry): entry is [string, number] => typeof entry[1] === 'number',
              ),
            )
          : undefined;
      return {
        ...turn,
        ...(winnerAgentId !== undefined ? { winnerAgentId } : {}),
        ...(winnerReasoning !== undefined ? { winnerReasoning } : {}),
        ...(winnerScores !== undefined ? { winnerScores } : {}),
      };
    }
    case 'workflow:plan_ready': {
      // Phase E: workflow executor emits this both for the awaiting-approval
      // gate (`awaitingApproval=true`) AND immediately after auto-approving
      // a non-gated plan (`awaitingApproval=false`). Both cases need to
      // populate `turn.planSteps` so the chat surfaces (PlanSurface,
      // AgentTimelineCard) render the workflow plan — the approval gate
      // adds `pendingApproval` on top.
      // Sub-task isolation: a delegate-sub-agent that runs its own
      // workflow could emit its own `plan_ready` event. The backend
      // approval gate already bypasses for sub-tasks (`!input.parentTaskId`)
      // so awaiting=true should never arrive from a sub-task — but if it
      // does (e.g. legacy backend), still ignore it. The user's pending
      // approval surface only knows about the parent task.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) {
        return turn;
      }
      const taskId = (p.taskId as string | undefined) ?? turn.taskId;
      const goal = (p.goal as string | undefined) ?? '';
      const rawSteps = Array.isArray(p.steps) ? (p.steps as unknown[]) : [];
      const steps: PendingApproval['steps'] = [];
      // Parsed plan view used to seed `turn.planSteps`. Carries `agentId`
      // (when supplied) so the chat surfaces can pin the persona before
      // delegate_dispatched fires.
      const parsedSteps: Array<{
        id: string;
        description: string;
        strategy: string;
        dependencies: string[];
        agentId?: string;
      }> = [];
      for (const s of rawSteps) {
        if (!s || typeof s !== 'object') continue;
        const o = s as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : undefined;
        const description = typeof o.description === 'string' ? o.description : undefined;
        const strategy = typeof o.strategy === 'string' ? o.strategy : 'auto';
        const agentId = typeof o.agentId === 'string' ? o.agentId : undefined;
        if (!id || !description) continue;
        const deps = Array.isArray(o.dependencies)
          ? (o.dependencies as unknown[]).filter((d): d is string => typeof d === 'string')
          : [];
        steps.push({ id, description, strategy, dependencies: deps });
        parsedSteps.push({ id, description, strategy, dependencies: deps, ...(agentId ? { agentId } : {}) });
      }
      // Populate / merge `turn.planSteps`. Preserve any per-step state
      // (toolCallIds, timings, terminal status) already collected from
      // upstream events (delegate_dispatched / step_start / agent:plan_update).
      // PlanStep uses `label` while the workflow event uses `description`
      // — map across the boundary.
      const nextPlanSteps: PlanStep[] =
        parsedSteps.length > 0
          ? parsedSteps.map((s) => {
              const prev = turn.planSteps.find((ps) => ps.id === s.id);
              return {
                id: s.id,
                label: s.description,
                status: prev?.status ?? 'pending',
                toolCallIds: prev?.toolCallIds ?? [],
                ...(prev?.startedAt !== undefined ? { startedAt: prev.startedAt } : {}),
                ...(prev?.finishedAt !== undefined ? { finishedAt: prev.finishedAt } : {}),
                ...(s.strategy ? { strategy: s.strategy } : {}),
                ...(s.agentId
                  ? { agentId: s.agentId }
                  : prev?.agentId
                    ? { agentId: prev.agentId }
                    : {}),
                ...(prev?.outputPreview ? { outputPreview: prev.outputPreview } : {}),
                ...(prev?.subTaskId ? { subTaskId: prev.subTaskId } : {}),
              };
            })
          : turn.planSteps;
      const subTaskIdIndex: Record<string, string> = { ...turn.subTaskIdIndex };
      for (const step of nextPlanSteps) {
        if (step.subTaskId) subTaskIdIndex[step.subTaskId] = step.id;
      }
      const awaiting = p.awaitingApproval === true;
      if (!awaiting) {
        // Auto-approved plan — surface the plan in the chat without
        // pausing the turn. The executor will dispatch steps next; the
        // delegate_dispatched / step_start handlers will flip individual
        // step status from `pending` → `running` against this seed.
        return { ...turn, taskId, planSteps: nextPlanSteps, subTaskIdIndex };
      }
      const approvalMode =
        p.approvalMode === 'human-required' || p.approvalMode === 'agent-discretion'
          ? (p.approvalMode as 'agent-discretion' | 'human-required')
          : undefined;
      const timeoutMs = typeof p.timeoutMs === 'number' ? (p.timeoutMs as number) : undefined;
      const autoDecisionAllowed =
        typeof p.autoDecisionAllowed === 'boolean'
          ? (p.autoDecisionAllowed as boolean)
          : undefined;
      return {
        ...turn,
        taskId,
        status: 'awaiting-approval',
        planSteps: nextPlanSteps,
        subTaskIdIndex,
        pendingApproval: {
          taskId,
          goal,
          steps,
          at: event.ts || Date.now(),
          ...(approvalMode ? { approvalMode } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(autoDecisionAllowed !== undefined ? { autoDecisionAllowed } : {}),
        },
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
        pendingHumanInput: undefined,
        pendingPartialDecision: undefined,
        error: reason,
      };
    }
    case 'workflow:human_input_needed': {
      // Workflow paused on a `human-input` step. Distinct from plan-level
      // approval: the user must SUPPLY a value (e.g. the topic the agents
      // will compete on), not just approve/reject.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const stepId = typeof p.stepId === 'string' ? (p.stepId as string) : undefined;
      const question = typeof p.question === 'string' ? (p.question as string) : '';
      if (!stepId) return turn;
      const taskId = eventTaskId ?? turn.taskId;
      return {
        ...turn,
        taskId,
        status: 'awaiting-human-input',
        pendingHumanInput: {
          taskId,
          stepId,
          question,
          at: event.ts || Date.now(),
        },
      };
    }
    case 'workflow:human_input_provided': {
      // Backend received the answer; executor unpaused. Tear down the
      // input card and return to running state so step_complete /
      // plan_update events drive the rest of the UI.
      if (!turn.pendingHumanInput) return turn;
      return {
        ...turn,
        status: 'running',
        pendingHumanInput: undefined,
      };
    }
    case 'workflow:partial_failure_decision_needed': {
      // Sub-task isolation: only accept events for the active turn's
      // task — a delegated sub-agent that runs its own workflow could
      // theoretically emit one, but the backend already bypasses the
      // gate for sub-tasks (parentTaskId set). Defensive guard either way.
      const eventTaskId = typeof p.taskId === 'string' ? (p.taskId as string) : undefined;
      if (eventTaskId && turn.taskId && eventTaskId !== turn.taskId) return turn;
      const taskId = eventTaskId ?? turn.taskId;
      const failedStepIds = Array.isArray(p.failedStepIds)
        ? (p.failedStepIds as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      const skippedStepIds = Array.isArray(p.skippedStepIds)
        ? (p.skippedStepIds as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      const completedStepIds = Array.isArray(p.completedStepIds)
        ? (p.completedStepIds as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      const summary = typeof p.summary === 'string' ? (p.summary as string) : '';
      const partialPreview =
        typeof p.partialPreview === 'string' ? (p.partialPreview as string) : undefined;
      const timeoutMs = typeof p.timeoutMs === 'number' ? (p.timeoutMs as number) : 180_000;
      return {
        ...turn,
        // Reuse 'awaiting-human-input' to signal "user input expected" —
        // the bubble distinguishes the surface by which `pending*` field
        // is set, not by the status enum (which would otherwise need a
        // new variant + plumbing through every consumer).
        status: 'awaiting-human-input',
        taskId,
        pendingPartialDecision: {
          taskId,
          failedStepIds,
          skippedStepIds,
          completedStepIds,
          summary,
          partialPreview,
          timeoutMs,
          at: event.ts || Date.now(),
        },
      };
    }
    case 'workflow:partial_failure_decision_provided': {
      // Decision recorded — tear down the card. Final status (partial vs
      // failed) arrives via the subsequent task:complete event so we just
      // unpause back to running here.
      if (!turn.pendingPartialDecision) return turn;
      return { ...turn, status: 'running', pendingPartialDecision: undefined };
    }
    case 'workflow:step_start': {
      // Per-step live signal complementing `agent:plan_update`. The plan
      // checklist may already be `running` from the most recent plan_update,
      // but this event fires inside the step so it gives us a more precise
      // `startedAt` and lets us flip status before the next plan_update
      // snapshot (which the executor emits after dispatch returns).
      //
      // Defense-in-depth for replay: when `agent:plan_update` events are
      // missing from the persisted log (manifest drift, recorder dropouts),
      // create the step from the start event so the historical card still
      // renders a plan checklist instead of an empty card. The payload
      // carries enough fields (stepId, strategy, description) to bootstrap
      // a PlanStep without the snapshot.
      const stepId = p.stepId as string | undefined;
      if (!stepId) return turn;
      const startedAt = event.ts || Date.now();
      const existing = turn.planSteps.find((s) => s.id === stepId);
      if (!existing) {
        const description = typeof p.description === 'string' ? (p.description as string) : stepId;
        const strategy = typeof p.strategy === 'string' ? (p.strategy as string) : undefined;
        const newStep: PlanStep = {
          id: stepId,
          label: description,
          status: 'running',
          toolCallIds: [],
          startedAt,
          ...(strategy ? { strategy } : {}),
        };
        return { ...turn, planSteps: [...turn.planSteps, newStep] };
      }
      const planSteps = turn.planSteps.map((s) =>
        s.id === stepId
          ? { ...s, status: 'running' as const, startedAt: s.startedAt ?? startedAt }
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
      const finishedAt = event.ts || Date.now();
      const existing = turn.planSteps.find((s) => s.id === stepId);
      if (!existing) {
        // Same defense as `workflow:step_start` — bootstrap the step from
        // the complete event when the plan_update snapshot was missed.
        // Peg `startedAt` to `finishedAt`: we never observed a separate
        // start moment, but leaving startedAt undefined would render
        // duration as `NaN` in the plan checklist; same value for both
        // collapses to a non-negative `0ms` duration which is the honest
        // representation of "we only know the settle moment".
        const strategy = typeof p.strategy === 'string' ? (p.strategy as string) : undefined;
        const newStep: PlanStep = {
          id: stepId,
          label: stepId,
          status: mapped,
          toolCallIds: [],
          startedAt: finishedAt,
          finishedAt,
          ...(strategy ? { strategy } : {}),
        };
        return { ...turn, planSteps: [...turn.planSteps, newStep] };
      }
      const planSteps = turn.planSteps.map((s) => {
        if (s.id !== stepId) return s;
        // Timestamp invariant — if a prior plan_update set a
        // `startedAt` that is now LATER than the recorded finishedAt
        // (out-of-order events from the persisted log or batched bus),
        // pull it back so the duration stays non-negative. Same
        // treatment for the bootstrap-without-start case where the
        // running plan_update never arrived but a later snapshot
        // backfilled startedAt past the terminal moment.
        const safeStartedAt =
          s.startedAt !== undefined && s.startedAt <= finishedAt
            ? s.startedAt
            : finishedAt;
        return { ...s, status: mapped, finishedAt, startedAt: safeStartedAt };
      });
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
