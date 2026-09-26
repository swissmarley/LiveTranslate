import { create } from 'zustand';

export type ToastKind = 'info' | 'error';

interface ToastState {
  toast: { id: number; message: string; kind: ToastKind } | null;
  show: (message: string, kind?: ToastKind) => void;
  hide: () => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set, get) => ({
  toast: null,
  show: (message, kind = 'info') => {
    const id = nextId++;
    set({ toast: { id, message, kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, kind === 'error' ? 5000 : 3000);
  },
  hide: () => set({ toast: null }),
}));

export function showToast(message: string, kind: ToastKind = 'info'): void {
  useToast.getState().show(message, kind);
}
