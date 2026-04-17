import { useEffect } from 'react';
import { cn } from '@/lib/utils';

type ConfirmVariant = 'default' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="relative bg-surface border border-border rounded-lg w-[26rem] max-w-[90vw] p-5 shadow-xl">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <div className="text-sm text-text-dim mt-2">{description}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'px-3 py-1.5 text-sm rounded border transition-colors disabled:opacity-50',
              variant === 'danger'
                ? 'bg-red/10 border-red/30 text-red hover:bg-red/20'
                : 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20',
            )}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
