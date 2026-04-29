import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { AgentTimelineCard } from './agent-timeline-card';
import { DiagnosticsDrawer } from './diagnostics-drawer';
import { FinalAnswer } from './final-answer';
import { InterruptBanner } from './interrupt-banner';
import { PlanSurface } from './plan-surface';
import { ProcessTimeline } from './process-timeline';
import { TurnHeader } from './turn-header';

interface StreamingBubbleProps {
  turn: StreamingTurn;
  /** Owning session — required so the inline approval card can POST decisions. */
  sessionId: string;
  /** Wall-clock "now" in ms (updated by parent on a 1s tick). */
  nowMs: number;
  onRetry?: () => void;
}

/**
 * Streaming chat bubble — agent-tools shape.
 *
 * Layout (top → bottom):
 *   1. TurnHeader        — one-line "what is the agent doing right now"
 *   2. InterruptBanner   — approval / clarification / error (only when present)
 *   3. PlanSurface       — primary work surface; tools nest under their step
 *   4. FinalAnswer       — markdown response, distinct card
 *   5. DiagnosticsDrawer — collapsed details for power users (phases, verdicts,
 *                          reasoning, raw tool list)
 *
 * Each section returns null when it has nothing to show, so a quick chat
 * Q&A renders as just header + final answer with no debug noise.
 */
export function StreamingBubble({ turn, sessionId, nowMs, onRetry }: StreamingBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm flex flex-col gap-3">
        <TurnHeader turn={turn} nowMs={nowMs} />
        <InterruptBanner turn={turn} sessionId={sessionId} onRetry={onRetry} />
        <AgentTimelineCard
          steps={turn.planSteps}
          stepOutputs={turn.stepOutputs}
          isLive={turn.status === 'running'}
        />
        <PlanSurface turn={turn} />
        <ProcessTimeline turn={turn} />
        <FinalAnswer turn={turn} />
        <DiagnosticsDrawer turn={turn} />
      </div>
    </div>
  );
}
