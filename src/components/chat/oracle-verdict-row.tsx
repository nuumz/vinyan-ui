import { CheckCircle2, XCircle, HelpCircle, Shield } from 'lucide-react';
import type { OracleVerdictEntry } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

export function OracleVerdictRow({ entry }: { entry: OracleVerdictEntry }) {
  const Icon =
    entry.verdict === 'pass' ? CheckCircle2 : entry.verdict === 'fail' ? XCircle : HelpCircle;
  const tone =
    entry.verdict === 'pass'
      ? 'text-green'
      : entry.verdict === 'fail'
        ? 'text-red'
        : 'text-text-dim';
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs border border-border rounded-md bg-bg/40">
      <Shield size={11} className="text-accent shrink-0" />
      <span className="font-mono text-text shrink-0">{entry.oracle}</span>
      {entry.reason && <span className="text-text-dim truncate flex-1">{entry.reason}</span>}
      {!entry.reason && <span className="flex-1" />}
      <Icon size={12} className={cn(tone, 'shrink-0')} />
    </div>
  );
}
