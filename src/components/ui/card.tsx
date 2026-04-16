import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

export function Card({ children, className, label }: CardProps) {
  return (
    <div className={cn('bg-surface rounded-lg border border-border p-4', className)}>
      {label && <div className="text-xs text-text-dim uppercase tracking-wider mb-3">{label}</div>}
      {children}
    </div>
  );
}
