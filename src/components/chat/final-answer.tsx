import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { Markdown } from './markdown';

interface FinalAnswerProps {
  turn: StreamingTurn;
}

/**
 * The model's final markdown answer, rendered in its own bordered card so
 * it visibly separates from the work feed (plan checklist, tool calls,
 * diagnostics). The streaming caret only appears while the turn is still
 * `running` — once the turn settles to `done` / `error` the caret stops.
 *
 * Returns null when there's no content yet so the bubble doesn't show an
 * empty card during the early stages of a turn (planning / pre-text).
 */
export function FinalAnswer({ turn }: FinalAnswerProps) {
  if (!turn.finalContent) return null;
  const isStreaming = turn.status === 'running';
  return (
    <div className="rounded-md border border-border bg-surface-2/40 px-3.5 py-2.5">
      <div className="text-text">
        <Markdown content={turn.finalContent} />
        {isStreaming && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
        )}
      </div>
    </div>
  );
}
