"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { deleteWorkout } from "@/lib/db";
import { confirmDialog } from "@/lib/dialog";
import { toast } from "@/lib/toast";
import { convertWeight } from "@/lib/units";
import { Eyebrow, Icon } from "./ShojinUI";

function fmtDuration(s: number | null) {
  if (!s) return null;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function fmtK(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

export function History({ onStart, onNew }: { onStart: () => void; onNew: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const exercises = useStore((s) => s.exercises);
  const startEdit = useStore((s) => s.startEdit);
  const startFromWorkout = useStore((s) => s.startFromWorkout);
  const draft = useStore((s) => s.draft);
  const unit = useStore((s) => s.profile?.unit ?? "kg");
  const refreshWorkouts = useStore((s) => s.refreshWorkouts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { allWorkouts, totalVolume } = useMemo(() => {
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const allWorkouts = [...workouts]
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
      .map((w) => {
        const seen = new Set<string>();
        const exerciseNames: string[] = [];
        let volume = 0;
        for (const s of w.sets) {
          if (!s.is_warmup) volume += convertWeight(s.weight, s.unit ?? "kg", unit) * s.reps;
          if (!seen.has(s.exercise_id)) {
            seen.add(s.exercise_id);
            const ex = exMap.get(s.exercise_id);
            if (ex) exerciseNames.push(ex.name);
          }
        }
        const d = new Date(w.performed_at);
        const workingSetCount = w.sets.filter((s) => !s.is_warmup && s.completed).length;
        return {
          ...w,
          exerciseNames,
          workingSetCount,
          volume,
          dow: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
          dnum: String(d.getDate()).padStart(2, "0"),
        };
      });
    const totalVolume = allWorkouts.reduce((sum, w) => sum + w.volume, 0);
    return { allWorkouts, totalVolume };
  }, [workouts, exercises, unit]);

  async function withReplaceGuard(action: () => void) {
    if (draft) {
      const ok = await confirmDialog({
        title: "Replace workout in progress?",
        message: "You have an unfinished workout. Starting this one will discard it.",
        confirmLabel: "Replace",
        cancelLabel: "Keep current",
        danger: true,
      });
      if (!ok) return;
    }
    action();
    onStart();
  }

  function editWorkout(w: (typeof allWorkouts)[number]) {
    withReplaceGuard(() => startEdit(w));
  }

  function repeatWorkout(w: (typeof allWorkouts)[number]) {
    withReplaceGuard(() => startFromWorkout(w));
  }

  async function removeWorkout(id: string, name: string) {
    const ok = await confirmDialog({
      title: "Delete workout?",
      message: `“${name}” will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteWorkout(id);
      await refreshWorkouts();
      toast.success(`Deleted “${name}”.`);
    } catch {
      toast.error("Couldn't delete workout.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-extrabold tracking-[-0.025em]">History</h1>
      </div>

      {allWorkouts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[28px] border border-line-2 bg-surface p-8 text-center shadow-[var(--rp-shadow-sm)]">
          <p className="text-sm text-ink-soft">No workouts logged yet.</p>
          <button
            onClick={onNew}
            className="flex items-center gap-2 rounded-full bg-amber px-5 py-2.5 text-sm font-bold text-on-amber"
          >
            <Icon name="play" size={15} color="var(--color-on-amber)" />
            Start a workout
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Eyebrow>{allWorkouts.length} SESSIONS</Eyebrow>
            <div className="font-mono text-xs text-ink-soft">{fmtK(totalVolume)} {unit} total</div>
          </div>

          <ul className="flex flex-col gap-3">
            {allWorkouts.map((w) => {
              const dur = fmtDuration(w.duration_seconds);
              return (
                <li
                  key={w.id}
                  className="rounded-[28px] border border-line-2 bg-surface p-4 shadow-[var(--rp-shadow-sm)]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-10 shrink-0 flex-col items-center">
                      <div className="rp-eyebrow" style={{ fontSize: 10 }}>{w.dow}</div>
                      <div className="font-mono text-xl font-bold leading-tight text-ink">{w.dnum}</div>
                    </div>
                    <div className="w-px self-stretch bg-line-2" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[16.5px] font-bold tracking-[-0.015em] text-ink">{w.name}</span>
                      <div className="mt-1 font-mono text-[11.5px] text-ink-faint">
                        {w.workingSetCount} sets{dur ? ` · ${dur}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold text-ink">{fmtK(w.volume)}</div>
                      <div className="rp-eyebrow" style={{ fontSize: 9 }}>{unit.toUpperCase()}</div>
                    </div>
                  </div>

                  {w.exerciseNames.length > 0 && (
                    <p className="mt-2.5 truncate font-mono text-[11px] text-ink-faint">
                      {w.exerciseNames.join(" · ")}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2 border-t border-line-2 pt-3">
                    <button
                      onClick={() => editWorkout(w)}
                      className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => repeatWorkout(w)}
                      className="flex items-center gap-1.5 rounded-full bg-green-soft px-4 py-1.5 text-sm font-semibold text-green-ink"
                    >
                      <Icon name="play" size={13} color="currentColor" />
                      Repeat
                    </button>
                    <button
                      onClick={() => removeWorkout(w.id, w.name)}
                      disabled={deletingId === w.id}
                      aria-label={`Delete ${w.name}`}
                      className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-danger-soft disabled:opacity-40"
                      title="Delete workout"
                    >
                      {deletingId === w.id ? "…" : <Icon name="trash" size={17} color="currentColor" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
