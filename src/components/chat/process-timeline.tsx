/**
 * Process timeline — chronological log of orchestrator decisions surfaced
 * during a turn (skill match, agent routing, agent synthesis, capability
 * research). Mirrors Claude-Code-style "process thinking" panels: a
 * collapsible list under the chat bubble, one icon + label + optional
 * detail per entry.
 *
 * Source of truth: `StreamingTurn.processLog`, populated by the reducer in
 * `use-streaming-turn.ts` from typed bus payloads. Never derived from LLM
 * output (no-llm-output-postfilter rule).
 */
import { useState } from 'react';
import {
  ChevronRight,
  Sparkles,
  Compass,
  Wand2,
  Search,
  AlertTriangle,
  CircleSlash,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProcessLogEntry, ProcessLogKind, StreamingTurn } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

interface ProcessTimelineProps {
  turn: StreamingTurn;
}

const ICON_BY_KIND: Record<ProcessLogKind, LucideIcon> = {
  skill_match: Sparkles,
  skill_miss: CircleSlash,
  agent_routed: Compass,
  agent_synthesized: Wand2,
  agent_synthesis_failed: AlertTriangle,
  capability_research: Search,
  capability_research_failed: AlertTriangle,
};

const COLOR_BY_STATUS: Record<ProcessLogEntry['status'], string> = {
  info: 'text-text-dim',
  success: 'text-green',
  warn: 'text-yellow',
  error: 'text-red',
};

export function ProcessTimeline({ turn }: ProcessTimelineProps) {
  const entries = turn.processLog;
  // Default expanded for short, in-flight runs so the user sees activity
  // without clicking; collapse once the timeline grows or the turn ends to
  // avoid dominating the bubble.
  const isRunning = turn.status === 'running';
  // Don't auto-expand mid-run: when the timeline grows from 0 → N entries
  // during streaming, an open <details> would shove the rest of the bubble
  // down on every entry and the user perceives it as flickering. We only
  // auto-open after the run settles AND only for short logs that fit
  // without dominating the bubble.
  const defaultOpen = !isRunning && entries.length > 0 && entries.length <= 6;
  const [open, setOpen] = useState(defaultOpen);

  if (entries.length === 0) return null;

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
        <Activity
          size={11}
          className={cn('shrink-0', isRunning ? 'text-purple animate-pulse' : 'text-purple')}
        />
        <span className="text-text-dim shrink-0">
          {isRunning ? 'Process…' : 'Process'} · {entries.length} step{entries.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <ol className="px-3 pb-2 pt-1 border-t border-border/40 space-y-1">
          {entries.map((entry) => {
            const Icon = ICON_BY_KIND[entry.kind];
            return (
              <li key={entry.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <Icon size={11} className={cn('shrink-0 mt-0.5', COLOR_BY_STATUS[entry.status])} />
                <div className="flex-1 min-w-0">
                  <span className="text-text">{entry.label}</span>
                  {entry.detail && (
                    <span className="text-text-dim italic ml-1.5 wrap-break-word">{entry.detail}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
