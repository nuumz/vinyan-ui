import { Brain, Eye, Target, ListTree, Sparkles, ShieldCheck, GraduationCap, Loader2 } from 'lucide-react';
import type { PhaseName } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

const PHASE_META: Record<PhaseName, { label: string; Icon: typeof Brain; tone: string }> = {
  perceive: { label: 'Perceiving', Icon: Eye, tone: 'text-accent' },
  comprehend: { label: 'Comprehending', Icon: Brain, tone: 'text-purple' },
  predict: { label: 'Predicting', Icon: Target, tone: 'text-accent' },
  plan: { label: 'Planning', Icon: ListTree, tone: 'text-yellow' },
  generate: { label: 'Generating', Icon: Sparkles, tone: 'text-green' },
  verify: { label: 'Verifying', Icon: ShieldCheck, tone: 'text-accent' },
  learn: { label: 'Learning', Icon: GraduationCap, tone: 'text-purple' },
};

export function PhaseChip({ phase, active }: { phase?: PhaseName; active: boolean }) {
  if (!phase) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-dim">
        <Loader2 size={12} className="animate-spin" />
        Starting…
      </span>
    );
  }
  const { label, Icon, tone } = PHASE_META[phase];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', tone)}>
      <Icon size={12} className={active ? 'animate-pulse' : ''} />
      {active ? label : 'Learned'}
    </span>
  );
}
