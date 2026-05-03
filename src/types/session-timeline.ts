/**
 * Public type contract for the modular Session Timeline surface.
 *
 * These names (`AgentMessage`, `SubAgentTask`, `PlanStep`,
 * `ExecutionMetadata`) are the canonical interfaces consumers of the
 * session UI should import. Internally they re-shape the existing
 * `use-streaming-turn` and `api-client` types so the timeline UI
 * stays decoupled from the streaming reducer.
 *
 * One-way dependency: this module imports from `hooks/` and `lib/`,
 * never the reverse.
 */

import type {
  PlanStep as StreamingPlanStep,
  MultiAgentSubtaskView,
  StreamingStatus,
  ToolCall,
} from '@/hooks/use-streaming-turn';
import type { ConversationEntry } from '@/lib/api-client';

/**
 * Coarse lifecycle for any timeline item — message, sub-agent, plan
 * step, or action card. Maps every backend-specific status into a
 * uniform vocabulary the UI can switch on without re-deriving the
 * mapping per component.
 */
export type ExecutionStatus =
  | 'pending'
  | 'processing'
  | 'running'
  | 'success'
  | 'done'
  | 'failed'
  | 'error'
  | 'skipped'
  | 'unknown';

/** Streaming session lifecycle (alias of the streaming-turn status). */
export type SessionStreamStatus = StreamingStatus;

/**
 * What kind of system/action event this card represents. Drives the
 * header label + icon. Add new kinds here so styling stays centralized.
 */
export type ActionCardKind =
  | 'clarification'
  | 'plan-ready'
  | 'plan-approved'
  | 'plan-rejected'
  | 'decision'
  | 'human-input'
  | 'error'
  | 'info'
  | 'system';

/**
 * The rigid metadata footer the spec calls for. Every populated field
 * surfaces as one pill in `<MetadataPillRow>`; missing fields are
 * silently dropped (no empty pill placeholders).
 */
export interface ExecutionMetadata {
  status: ExecutionStatus;
  /** Agent identity / persona (e.g. `orchestrator`, `developer`). */
  role?: string;
  /** Tool or action name (e.g. `creative-clarification`). */
  tool?: string;
  /** Routing level L0-L3. */
  tier?: number;
  /** Wall-clock latency in milliseconds. */
  latencyMs?: number;
  /** Position in the timeline (`# 0`). */
  seq?: number;
  /** Model used for the turn (e.g. `claude-sonnet-4-6`). */
  modelUsed?: string;
  /** Cumulative tokens for this turn. */
  tokens?: number;
  /** Number of oracle verdicts attached to this turn. */
  oracleVerdicts?: number;
  /** Routing approach (`agentic-workflow`, `conversational-shortcircuit`, ...). */
  approach?: string;
}

/**
 * A single chat message — user input or agent response. Wraps
 * `ConversationEntry` so the UI can consume a stable shape regardless
 * of backend version.
 */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  taskId: string;
  timestamp: number;
  thinking?: string;
  tools?: Array<{ key: string; label: string }>;
  /** Derived from `traceSummary` when present. */
  metadata?: ExecutionMetadata;
  /** Original entry preserved for back-compat with deeper components. */
  raw: ConversationEntry;
}

/**
 * Workflow plan step. The streaming reducer's `PlanStep` is the
 * canonical shape; this re-export lets timeline consumers import it
 * from one place.
 */
export type PlanStep = StreamingPlanStep;

/**
 * Sub-agent task as surfaced in the process replay tree. Re-export
 * of the streaming `MultiAgentSubtaskView` plus convenience fields.
 */
export interface SubAgentTask extends MultiAgentSubtaskView {
  /** `completedAt - startedAt` when both are set. */
  durationMs?: number;
}

/** Tool invocation, re-exported for timeline consumers. */
export type TimelineToolCall = ToolCall;

/**
 * Map a backend `traceSummary.outcome` (free-form string) into the
 * canonical `ExecutionStatus`. Unknown outcomes degrade to `'unknown'`
 * rather than throwing — keeps the UI honest per A2 (first-class
 * uncertainty).
 */
export function statusFromTraceOutcome(outcome: string | undefined): ExecutionStatus {
  switch (outcome) {
    case 'success':
      return 'success';
    case 'failure':
    case 'failed':
    case 'error':
      return 'failed';
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}

/**
 * Shrink a `ConversationEntry` to the AgentMessage public shape.
 * Pure — safe to call inside `useMemo`.
 */
export function toAgentMessage(entry: ConversationEntry, seq?: number): AgentMessage {
  const trace = entry.traceSummary;
  const metadata: ExecutionMetadata | undefined = trace
    ? {
        status: statusFromTraceOutcome(trace.outcome),
        role: trace.workerId,
        tier: trace.routingLevel,
        latencyMs: trace.durationMs,
        seq,
        modelUsed: trace.modelUsed,
        tokens: trace.tokensConsumed,
        oracleVerdicts: trace.oracleVerdictCount,
        approach: trace.approach,
      }
    : seq !== undefined
      ? { status: 'unknown', seq }
      : undefined;
  const tools = Array.isArray(entry.toolsUsed)
    ? entry.toolsUsed.map((t, idx) =>
        typeof t === 'string'
          ? { key: `${idx}:${t}`, label: t }
          : { key: t.id || `${idx}:${t.name}`, label: t.name },
      )
    : undefined;
  return {
    role: entry.role,
    content: entry.content,
    taskId: entry.taskId,
    timestamp: entry.timestamp,
    thinking: entry.thinking,
    tools,
    metadata,
    raw: entry,
  };
}

/**
 * Lift a `MultiAgentSubtaskView` into the public `SubAgentTask` shape
 * by computing `durationMs` from start/complete timestamps.
 */
export function toSubAgentTask(view: MultiAgentSubtaskView): SubAgentTask {
  const durationMs =
    view.startedAt != null && view.completedAt != null
      ? Math.max(0, view.completedAt - view.startedAt)
      : undefined;
  return { ...view, durationMs };
}
