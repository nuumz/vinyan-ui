import { Loader2 } from 'lucide-react';
import { PHASE_META, type PhaseName } from '@/lib/phases';
import { cn } from '@/lib/utils';

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
