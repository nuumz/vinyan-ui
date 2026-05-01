import { HelpCircle } from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { TurnErrorPanel } from './turn-error-panel';
import { WorkflowApprovalCard } from './workflow-approval-card';
import { WorkflowHumanInputCard } from './workflow-human-input-card';

/**
 * Names of gates that the backend projection can flag as still open
 * even when this banner is rendered in historical mode. Surfacing them
 * here means a user looking at a "frozen" replay (e.g. /tasks drawer
 * Process tab) can still take the live action — approve a workflow
 * plan, answer a human-input prompt, decide on a partial failure —
 * without bouncing back to the chat surface.
 */
export type ActionableGateName = 'approval' | 'humanInput' | 'partialDecision';

interface InterruptBannerProps {
  turn: StreamingTurn;
  sessionId: string;
  onRetry?: () => void;
  /**
   * Historical replay mode. The banner still composes the four sub-cards
   * but hides their action affordances (approve/reject/answer/retry). Used
   * by the historical process card so a past task that paused on a gate
   * still surfaces the gate as a recorded snapshot.
   */
  readOnly?: boolean;
  /**
   * Override `readOnly` per-gate. When `readOnly === true` AND the
   * current gate is in this set, the corresponding sub-card renders
   * with `readOnly=false` so the user can act on it. Keys mirror the
   * backend projection's `gates` field — pass derived names when
   * `projection.gates.<name>.open && !resolved`. Default empty set =
   * pure historical, no live actions.
   */
  actionableGates?: ReadonlySet<ActionableGateName>;
}

/**
 * Loud, full-width "user attention required" surface placed above the plan.
 *
 * Composes four previously-separate blocks (workflow approval card,
 * workflow human-input card, clarification list, error panel) into a
 * single banner slot so the chat bubble has exactly one place where
 * interrupts live. Always renders something or returns null — never two
 * interrupt UIs at once. Priority, top → bottom: approval > human-input >
 * clarification > error.
 *
 * The banner styling intentionally shifts content downward when it appears
 * mid-stream — that loudness is the point. The receiving page should layer
 * a 200ms slide-in animation in CSS to soften the layout shift.
 */
export function InterruptBanner({
  turn,
  sessionId,
  onRetry,
  readOnly = false,
  actionableGates,
}: InterruptBannerProps) {
  // Per-gate readOnly resolution. Defaults to the banner-level flag,
  // but a gate listed in `actionableGates` flips back to interactive —
  // the historical card sees a recorded snapshot for closed gates and
  // a live action surface for open ones, without two separate banners.
  const isActionable = (gate: ActionableGateName) =>
    !readOnly || (actionableGates?.has(gate) ?? false);

  // In live mode the gates are matched on `turn.status` so they only fire
  // while the workflow is actually paused. In historical mode the
  // recording may have stopped while a gate was open AND the reducer's
  // status sweep on terminal events never ran — so we render whichever
  // pending* surface is set, regardless of status, as a read-only
  // snapshot of the gate that was active.
  if (turn.pendingApproval && (readOnly || turn.status === 'awaiting-approval')) {
    return (
      <WorkflowApprovalCard
        sessionId={sessionId}
        pending={turn.pendingApproval}
        readOnly={!isActionable('approval')}
      />
    );
  }

  if (turn.pendingHumanInput && (readOnly || turn.status === 'awaiting-human-input')) {
    return (
      <WorkflowHumanInputCard
        sessionId={sessionId}
        pending={turn.pendingHumanInput}
        readOnly={!isActionable('humanInput')}
      />
    );
  }

  if (turn.status === 'input-required' && turn.clarifications.length > 0) {
    return (
      <div className="bg-yellow/5 border border-yellow/30 rounded-md p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-yellow">
          <HelpCircle size={14} /> Clarification needed
        </div>
        <ul className="list-disc list-inside text-sm text-text space-y-1">
          {turn.clarifications.map((q, idx) => (
            // Index key — clarifications can repeat verbatim across re-asks,
            // and a duplicate string key would make React reuse the wrong
            // <li>, breaking measure/animation on the second occurrence.
            <li key={`${idx}-${q}`}>{q}</li>
          ))}
        </ul>
        {!readOnly && (
          <div className="text-xs text-text-dim">Type your answer below to continue.</div>
        )}
      </div>
    );
  }

  if (turn.status === 'error') {
    return <TurnErrorPanel reason={turn.error} onRetry={onRetry} readOnly={readOnly} />;
  }

  return null;
}
