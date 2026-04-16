import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}

export function StatCard({ title, value, sub, valueColor }: StatCardProps) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="text-xs text-text-dim uppercase tracking-wider mb-1">{title}</div>
      <div className={cn('text-2xl font-bold tabular-nums', valueColor)}>{value}</div>
      {sub && <div className="text-xs text-text-dim mt-1">{sub}</div>}
    </div>
  );
}
