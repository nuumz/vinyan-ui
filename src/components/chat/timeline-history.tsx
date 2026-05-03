/**
 * TimelineHistory — single chronological surface that subsumes
 * ProcessTimeline today and (Slice 3) StageManifestSurface plus
 * synthesized rows for plan-step / tool / sub-agent / gate / oracle /
 * critic / escalation lifecycle.
 *
 * Phase A: `processLog` parity only. Filters: actor / kind. Default
 * collapsed mid-run; auto-open after the run settles when ≤6 rows.
 *
 * Live mode: append-only; sticky "now" indicator computed in a
 * separate `useMemo` so the wall-clock tick doesn't bust the rows
 * cache. Historical mode: read-only; "now" pinned to the latest row.
 */
import { memo, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleSlash,
  Compass,
  Filter as FilterIcon,
  Sparkles,
  Search,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProcessLogKind, StreamingTurn } from '@/hooks/use-streaming-turn';
import type { TurnSurfaceMode } from '@/lib/turn-surface-policy';
import {
  buildTimelineRows,
  type TimelineActor,
  type TimelineRow,
  type TimelineRowKind,
  type TimelineRowSeverity,
} from '@/lib/timeline-rows';
import { cn } from '@/lib/utils';
import { SessionCard } from './session-card';

const ICON_BY_PROCESS_KIND: Record<ProcessLogKind, LucideIcon> = {
  skill_match: Sparkles,
  skill_miss: CircleSlash,
  agent_routed: Compass,
  agent_synthesized: Wand2,
  agent_synthesis_failed: AlertTriangle,
  capability_research: Search,
  capability_research_failed: AlertTriangle,
};

const ICON_BY_KIND: Record<TimelineRowKind, LucideIcon> = {
  process: Activity,
  decision: Compass,
  'plan-step': Activity,
  tool: Activity,
  'sub-agent': Activity,
  gate: AlertTriangle,
  oracle: Activity,
  critic: Activity,
  escalation: AlertTriangle,
};

const SEVERITY_CLS: Record<TimelineRowSeverity, string> = {
  info: 'text-text-dim',
  success: 'text-green',
  warn: 'text-yellow',
  error: 'text-red',
};

function rowIcon(row: TimelineRow): LucideIcon {
  if (row.kind === 'process' && row.processKind) {
    return ICON_BY_PROCESS_KIND[row.processKind];
  }
  return ICON_BY_KIND[row.kind];
}

const ALL_ACTORS: TimelineActor[] = [
  'orchestrator',
  'planner',
  'agent',
  'tool',
  'oracle',
  'critic',
  'user',
  'system',
];

interface TimelineHistoryProps {
  turn: StreamingTurn;
  mode: TurnSurfaceMode;
  /** Wall-clock now used for the sticky "Now" indicator (live only). */
  nowMs?: number;
  /** Anchor id for command-palette / keyboard jumps (Slice 5). */
  anchorId?: string;
}

