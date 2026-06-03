"use client";

import { useEffect } from "react";
import { useToasts, type Toast } from "@/lib/toast";

const TONE_RING: Record<Toast["tone"], string> = {
  default: "border-line",
  success: "border-mint/50",
  error: "border-danger/60",
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);

  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div
      role="status"
      className={[
        "pointer-events-auto flex items-center gap-3 rounded-xl border bg-surface-2/95 px-4 py-3 shadow-lg backdrop-blur",
        TONE_RING[toast.tone],
      ].join(" ")}
    >
      <span className="flex-1 text-sm text-ink">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            dismiss(toast.id);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-ember hover:text-ember-soft"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-ink-faint hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex w-full max-w-md flex-col gap-2 px-3">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
