/**
 * Compact 7-phase timeline shown at the top of a streaming chat bubble.
 *
 * Each phase is a small pill (Copilot Chat style):
 *   - done    → filled green, shows duration on hover
 *   - active  → outlined accent, animate-pulse
 *   - pending → muted, dim
 *   - skipped → dashed border (turn finished without traversing it)
 */
import type { PhaseTiming, StreamingStatus } from '@/hooks/use-streaming-turn';
import { PHASE_META, PHASE_ORDER, type PhaseName } from '@/lib/phases';
import { cn } from '@/lib/utils';

interface PhaseTimelineProps {
  timings: PhaseTiming[];
  currentPhase?: PhaseName;
  status: StreamingStatus;
}

type PillStatus = 'done' | 'active' | 'pending' | 'skipped';

const PILL_CLASSES: Record<PillStatus, string> = {
  done: 'bg-green/15 text-green border-green/40',
  active: 'bg-accent/10 text-accent border-accent/50 animate-pulse',
  pending: 'bg-transparent text-text-dim border-border',
  skipped: 'bg-transparent text-text-dim border-border border-dashed opacity-60',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function PhaseTimeline({ timings, currentPhase, status }: PhaseTimelineProps) {
  const isRunning = status === 'running';
  const isFinished = status === 'done' || status === 'error';

  // Build per-phase view-state in PHASE_ORDER. Sum durations across multiple
  // visits (escalation re-runs phases) — most recent timing wins for tooltip.
  const byPhase = new Map<PhaseName, { totalMs: number; visits: number }>();
  for (const t of timings) {
    const prev = byPhase.get(t.phase);
    byPhase.set(t.phase, {
      totalMs: (prev?.totalMs ?? 0) + t.durationMs,
      visits: (prev?.visits ?? 0) + 1,
    });
  }

  const totalMs = timings.reduce((acc, t) => acc + t.durationMs, 0);

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {PHASE_ORDER.map((phase) => {
        const entry = byPhase.get(phase);
        let pillStatus: PillStatus;
        if (entry) {
          pillStatus = isRunning && phase === currentPhase ? 'active' : 'done';
        } else if (isRunning && phase === currentPhase) {
          pillStatus = 'active';
        } else if (isFinished) {
          pillStatus = 'skipped';
        } else {
          pillStatus = 'pending';
        }

        const meta = PHASE_META[phase];
        const tooltip = entry
          ? `${meta.label} · ${formatMs(entry.totalMs)}${entry.visits > 1 ? ` (×${entry.visits})` : ''}`
          : pillStatus === 'active'
            ? `${meta.label} · running…`
            : pillStatus === 'skipped'
              ? `${meta.label} · skipped`
              : `${meta.label} · pending`;

        return (
          <span
            key={phase}
            title={tooltip}
            aria-label={tooltip}
            className={cn(
              'inline-flex items-center justify-center min-w-[1.75rem] h-5 px-1.5 rounded border text-[10px] font-mono leading-none tabular-nums select-none',
              PILL_CLASSES[pillStatus],
            )}
          >
            {meta.abbrev}
          </span>
        );
      })}
      {totalMs > 0 && (
        <span className="ml-1 text-[10px] text-text-dim tabular-nums" title="Sum of phase durations">
          {formatMs(totalMs)}
        </span>
      )}
    </div>
  );
}
