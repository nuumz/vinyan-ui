/**
 * Compact pipeline phase timeline shown inside the diagnostics drawer.
 *
 * Uses a quiet dot + label row instead of boxed abbreviations. The phases
 * remain ordered by the core-loop contract, but the UI emphasizes what the
 * user needs to read quickly: completed/running/skipped state and duration.
 */
import type { PhaseTiming, StreamingStatus } from '@/hooks/use-streaming-turn';
import { PHASE_META, PHASE_ORDER, type PhaseName } from '@/lib/phases';
import { cn } from '@/lib/utils';

interface PhaseTimelineProps {
  timings: PhaseTiming[];
  currentPhase?: PhaseName;
  status: StreamingStatus;
}

type PhaseState = 'done' | 'active' | 'pending' | 'skipped';

const PHASE_LABELS: Record<PhaseName, string> = {
  perceive: 'Perceive',
  comprehend: 'Comprehend',
  predict: 'Predict',
  plan: 'Plan',
  generate: 'Generate',
  verify: 'Verify',
  learn: 'Learn',
};

const ROW_CLASSES: Record<PhaseState, string> = {
  done: 'text-text',
  active: 'text-accent',
  pending: 'text-text-dim/55',
  skipped: 'text-text-dim/50',
};

const DOT_CLASSES: Record<PhaseState, string> = {
  done: 'bg-green',
  active: 'bg-accent animate-pulse',
  pending: 'bg-text-dim/35',
  skipped: 'border border-text-dim/35 bg-transparent',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function usePhaseData(timings: PhaseTiming[], currentPhase?: PhaseName, status?: StreamingStatus) {
  const isRunning = status === 'running';
  const isFinished = status === 'done' || status === 'error';

  const byPhase = new Map<PhaseName, { totalMs: number; visits: number }>();
  for (const t of timings) {
    const prev = byPhase.get(t.phase);
    byPhase.set(t.phase, {
      totalMs: (prev?.totalMs ?? 0) + t.durationMs,
      visits: (prev?.visits ?? 0) + 1,
    });
  }

  const totalMs = timings.reduce((acc, t) => acc + t.durationMs, 0);

  const phases = PHASE_ORDER.map((phase) => {
    const entry = byPhase.get(phase);
    let phaseState: PhaseState;
    if (entry) {
      phaseState = isRunning && phase === currentPhase ? 'active' : 'done';
    } else if (isRunning && phase === currentPhase) {
      phaseState = 'active';
    } else if (isFinished) {
      phaseState = 'skipped';
    } else {
      phaseState = 'pending';
    }
    return { phase, entry, phaseState };
  });

  return { phases, totalMs, isRunning };
}

function CompactTimeline({ timings, currentPhase, status }: PhaseTimelineProps) {
  const { phases, totalMs } = usePhaseData(timings, currentPhase, status);
  const completedCount = phases.filter(({ phaseState }) => phaseState === 'done').length;

  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {phases.map(({ phase, entry, phaseState }) => {
        const meta = PHASE_META[phase];
        const tooltip = entry
          ? `${meta.label} · ${formatMs(entry.totalMs)}${entry.visits > 1 ? ` (×${entry.visits})` : ''}`
          : phaseState === 'active'
            ? `${meta.label} · running…`
            : phaseState === 'skipped'
              ? `${meta.label} · skipped`
              : `${meta.label} · pending`;

        return (
          <li
            key={phase}
            title={tooltip}
            aria-label={tooltip}
            className={cn(
              'inline-flex min-w-0 items-center gap-1.5 text-[11px] leading-5 select-none',
              ROW_CLASSES[phaseState],
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[phaseState])}
              aria-hidden="true"
            />
            <span className="font-medium">{PHASE_LABELS[phase]}</span>
            {entry && (
              <span className="font-mono text-[10px] tabular-nums text-text-dim/80">
                {formatMs(entry.totalMs)}
              </span>
            )}
            {!entry && phaseState === 'active' && (
              <span className="font-mono text-[10px] tabular-nums text-accent/80">running</span>
            )}
            {!entry && phaseState === 'skipped' && (
              <span className="font-mono text-[10px] tabular-nums text-text-dim/55">skipped</span>
            )}
            {entry && entry.visits > 1 && (
              <span className="font-mono text-[10px] tabular-nums text-text-dim/60">
                ×{entry.visits}
              </span>
            )}
          </li>
        );
      })}
      </ol>
      {totalMs > 0 && (
        <div className="text-[10px] text-text-dim/70">
          {completedCount}/{PHASE_ORDER.length} completed · {formatMs(totalMs)} total
        </div>
      )}
    </div>
  );
}

export function PhaseTimeline(props: PhaseTimelineProps) {
  return <CompactTimeline {...props} />;
}
