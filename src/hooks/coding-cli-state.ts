/**
 * Coding-CLI substate — folded into StreamingTurn under
 * `turn.codingCliSessions`, keyed by `codingCliSessionId`. The reducer
 * here is pure and exported for tests.
 *
 * Backend events (`coding-cli:*`) all carry `codingCliSessionId` so each
 * lookup is O(1) — the only multi-event reasoning is bookkeeping
 * (matching tool_started → tool_completed by toolName, dedup file paths,
 * cap output buffer).
 */
import type {
  CodingCliCapabilities,
  CodingCliProviderId,
  CodingCliResultClaim,
  CodingCliVerificationOutcome,
  SSEEvent,
} from '@/lib/api-client';

const OUTPUT_BUFFER_MAX = 16 * 1024;
const TOOL_ACTIVITY_MAX = 50;
const FILES_CHANGED_MAX = 200;
const COMMANDS_MAX = 50;

export interface CodingCliToolEntry {
  /** Stable id for the running → completed pair. We use toolName + start ts. */
  id: string;
  toolName: string;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
  errorMessage?: string;
  summary?: string;
  at: number;
}

export interface CodingCliApprovalEntry {
  requestId: string;
  taskId: string;
  scope: 'tool' | 'edit' | 'shell' | 'git' | 'unknown';
  summary: string;
  detail: string;
  policyDecision: 'auto-approve' | 'require-human' | 'reject';
  policyReason: string;
  at: number;
}

export interface CodingCliResolvedApproval {
  requestId: string;
  decision: 'approved' | 'rejected';
  decidedBy: 'policy' | 'human' | 'timeout';
  reason?: string;
  at: number;
}

export interface CodingCliDecisionEntry {
  decision: string;
  rationale: string;
  alternatives: string[];
  at: number;
}

export interface CodingCliCheckpointEntry {
  label: string;
  detail?: string;
  at: number;
}

export interface CodingCliSessionState {
  id: string;
  taskId: string;
  providerId: CodingCliProviderId;
  providerSessionId?: string;
  state: string;
  capabilities: CodingCliCapabilities;
  binaryPath: string;
  binaryVersion: string | null;
  cwd: string;
  pid: number | null;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  lastOutputAt?: number;
  /** FIFO-capped raw stdout for the live output panel. */
  outputBuffer: string;
  toolActivity: CodingCliToolEntry[];
  filesChanged: string[];
  commandsRequested: string[];
  decisions: CodingCliDecisionEntry[];
  checkpoints: CodingCliCheckpointEntry[];
  /** A single pending approval at a time — backend serializes prompts. */
  pendingApproval?: CodingCliApprovalEntry;
  resolvedApprovals: CodingCliResolvedApproval[];
  result?: CodingCliResultClaim;
  verification?: CodingCliVerificationOutcome & { at: number };
  failureReason?: string;
  cancelled?: { by: string; reason?: string; at: number };
  stalled?: { idleMs: number; at: number };
}

export type CodingCliEventName =
  | 'coding-cli:session_created'
  | 'coding-cli:session_started'
  | 'coding-cli:state_changed'
  | 'coding-cli:message_sent'
  | 'coding-cli:output_delta'
  | 'coding-cli:tool_started'
  | 'coding-cli:tool_completed'
  | 'coding-cli:file_changed'
  | 'coding-cli:command_requested'
  | 'coding-cli:command_completed'
  | 'coding-cli:approval_required'
  | 'coding-cli:approval_resolved'
  | 'coding-cli:decision_recorded'
  | 'coding-cli:checkpoint'
  | 'coding-cli:result_reported'
  | 'coding-cli:verification_started'
  | 'coding-cli:verification_completed'
  | 'coding-cli:completed'
  | 'coding-cli:failed'
  | 'coding-cli:stalled'
  | 'coding-cli:cancelled';

export function isCodingCliEvent(name: string): name is CodingCliEventName {
  return name.startsWith('coding-cli:');
}

/**
 * Apply one coding-cli event to a per-session map. Returns the new map.
 * `created` events synthesize an entry; any other event before `created`
 * is dropped silently so a delayed first-event doesn't smear stale state.
 */
