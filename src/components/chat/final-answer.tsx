import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { useStreamingActivity } from '@/hooks/use-streaming-activity';
import { Markdown } from './markdown';
import { SessionCard } from './session-card';

interface FinalAnswerProps {
  turn: StreamingTurn;
}

/**
 * The model's final markdown answer, rendered in its own bordered card so
 * it visibly separates from the work feed (plan checklist, tool calls,
 * diagnostics).
 *
 * Live mode only — the render policy in `turn-surface-policy.ts` suppresses
 * this surface in historical mode because `MessageBubble` already renders
 * `message.content` outside of `TurnProcessSurfaces` (rendering both would
 * show the same markdown twice in one bubble). Live turns have no such
 * sibling, so this card remains the canonical place the user reads the
 * streaming reply.
 *
 * The streaming caret is driven by `useStreamingActivity`, which only
 * reports active when text actually grew within the last idle window —
 * not whenever the turn status is `running`. That stops the caret from
 * pulsing during planning / tool-call / verification phases when no
 * character is being written. The caret itself is rendered by the
 * `prose-chat--streaming` CSS rule (see `index.css`) and sits inline at
 * the end of the last text-bearing block of the markdown.
 *
 * Returns null when there's no content yet so the bubble doesn't show an
 * empty card during the early stages of a turn (planning / pre-text).
 */
export function FinalAnswer({ turn }: FinalAnswerProps) {
  const streaming = useStreamingActivity(turn.finalContent, turn.status);
  if (!turn.finalContent) return null;
  return (
    <SessionCard variant="primary" className="bg-surface-2/40 px-3.5 py-2.5">
      <div className="text-text">
        <Markdown content={turn.finalContent} streaming={streaming} />
      </div>
    </SessionCard>
  );
}
