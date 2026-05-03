/**
 * Public surface for the modular Session Timeline architecture.
 *
 * Canonical names mapped to their concrete implementations so consumers
 * import from one place:
 *
 *   - SessionTimeline   — `<SessionTimeline>`           (session-timeline.tsx)
 *   - MessageCard       — `<MessageBubble>`             (message-bubble.tsx)
 *   - WorkflowPlan      — `<PlanSurface>`               (plan-surface.tsx)
 *   - ProcessReplayTree — `<HistoricalProcessCard>`     (historical-process-card.tsx)
 *   - ActionCard        — `<ActionCard>`                (action-card.tsx)
 *   - MetadataPillRow   — shared rigid pill row          (action-card.tsx)
 *
 * Existing direct imports (`@/components/chat/message-bubble`) keep
 * working — this barrel is additive, not a forced cutover.
 */

export { SessionTimeline } from './session-timeline';
export { MessageBubble as MessageCard, MessageBubble } from './message-bubble';
export { PlanSurface as WorkflowPlan, PlanSurface } from './plan-surface';
export {
  HistoricalProcessCard as ProcessReplayTree,
  HistoricalProcessCard,
} from './historical-process-card';
export { ActionCard, MetadataPillRow } from './action-card';
export { AgentRosterCard } from './agent-roster-card';
export {
  SessionCard,
  SessionCardHeader,
  SessionCardBody,
  SessionCardAffordance,
} from './session-card';
export { StreamingBubble } from './streaming-bubble';
export { TaskApprovalCard } from './task-approval-card';

export type { SessionTimelineProps } from './session-timeline';
export type { ActionCardProps } from './action-card';
export type {
  SessionCardProps,
  SessionCardVariant,
  SessionCardTone,
} from './session-card';

// Re-export the public type contract so consumers can import everything
// they need from `@/components/chat`.
export type {
  AgentMessage,
  SubAgentTask,
  PlanStep,
  ExecutionMetadata,
  ExecutionStatus,
  ActionCardKind,
  TimelineToolCall,
} from '@/types/session-timeline';
export {
  toAgentMessage,
  toSubAgentTask,
  statusFromTraceOutcome,
} from '@/types/session-timeline';
