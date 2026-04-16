import { cn } from '@/lib/utils';
import { useToastStore, type ToastVariant } from '@/store/toast-store';
import { X } from 'lucide-react';

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-green/30 bg-green/10 text-green',
  error: 'border-red/30 bg-red/10 text-red',
  warning: 'border-yellow/30 bg-yellow/10 text-yellow',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm shadow-lg animate-in slide-in-from-right',
            variantStyles[t.variant],
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            className="opacity-60 hover:opacity-100"
            onClick={() => remove(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
