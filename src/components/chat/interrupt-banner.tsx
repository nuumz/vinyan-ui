import { HelpCircle } from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { TurnErrorPanel } from './turn-error-panel';
import { WorkflowApprovalCard } from './workflow-approval-card';

interface InterruptBannerProps {
  turn: StreamingTurn;
  sessionId: string;
  onRetry?: () => void;
}

/**
 * Loud, full-width "user attention required" surface placed above the plan.
 *
 * Composes three previously-separate blocks (workflow approval card,
 * clarification list, error panel) into a single banner slot so the chat
 * bubble has exactly one place where interrupts live. Always renders
 * something or returns null — never two interrupt UIs at once. Priority,
 * top → bottom: approval > clarification > error.
 *
 * The banner styling intentionally shifts content downward when it appears
 * mid-stream — that loudness is the point. The receiving page should layer
 * a 200ms slide-in animation in CSS to soften the layout shift.
 */
export function InterruptBanner({ turn, sessionId, onRetry }: InterruptBannerProps) {
  if (turn.pendingApproval && turn.status === 'awaiting-approval') {
    return <WorkflowApprovalCard sessionId={sessionId} pending={turn.pendingApproval} />;
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
        <div className="text-xs text-text-dim">Type your answer below to continue.</div>
      </div>
    );
  }

  if (turn.status === 'error') {
    return <TurnErrorPanel reason={turn.error} onRetry={onRetry} />;
  }

  return null;
}
