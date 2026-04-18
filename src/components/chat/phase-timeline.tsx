/**
 * Compact 7-phase timeline shown at the top of a streaming chat bubble.
 *
 * Each phase is a small pill (Copilot Chat style):
 *   - done    → filled green, shows duration on hover
 *   - active  → outlined accent, animate-pulse
 *   - pending → muted, dim
 *   - skipped → dashed border (turn finished without traversing it)
 *
 * `WorkingStatusCard` is a separate export — a human-readable status card
 * that replaces the entire bubble content while the system is thinking.
 */
import { Loader2 } from 'lucide-react';
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
    return { phase, entry, pillStatus };
  });

  return { phases, totalMs, isRunning };
}

function CompactTimeline({ timings, currentPhase, status }: PhaseTimelineProps) {
  const { phases, totalMs } = usePhaseData(timings, currentPhase, status);

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {phases.map(({ phase, entry, pillStatus }) => {
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
              'inline-flex items-center justify-center min-w-7 h-5 px-1.5 rounded border text-[10px] font-mono leading-none tabular-nums select-none',
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

export function PhaseTimeline(props: PhaseTimelineProps) {
  return <CompactTimeline {...props} />;
}

/* ── Working Status Card ─────────────────────────────────────────────── */

interface WorkingStatusCardProps {
  timings: PhaseTiming[];
  currentPhase?: PhaseName;
  /** Elapsed time string, e.g. "4.5s". */
  elapsed: string;
}

/**
 * Human-readable status card for the "working on it" empty state.
 *
 * Shows: Icon + description + progress bar + step count + elapsed.
 * Replaces the cryptic 7-circle stepper with plain language.
 */
export function WorkingStatusCard({ timings, currentPhase, elapsed }: WorkingStatusCardProps) {
  const meta = currentPhase ? PHASE_META[currentPhase] : undefined;
  const Icon = meta?.Icon ?? Loader2;
  const description = meta?.description ?? 'Thinking';
  const tone = meta?.tone ?? 'text-accent';

  // Progress: how many phases are done + current
  const donePhases = new Set(timings.map((t) => t.phase));
  const currentIdx = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : 0;
  const totalSteps = PHASE_ORDER.length;
  const completedSteps = donePhases.size;
  const progressPct = Math.max(((completedSteps + 0.5) / totalSteps) * 100, 8);

  return (
    <div className="space-y-3 py-0.5">
      {/* Status line: icon + description */}
      <div className="flex items-center gap-2.5">
        <div className={cn('flex items-center justify-center w-7 h-7 rounded-full bg-accent/10', tone)}>
          <Icon size={14} className={currentPhase === 'generate' ? 'animate-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-medium', tone)}>
            {description}
            <span className="thinking-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        </div>
        <span className="text-[10px] text-text-dim tabular-nums shrink-0">{elapsed}</span>
      </div>

      {/* Progress bar + step count */}
      <div className="space-y-1">
        <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent/60 transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-text-dim">
          <span>Step {Math.min(currentIdx + 1, totalSteps)} of {totalSteps}</span>
          {completedSteps > 0 && (
            <span className="inline-flex items-center gap-1">
              {Array.from(donePhases).slice(-2).map((p) => {
                const m = PHASE_META[p];
                return (
                  <span key={p} className="inline-flex items-center gap-0.5 text-green">
                    <m.Icon size={9} />
                    <span className="opacity-70">{m.description}</span>
                  </span>
                );
              })}
              <span className="text-green">✓</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
