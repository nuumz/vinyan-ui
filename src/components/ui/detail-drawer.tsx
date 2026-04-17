import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const widthMap = {
  md: 'w-[28rem]',
  lg: 'w-[36rem]',
  xl: 'w-[48rem]',
} as const;

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'lg',
}: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'relative bg-surface border-l border-border flex flex-col',
          widthMap[width],
          'max-w-[90vw] h-full',
        )}
      >
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            {subtitle && <p className="text-xs text-text-dim mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-dim hover:text-text hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
