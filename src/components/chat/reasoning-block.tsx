/**
 * Live reasoning / thinking block. Rendered while the agent is actively
 * producing rationale (via `agent:thinking` events) and/or after the turn
 * completes with a final `thinking` trace.
 *
 * Copilot-style: shows the most recent rationale compactly with a click-to-
 * expand-full view. Collapsed by default to avoid visual noise; pulses a
 * subtle indicator while streaming.
 */
import { useState } from 'react';
import { ChevronRight, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReasoningBlockProps {
  /** Streamed rationale fragments (most recent last). */
  fragments: string[];
  /** Final thinking trace from task:complete. Rendered after streaming ends. */
  finalThinking?: string;
  /** True while events are still arriving for this turn. */
  isRunning: boolean;
}

function mostRecent(fragments: string[]): string {
  // Show the last non-empty fragment (typically the most informative).
  for (let i = fragments.length - 1; i >= 0; i--) {
    const f = fragments[i]?.trim();
    if (f) return f;
  }
  return '';
}

export function ReasoningBlock({ fragments, finalThinking, isRunning }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false);
  const hasLive = fragments.length > 0;
  const hasFinal = typeof finalThinking === 'string' && finalThinking.trim().length > 0;
  if (!hasLive && !hasFinal) return null;

  const preview = mostRecent(fragments) || finalThinking?.split('\n')[0] || '';
  const fullText = hasFinal ? finalThinking! : fragments.join('\n\n');

  return (
    <div className="border border-border/60 rounded-md bg-bg/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-surface-2/50 transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn('text-text-dim transition-transform shrink-0', open && 'rotate-90')}
        />
        <Brain
          size={11}
          className={cn(
            'shrink-0',
            isRunning && hasLive ? 'text-purple animate-pulse' : 'text-purple',
          )}
        />
        <span className="text-text-dim shrink-0">
          {isRunning && hasLive ? 'Reasoning…' : 'Reasoning'}
        </span>
        {!open && preview && (
          <span className="text-text-dim italic truncate flex-1">
            {preview.length > 100 ? `${preview.slice(0, 100)}…` : preview}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-border/40">
          <pre className="text-[11px] text-text-dim whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-auto">
            {fullText}
          </pre>
        </div>
      )}
    </div>
  );
}
