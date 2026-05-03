/**
 * Display labels for workflow decision metadata.
 *
 * Extracted from `chat/stage-manifest-surface.tsx` so AgentRosterCard,
 * TaskCard, TimelineHistory, and any future consumer can share one
 * canonical mapping after the surface itself is retired in Slice 3.
 */
import type {
  MultiAgentGroupMode,
  WorkflowDecisionKind,
  WorkflowTodoItemView,
} from '@/hooks/use-streaming-turn';

export const DECISION_LABEL: Record<WorkflowDecisionKind, string> = {
  conversational: 'Conversational reply',
  'direct-tool': 'Direct tool call',
  'single-agent': 'Single-agent workflow',
  'multi-agent': 'Multi-agent workflow',
  'human-input-required': 'Human input required',
  'approval-required': 'Approval required',
  'full-pipeline': 'Full pipeline (code mutation)',
  unknown: 'Unknown decision',
};

export const GROUP_MODE_LABEL: Record<MultiAgentGroupMode, string> = {
  parallel: 'Parallel',
  competition: 'Competition',
  debate: 'Debate',
  comparison: 'Comparison',
  pipeline: 'Pipeline',
};

export interface TodoCounts {
  done: number;
  failed: number;
  skipped: number;
  total: number;
}

export function summarizeTodos(todos: ReadonlyArray<WorkflowTodoItemView>): TodoCounts {
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of todos) {
    if (t.status === 'done') done++;
    else if (t.status === 'failed') failed++;
    else if (t.status === 'skipped') skipped++;
  }
  return { done, failed, skipped, total: todos.length };
}
