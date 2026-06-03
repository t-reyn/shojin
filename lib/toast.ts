import { create } from "zustand";

export type ToastTone = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "tone" | "duration"> & {
    tone?: ToastTone;
    duration?: number;
  }) => number;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    counter += 1;
    const id = counter;
    const toast: Toast = {
      id,
      message: t.message,
      tone: t.tone ?? "default",
      action: t.action,
      // Give people longer to hit an Undo action than to read a plain confirmation.
      duration: t.duration ?? (t.action ? 6000 : 3000),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Imperative helpers usable outside React (store actions, event handlers). */
export const toast = {
  show: (message: string, opts?: { tone?: ToastTone; action?: ToastAction; duration?: number }) =>
    useToasts.getState().push({ message, ...opts }),
  success: (message: string, opts?: { action?: ToastAction; duration?: number }) =>
    useToasts.getState().push({ message, tone: "success", ...opts }),
  error: (message: string, opts?: { action?: ToastAction; duration?: number }) =>
    useToasts.getState().push({ message, tone: "error", ...opts }),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
