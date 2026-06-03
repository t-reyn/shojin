"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available — visual flash still fires */
  }
}

export function RestTimer({ bottomOffset }: { bottomOffset?: string } = {}) {
  const rest = useStore((s) => s.rest);
  const startRest = useStore((s) => s.startRest);
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
      beep();
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
          "flex items-center gap-3 rounded-xl border border-ember/50 bg-surface-2/95 p-3 shadow-lg backdrop-blur",
          done ? "timer-done" : "",
        ].join(" ")}
      >
        <div className="font-mono text-2xl tabular-nums text-ember">
          {done ? "Rest done" : `${mm}:${ss}`}
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-ember transition-[width] duration-200"
            style={{ width: `${done ? 0 : pct}%` }}
          />
        </div>
        <button
          onClick={() => startRest(remaining + 15)}
          className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft hover:text-ink"
        >
          +15s
        </button>
        <button
          onClick={stopRest}
          className="rounded-md bg-ember px-3 py-1 text-sm font-medium text-night"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
