"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/lib/dialog";

export function DialogHost() {
  const active = useDialog((s) => s.active);
  const setActive = useDialog((s) => s.set);

  function close(result: boolean | string | null) {
    if (!active) return;
    active.resolve(result as never);
    setActive(null);
  }

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(active!.kind === "prompt" ? null : false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const cancelResult = active.kind === "prompt" ? null : false;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={() => close(cancelResult)}
      role="dialog"
      aria-modal="true"
      aria-label={active.title}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{active.title}</h2>
        {active.message && (
          <p className="mt-1.5 text-sm text-ink-soft">{active.message}</p>
        )}

        {active.kind === "prompt" ? (
          <PromptBody
            key={active.id}
            defaultValue={active.defaultValue}
            placeholder={active.placeholder}
            confirmLabel={active.confirmLabel}
            onCancel={() => close(null)}
            onConfirm={(v) => close(v)}
          />
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => close(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:text-ink"
            >
              {active.cancelLabel}
            </button>
            <ConfirmButton
              danger={active.danger}
              label={active.confirmLabel}
              onClick={() => close(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmButton({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={[
        "rounded-lg px-4 py-2 text-sm font-semibold",
        danger
          ? "bg-danger text-night hover:bg-danger-soft"
          : "bg-ember text-night hover:bg-ember-soft",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function PromptBody({
  defaultValue,
  placeholder,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  defaultValue: string;
  placeholder?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onConfirm(value.trim());
  }

  return (
    <form onSubmit={submit} className="mt-4">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-night px-3 py-2 text-ink outline-none focus:border-ember"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-night hover:bg-ember-soft disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
