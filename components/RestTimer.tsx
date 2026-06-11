"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { playBeep } from "@/lib/audio";

export function RestTimer({ bottomOffset }: { bottomOffset?: string } = {}) {
  const rest = useStore((s) => s.rest);
  const adjustRest = useStore((s) => s.adjustRest);
  const stopRest = useStore((s) => s.stopRest);
  // Lazy init seeds the clock once at mount; the interval below keeps it fresh.
  const [now, setNow] = useState(() => Date.now());
  const beepedRef = useRef(false);

  const active = rest.endsAt !== null;
  const remainingMs = rest.endsAt ? rest.endsAt - now : 0;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const done = active && remainingMs <= 0;

  useEffect(() => {
    if (!active) return;
    beepedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active, rest.endsAt]);

  useEffect(() => {
    if (done && !beepedRef.current) {
      beepedRef.current = true;
      playBeep();
      const id = setTimeout(() => stopRest(), 2500);
      return () => clearTimeout(id);
    }
  }, [done, stopRest]);

  if (!active) return null;

  const pct = rest.duration > 0 ? (remaining / rest.duration) * 100 : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-x-0 z-[60] mx-auto w-full max-w-3xl px-3"
      style={{ bottom: bottomOffset ?? "calc(env(safe-area-inset-bottom) + 8.5rem)" }}
    >
      <div
        className={[
          "overflow-hidden rounded-xl border border-ember/50 bg-surface-2/95 shadow-lg backdrop-blur",
          done ? "timer-done" : "",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="font-mono text-2xl tabular-nums text-ember">
            {done ? "Rest done" : `${mm}:${ss}`}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => adjustRest(-15)}
            aria-label="Subtract 15 seconds"
            className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft hover:text-ink"
          >
            −15s
          </button>
          <button
            onClick={() => adjustRest(15)}
            aria-label="Add 15 seconds"
            className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft hover:text-ink"
          >
            +15s
          </button>
          <button
            onClick={stopRest}
            className="rounded-md bg-ember px-3 py-1 text-sm font-medium text-on-accent"
          >
            Skip
          </button>
        </div>
        {/* Countdown bar — spans full card width, sits flush at bottom */}
        <div className="h-2 w-full bg-line">
          <div
            className="h-full transition-[width] duration-200"
            style={{
              width: `${done ? 0 : Math.min(100, pct)}%`,
              backgroundColor: pct > 40 ? "var(--color-ember)" : pct > 15 ? "var(--color-warn)" : "var(--color-danger)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
