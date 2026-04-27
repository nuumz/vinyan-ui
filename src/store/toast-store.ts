import { create } from 'zustand';
import { formatError } from '@/lib/error-format';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Auto-dismiss in ms. `0` keeps the toast pinned until the user dismisses. */
  duration: number;
  /** Supporting line — usually a "what to do next" hint. */
  hint?: string;
  /** Technical details for the collapsible row (status, path, raw body). */
  detail?: string;
  /** Optional CTA — typically "Retry". */
  action?: ToastAction;
}

export interface ToastInput {
  message?: string;
  variant?: ToastVariant;
  duration?: number;
  hint?: string;
  detail?: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput & { message: string }) => string;
  remove: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  info: 4000,
  success: 3500,
  warning: 6000,
  // Keep error toasts on screen long enough to read the hint and click Retry.
  error: 8000,
};

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (input) => {
    const id = `toast-${++counter}`;
    const variant = input.variant ?? 'info';
    const duration = input.duration ?? DEFAULT_DURATION[variant];
    set((s) => {
      // Dedup: collapse a back-to-back identical toast (same message+variant)
      // so retry storms don't stack into a wall of duplicates.
      const last = s.toasts[s.toasts.length - 1];
      if (
        last &&
        last.message === input.message &&
        last.variant === variant &&
        last.hint === input.hint
      ) {
        return s;
      }
      // Cap at 5 visible — drop the oldest non-pinned toast first.
      let trimmed = s.toasts;
      if (trimmed.length >= 5) {
        const oldestIdx = trimmed.findIndex((t) => t.duration > 0);
        trimmed = oldestIdx >= 0 ? trimmed.filter((_, i) => i !== oldestIdx) : trimmed.slice(1);
      }
      return {
        toasts: [
          ...trimmed,
          {
            id,
            message: input.message,
            variant,
            duration,
            hint: input.hint,
            detail: input.detail,
            action: input.action,
          },
        ],
      };
    });
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Convenience helpers. The first arg is always the user-visible message;
 * extras (action, hint, detail) go through the options object.
 */
export const toast = {
  info: (message: string, opts?: ToastInput) =>
    useToastStore.getState().push({ ...opts, message, variant: 'info' }),
  success: (message: string, opts?: ToastInput) =>
    useToastStore.getState().push({ ...opts, message, variant: 'success' }),
  warning: (message: string, opts?: ToastInput) =>
    useToastStore.getState().push({ ...opts, message, variant: 'warning' }),
  error: (message: string, opts?: ToastInput) =>
    useToastStore.getState().push({ ...opts, message, variant: 'error' }),
  /**
   * Format an unknown / Error / ApiError into a clean error toast with hint
   * and technical details. Pass `action` to expose a Retry button.
   */
  apiError: (err: unknown, opts?: { fallback?: string; action?: ToastAction }) => {
    const formatted = formatError(err, opts?.fallback);
    return useToastStore.getState().push({
      message: formatted.title,
      variant: 'error',
      hint: formatted.hint,
      detail: formatted.detail,
      action: opts?.action,
      // Pin auth errors — the user has to refresh / re-auth to fix them.
      duration: formatted.kind === 'auth' ? 0 : undefined,
    });
  },
  dismiss: (id: string) => useToastStore.getState().remove(id),
};
