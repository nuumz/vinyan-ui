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

export type StreamingStatus = 'idle' | 'running' | 'input-required' | 'done' | 'error';

export interface StreamingTurn {
  taskId: string;
  status: StreamingStatus;
  startedAt: number;
  finishedAt?: number;
  currentPhase?: PhaseName;
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
  error?: string;
}

export interface PlanStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
}

interface StreamingTurnState {
  /** Keyed by sessionId. Only one active turn per session at a time. */
  bySession: Record<string, StreamingTurn | undefined>;
  /** Called on send() — starts a fresh turn for this session. */
  start: (sessionId: string) => void;
  /** Called on each SSE event. No-op if we don't have an active turn yet. */
  ingest: (sessionId: string, event: SSEEvent) => void;
  /** Called when the send mutation ends (success or error) — clears the bubble. */
  clear: (sessionId: string) => void;
}

function emptyTurn(): StreamingTurn {
  return {
    taskId: '',
    status: 'running',
    startedAt: Date.now(),
    phaseTimings: [],
    toolCalls: [],
    oracleVerdicts: [],
    escalations: [],
    criticVerdicts: [],
    clarifications: [],
    finalContent: '',
    reasoning: [],
    planSteps: [],
  };
}

export const useStreamingTurnStore = create<StreamingTurnState>((set) => ({
  bySession: {},
  start: (sessionId) =>
    set((s) => ({
      bySession: { ...s.bySession, [sessionId]: emptyTurn() },
    })),
  clear: (sessionId) =>
    set((s) => {
      const { [sessionId]: _drop, ...rest } = s.bySession;
      return { bySession: rest };
    }),
  ingest: (sessionId, event) =>
    set((s) => {
      const prev = s.bySession[sessionId];
      if (!prev) return s;
      const next = reduceTurn(prev, event);
      if (next === prev) return s;
      return { bySession: { ...s.bySession, [sessionId]: next } };
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
      return {
        ...turn,
        taskId: id,
        startedAt: event.ts || turn.startedAt,
        routingLevel: level ?? turn.routingLevel,
        engineId: turn.engineId ?? model,
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
    case 'agent:tool_started': {
      // Phase 2 UX: show a "running" tool card before execution completes.
      // Paired with `agent:tool_executed` via toolCallId.
      const toolName = (p.toolName as string) ?? (p.name as string) ?? 'tool';
      const toolId =
        (p.toolCallId as string) ?? (p.id as string) ?? `${toolName}-${turn.toolCalls.length}`;
      // Dedupe: if an entry with this id already exists, leave it alone.
      if (turn.toolCalls.some((t) => t.id === toolId)) return turn;
      const args = (p.args as unknown) ?? (p.input as unknown) ?? undefined;
      return {
        ...turn,
        toolCalls: [
          ...turn.toolCalls,
          { id: toolId, name: toolName, args, status: 'running', at: event.ts },
        ],
      };
    }
    case 'agent:tool_executed': {
      const toolName = (p.toolName as string) ?? (p.name as string) ?? 'tool';
      const toolId =
        (p.toolCallId as string) ?? (p.id as string) ?? `${toolName}-${turn.toolCalls.length}`;
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
        steps.push({
          id,
          label,
          status: status ?? 'pending',
        });
      }
      if (steps.length === 0) return turn;
      return { ...turn, planSteps: steps };
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
      // Phase 2: token-level streaming. Safe no-op if never emitted.
      const delta = (p.text as string) ?? '';
      if (!delta) return turn;
      return { ...turn, finalContent: turn.finalContent + delta };
    }
    case 'task:complete': {
      const result = (p.result as Record<string, unknown> | undefined) ?? {};
      const content = (result.content as string) ?? turn.finalContent;
      const thinking = (result.thinking as string) ?? turn.thinking;
      const status = (result.status as string) ?? 'success';
      return {
        ...turn,
        status: status === 'input-required' ? 'input-required' : 'done',
        finishedAt: event.ts,
        finalContent: content,
        thinking,
      };
    }
    case 'task:timeout': {
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts,
        error: (p.reason as string) ?? 'Task timed out',
      };
    }
    case 'worker:error': {
      return {
        ...turn,
        status: 'error',
        finishedAt: event.ts,
        error: (p.error as string) ?? 'Worker error',
      };
    }
    default:
      return turn;
  }
}

/** Selector helper — returns the streaming turn for a session or null. */
export function useStreamingTurn(sessionId: string | null): StreamingTurn | null {
  return useStreamingTurnStore((s) => (sessionId ? s.bySession[sessionId] ?? null : null));
}