export function reduceCodingCliSessions(
  current: Record<string, CodingCliSessionState>,
  event: SSEEvent,
): Record<string, CodingCliSessionState> {
  const p = event.payload ?? {};
  const sessionId = p.codingCliSessionId as string | undefined;
  if (!sessionId) return current;

  const existing = current[sessionId];
  // Bootstrap on session_created. Drop everything else for an unknown id —
  // the backend always emits session_created first; missing it means we're
  // mid-stream replay where the create already arrived in a different page.
  if (event.event === 'coding-cli:session_created') {
    const created: CodingCliSessionState = {
      id: sessionId,
      taskId: (p.taskId as string) ?? '',
      providerId: (p.providerId as CodingCliProviderId) ?? 'claude-code',
      providerSessionId: p.providerSessionId as string | undefined,
      state: (p.state as string) ?? 'created',
      capabilities: (p.capabilities as CodingCliCapabilities) ?? defaultCapabilities(),
      binaryPath: (p.binaryPath as string) ?? '(unknown)',
      binaryVersion: (p.binaryVersion as string | null) ?? null,
      cwd: (p.cwd as string) ?? '',
      pid: null,
      createdAt: event.ts,
      outputBuffer: '',
      toolActivity: [],
      filesChanged: [],
      commandsRequested: [],
      decisions: [],
      checkpoints: [],
      resolvedApprovals: [],
    };
    return { ...current, [sessionId]: created };
  }
  if (!existing) return current;

  const upsert = (patch: Partial<CodingCliSessionState>) => ({
    ...current,
    [sessionId]: { ...existing, ...patch },
  });

  const stateField = p.state as string | undefined;
  switch (event.event) {
    case 'coding-cli:session_started':
      return upsert({
        startedAt: event.ts,
        pid: (p.pid as number | null) ?? existing.pid,
        state: stateField ?? existing.state,
      });
    case 'coding-cli:state_changed':
      return upsert({
        state: stateField ?? existing.state,
      });
    case 'coding-cli:message_sent':
      // No structural change — we surface this in the live "you said"
      // strip below the input. For now, just refresh lastOutputAt so
      // the card knows the session is alive.
      return upsert({ lastOutputAt: event.ts });
    case 'coding-cli:output_delta': {
      const text = (p.text as string) ?? '';
      const next = appendCapped(existing.outputBuffer, text, OUTPUT_BUFFER_MAX);
      return upsert({ outputBuffer: next, lastOutputAt: event.ts });
    }
    case 'coding-cli:tool_started': {
      const toolName = (p.toolName as string) ?? 'tool';
      const summary = (p.summary as string) ?? '';
      const id = `${toolName}-${event.ts}`;
      // Cap toolActivity FIFO.
      const next = [
        ...existing.toolActivity,
        { id, toolName, status: 'running' as const, summary, at: event.ts },
      ];
      return upsert({
        toolActivity: next.length > TOOL_ACTIVITY_MAX ? next.slice(next.length - TOOL_ACTIVITY_MAX) : next,
        lastOutputAt: event.ts,
      });
    }
    case 'coding-cli:tool_completed': {
      const toolName = (p.toolName as string) ?? 'tool';
      // Match the most recent running entry with the same tool name. If
      // none, append a synthesized completed entry so the UI doesn't lose
      // the event entirely.
      const idx = [...existing.toolActivity].reverse().findIndex(
        (t) => t.toolName === toolName && t.status === 'running',
      );
      const ok = (p.ok as boolean | undefined) ?? true;
      const status: CodingCliToolEntry['status'] = ok ? 'success' : 'error';
      const durationMs = (p.durationMs as number) ?? undefined;
      const errorMessage = p.errorMessage as string | undefined;
      const tools = [...existing.toolActivity];
      if (idx >= 0) {
        const realIdx = tools.length - 1 - idx;
        const cur = tools[realIdx]!;
        tools[realIdx] = { ...cur, status, durationMs, errorMessage };
      } else {
        tools.push({
          id: `${toolName}-${event.ts}`,
          toolName,
          status,
          durationMs,
          errorMessage,
          at: event.ts,
        });
      }
      const trimmed = tools.length > TOOL_ACTIVITY_MAX ? tools.slice(tools.length - TOOL_ACTIVITY_MAX) : tools;
      return upsert({ toolActivity: trimmed, lastOutputAt: event.ts });
    }
    case 'coding-cli:file_changed': {
      const path = p.path as string | undefined;
      if (!path) return current;
      if (existing.filesChanged.includes(path)) return current;
      const next = [...existing.filesChanged, path];
      return upsert({
        filesChanged: next.length > FILES_CHANGED_MAX ? next.slice(next.length - FILES_CHANGED_MAX) : next,
      });
    }
    case 'coding-cli:command_requested': {
      const command = (p.command as string) ?? '';
      const next = [...existing.commandsRequested, command];
      return upsert({
        commandsRequested: next.length > COMMANDS_MAX ? next.slice(next.length - COMMANDS_MAX) : next,
      });
    }
    case 'coding-cli:command_completed':
      return upsert({ lastOutputAt: event.ts });
    case 'coding-cli:approval_required': {
      const entry: CodingCliApprovalEntry = {
        requestId: (p.requestId as string) ?? `req-${event.ts}`,
        taskId: (p.taskId as string) ?? existing.taskId,
        scope: (p.scope as CodingCliApprovalEntry['scope']) ?? 'unknown',
        summary: (p.summary as string) ?? '',
        detail: (p.detail as string) ?? '',
        policyDecision:
          (p.policyDecision as CodingCliApprovalEntry['policyDecision']) ?? 'require-human',
        policyReason: (p.policyReason as string) ?? '',
        at: event.ts,
      };
      return upsert({ pendingApproval: entry });
    }
    case 'coding-cli:approval_resolved': {
      const requestId = (p.requestId as string) ?? '';
      const resolved: CodingCliResolvedApproval = {
        requestId,
        decision: (p.decision as CodingCliResolvedApproval['decision']) ?? 'rejected',
        decidedBy: (p.decidedBy as CodingCliResolvedApproval['decidedBy']) ?? 'human',
        reason: p.reason as string | undefined,
        at: (p.decidedAt as number) ?? event.ts,
      };
      const cleared =
        existing.pendingApproval?.requestId === requestId ? undefined : existing.pendingApproval;
      return upsert({
        pendingApproval: cleared,
        resolvedApprovals: [...existing.resolvedApprovals, resolved],
      });
    }
    case 'coding-cli:decision_recorded': {
      const entry: CodingCliDecisionEntry = {
        decision: (p.decision as string) ?? '',
        rationale: (p.rationale as string) ?? '',
        alternatives: Array.isArray(p.alternatives) ? (p.alternatives as string[]) : [],
        at: event.ts,
      };
      return upsert({ decisions: [...existing.decisions, entry] });
    }
    case 'coding-cli:checkpoint': {
      const entry: CodingCliCheckpointEntry = {
        label: (p.label as string) ?? 'checkpoint',
        detail: p.detail as string | undefined,
        at: event.ts,
      };
      return upsert({ checkpoints: [...existing.checkpoints, entry] });
    }
    case 'coding-cli:result_reported':
      return upsert({ result: p.claim as CodingCliResultClaim | undefined });
    case 'coding-cli:verification_started':
      // No structural change — could surface "verifying…" tag if needed.
      return upsert({ state: stateField ?? existing.state });
    case 'coding-cli:verification_completed': {
      const verification: CodingCliSessionState['verification'] = {
        passed: (p.passed as boolean) ?? false,
        oracleVerdicts: (p.oracleVerdicts as CodingCliVerificationOutcome['oracleVerdicts']) ?? [],
        testResults: p.testResults as CodingCliVerificationOutcome['testResults'],
        predictionError: p.predictionError as CodingCliVerificationOutcome['predictionError'],
        at: event.ts,
      };
      return upsert({ verification });
    }
    case 'coding-cli:completed':
      return upsert({
        state: stateField ?? 'completed',
        endedAt: event.ts,
      });
    case 'coding-cli:failed':
      return upsert({
        state: stateField ?? 'failed',
        endedAt: event.ts,
        failureReason: (p.reason as string) ?? 'unknown',
      });
    case 'coding-cli:stalled': {
      return upsert({
        stalled: { idleMs: (p.idleMs as number) ?? 0, at: event.ts },
        state: stateField ?? existing.state,
      });
    }
    case 'coding-cli:cancelled':
      return upsert({
        state: stateField ?? 'cancelled',
        endedAt: event.ts,
        cancelled: {
          by: (p.cancelledBy as string) ?? 'user',
          reason: p.reason as string | undefined,
          at: event.ts,
        },
      });
    default:
      return current;
  }
}

function defaultCapabilities(): CodingCliCapabilities {
  return {
    headless: false,
    interactive: false,
    streamProtocol: false,
    resume: false,
    nativeHooks: false,
    jsonOutput: false,
    approvalPrompts: false,
    toolEvents: false,
    fileEditEvents: false,
    transcriptAccess: false,
    statusCommand: false,
    cancelSupport: false,
  };
}

function appendCapped(existing: string, addition: string, max: number): string {
  if (existing.length + addition.length <= max) return existing + addition;
  const combined = existing + addition;
  return combined.slice(combined.length - max);
}
