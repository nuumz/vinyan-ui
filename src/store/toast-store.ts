import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  add: (message: string, variant?: ToastVariant) => void;
  remove: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (message, variant = 'info') => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Shorthand
export const toast = {
  info: (msg: string) => useToastStore.getState().add(msg, 'info'),
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  error: (msg: string) => useToastStore.getState().add(msg, 'error'),
  warning: (msg: string) => useToastStore.getState().add(msg, 'warning'),
};