function TimelineHistoryImpl({
  turn,
  mode,
  nowMs,
  anchorId = 'timelinehistory',
}: TimelineHistoryProps) {
  const rows = useMemo(
    () => buildTimelineRows(turn, mode),
    // Phase A only reads processLog + multiAgentSubtasks.length. List the
    // narrow slice so unrelated event types (token deltas, phase tick)
    // don't bust the cache.
    [turn.processLog, turn.multiAgentSubtasks, mode],
  );

  const [actorFilter, setActorFilter] = useState<Set<TimelineActor>>(new Set());
  const visible = useMemo(() => {
    if (actorFilter.size === 0) return rows;
    return rows.filter((r) => actorFilter.has(r.actor));
  }, [rows, actorFilter]);

  const isRunning = mode === 'live' && turn.status === 'running';
  const defaultOpen = !isRunning && visible.length > 0 && visible.length <= 6;
  const [open, setOpen] = useState(defaultOpen);

  // Compute the sticky-now boundary in its own memo so rows-cache stays
  // hot when only the wall-clock advances. Historical mode pins to the
  // latest row's ts.
  const nowBoundary = useMemo(() => {
    if (visible.length === 0) return null;
    if (mode === 'historical') return visible[visible.length - 1].ts;
    return nowMs ?? Date.now();
  }, [visible, mode, nowMs]);

  if (rows.length === 0) return null;

  const presentActors = useMemo(() => {
    const set = new Set<TimelineActor>();
    for (const r of rows) set.add(r.actor);
    return ALL_ACTORS.filter((a) => set.has(a));
  }, [rows]);

  const toggleActor = (a: TimelineActor) => {
    setActorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  return (
    <SessionCard id={anchorId} variant="secondary" clipped>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-surface-2/50 transition-colors"
        aria-expanded={open}
      >
        <ChevronRight
          size={12}
          className={cn('text-text-dim transition-transform shrink-0', open && 'rotate-90')}
        />
        <Activity
          size={11}
          className={cn('shrink-0', isRunning ? 'text-purple animate-pulse' : 'text-purple')}
        />
        <span className="text-text-dim shrink-0 font-medium uppercase tracking-wide">
          Timeline
        </span>
        <span className="text-text-dim/80 shrink-0 normal-case tracking-normal">
          · {visible.length}
          {actorFilter.size > 0 && rows.length !== visible.length && ` of ${rows.length}`}{' '}
          row{visible.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40">
          {presentActors.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap px-3 py-1.5 border-b border-border/30 bg-bg/15">
              <FilterIcon size={10} className="text-text-dim shrink-0" />
              {presentActors.map((a) => {
                const active = actorFilter.has(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleActor(a)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium border transition-colors',
                      active
                        ? 'bg-accent/15 text-accent border-accent/40'
                        : 'bg-bg/30 text-text-dim border-border/60 hover:text-text',
                    )}
                  >
                    {a}
                  </button>
                );
              })}
              {actorFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActorFilter(new Set())}
                  className="ml-1 text-[10px] text-text-dim hover:text-text underline"
                >
                  clear
                </button>
              )}
            </div>
          )}
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-dim italic">
              No rows match the active filter.
            </div>
          ) : (
            <ol className="px-3 pb-2 pt-1 space-y-1">
              {visible.map((row) => (
                <TimelineRowItem key={row.id} row={row} />
              ))}
              {nowBoundary !== null && mode === 'live' && (
                <li
                  className="text-[10px] text-blue/80 uppercase tracking-wide font-mono pt-1 border-t border-blue/20"
                  aria-hidden="true"
                >
                  · now
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </SessionCard>
  );
}

function TimelineRowItem({ row }: { row: TimelineRow }) {
  const Icon = rowIcon(row);
  return (
    <li className="flex items-start gap-2 text-[11px] leading-relaxed">
      <Icon size={11} className={cn('shrink-0 mt-0.5', SEVERITY_CLS[row.severity])} />
      <div className="flex-1 min-w-0">
        <span className="text-text-dim text-[10px] uppercase tracking-wide font-mono mr-1.5">
          {row.actor}
        </span>
        <span className="text-text">{row.label}</span>
        {row.detail && (
          <span className="text-text-dim italic ml-1.5 wrap-break-word">{row.detail}</span>
        )}
      </div>
    </li>
  );
}

/**
 * Memoized — same comparator pattern as the legacy ProcessTimeline.
 * Phase A reads only `processLog`, `status`, `multiAgentSubtasks`. The
 * reducer preserves these refs across unrelated events.
 */
export const TimelineHistory = memo(
  TimelineHistoryImpl,
  (prev, next) =>
    prev.turn.processLog === next.turn.processLog &&
    prev.turn.status === next.turn.status &&
    prev.turn.multiAgentSubtasks === next.turn.multiAgentSubtasks &&
    prev.mode === next.mode,
);
