/**
 * Critic verdict row — shows whether the LLM-as-critic accepted the output
 * and its confidence. One per verdict event, rendered inside the Activity
 * section alongside oracle verdicts.
 */
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CriticVerdictEntry {
  accepted: boolean;
  confidence: number;
  reason?: string;
  at: number;
}

export function CriticVerdictRow({ entry }: { entry: CriticVerdictEntry }) {
  const Icon = entry.accepted ? CheckCircle2 : XCircle;
  const tone = entry.accepted ? 'text-green' : 'text-red';
  const pct = Math.round(entry.confidence * 100);
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 text-xs border border-border/60 rounded-md bg-bg/40">
      <Icon size={11} className={cn(tone, 'shrink-0')} />
      <span className="font-mono text-text shrink-0">critic</span>
      <span className={cn('tabular-nums shrink-0 text-[10px]', tone)}>{pct}%</span>
      {entry.reason && <span className="text-text-dim truncate flex-1">{entry.reason}</span>}
    </div>
  );
}
