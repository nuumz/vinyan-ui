import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { TurnProcessSurfaces } from './turn-process-surfaces';

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
 *   3. PartialDecisionCard — runtime decision gate (when paused)
 *   4. StageManifestSurface — decision/todo summary (when present)
 *   5. AgentTimelineCard — multi-agent activity card
 *   6. CodingCliCard     — external CLI sessions
 *   7. PlanSurface       — primary work surface; tools nest under their step
 *   8. ProcessTimeline   — orchestrator decisions
 *   9. FinalAnswer       — markdown response, distinct card
 *  10. DiagnosticsDrawer — collapsed details for power users
 *
 * Composition is owned by `<TurnProcessSurfaces mode="live">` so the live
 * bubble and the historical replay card render identical detail.
 */
export function StreamingBubble({ turn, sessionId, nowMs, onRetry }: StreamingBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm flex flex-col gap-3">
        <TurnProcessSurfaces
          turn={turn}
          mode="live"
          sessionId={sessionId}
          nowMs={nowMs}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}
