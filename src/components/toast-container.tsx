import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Info, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { useToastStore, type Toast, type ToastVariant } from '@/store/toast-store';

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-accent/40 bg-accent/5',
  success: 'border-green/40 bg-green/5',
  error: 'border-red/40 bg-red/5',
  warning: 'border-yellow/40 bg-yellow/5',
};

const accentText: Record<ToastVariant, string> = {
  info: 'text-accent',
  success: 'text-green',
  error: 'text-red',
  warning: 'text-yellow',
};

const variantIcon: Record<ToastVariant, ComponentType<{ size?: number; className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-14 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [paused, setPaused] = useState(false);
  // Mirror state into refs so the running setTimeout below can read the
  // latest pause value without re-creating the timer on every state flip.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Pinned toasts (`duration === 0`) stay until the user dismisses. Otherwise
  // tick a per-second check that respects the hover-pause flag — simpler and
  // more honest than re-arming a setTimeout, and total drift over 8s is < 1s.
  useEffect(() => {
    if (toast.duration <= 0) return;
    let remaining = toast.duration;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      remaining -= 100;
      if (remaining <= 0) {
        clearInterval(interval);
        onDismissRef.current();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [toast.duration]);

  const Icon = variantIcon[toast.variant];
  const accent = accentText[toast.variant];
  const hasDetail = !!toast.detail;

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-lg border shadow-lg backdrop-blur-sm animate-in slide-in-from-right',
        'bg-surface/95',
        variantStyles[toast.variant],
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Icon size={16} className={cn('shrink-0 mt-0.5', accent)} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-sm text-text wrap-break-word">{toast.message}</div>
          {toast.hint && <div className="text-xs text-text-dim">{toast.hint}</div>}
          {(toast.action || hasDetail) && (
            <div className="flex items-center gap-3 pt-0.5">
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    onDismiss();
                  }}
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded border transition-colors',
                    accent,
                    'border-current/30 hover:bg-current/10',
                  )}
                >
                  {toast.action.label}
                </button>
              )}
              {hasDetail && (
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-[11px] text-text-dim hover:text-text"
                  aria-expanded={showDetail}
                >
                  <ChevronDown
                    size={11}
                    className={cn('transition-transform', showDetail && 'rotate-180')}
                  />
                  {showDetail ? 'Hide details' : 'Show details'}
                </button>
              )}
            </div>
          )}
          {showDetail && hasDetail && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-bg/60 px-2 py-1.5 text-[11px] text-text-dim font-mono whitespace-pre-wrap break-all">
              {toast.detail}
            </pre>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 -mr-1 -mt-1 p-1 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
